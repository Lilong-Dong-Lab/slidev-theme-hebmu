#!/usr/bin/env node
/**
 * Fail-closed land helper (#46 / #47 / #59 / #66).
 *
 * Always runs ./scripts/watch-pr --assert-merge before gh pr merge.
 * Observe READY/STATUS exit 0 is never merge clearance.
 * On ci-only, assert requires check-run provenance (v4 Actions OIDC seal);
 * local Ed25519 seals are demoted and cannot clear. Bare --shipping-verdict
 * is rejected at parse. Last-observe reads verify under HEBMU_OBSERVE_VERIFY_KEY.
 * Assert child env never inherits HEBMU_SEAL_MINT_KEY or HEBMU_OBSERVE_MINT_KEY.
 *
 * Usage:
 *   npm run land-pr -- --owner … --repo … --pr <n> [--dry-run]
 *   npm run land-pr -- --owner … --repo … --pr <n> --merge-override <who> --merge-override-reason <why>
 *   node scripts/land-pr.mjs --self-test
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  HEBMU_SEAL_MINT_KEY_ENV,
} from "./attestation-crypto.mjs";
import {
  HEBMU_OBSERVE_MINT_KEY_ENV,
  generateObserveKeyPairForTest,
  loadObserveVerifyKeyFromEnv,
  mintObserveBoundReceipt,
  refuseObserveMintKeyInLandEnv,
} from "./observe-crypto.mjs";
import { stdoutHasHebmuClearance } from "./clearance-presence.mjs";
import { evaluateLastObservePreflight } from "./last-observe-preflight.mjs";
import {
  buildLastObserveClaims,
  createVerifyingFsLastObserveStore,
  createVerifyingMemoryLastObserveStore,
  defaultLastObserveDir,
} from "./last-observe-store.mjs";

/** Self-test observe pair — not production secrets. */
const SELF_TEST_OBSERVE_KEYS = generateObserveKeyPairForTest();
const SELF_TEST_OBSERVE_MINT_KEY = SELF_TEST_OBSERVE_KEYS.mintKey;
const SELF_TEST_OBSERVE_VERIFY_KEY = SELF_TEST_OBSERVE_KEYS.verifyKey;

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(SCRIPT_DIR, "..");
const WATCH_PR = join(SCRIPT_DIR, "watch-pr");

/**
 * @typedef {{
 *   owner: string;
 *   repo: string;
 *   pr: number;
 * }} PrTarget
 *
 * @typedef {{
 *   argvTail: readonly string[];
 * }} AssertPassthrough
 *
 * @typedef {{
 *   readonly __brand: "LandPermit";
 *   readonly target: PrTarget;
 *   readonly assertedAtMs: number;
 * }} LandPermit
 *
 * @typedef {{
 *   kind: "allow";
 *   permit: LandPermit;
 * } | {
 *   kind: "deny";
 *   exitCode: number;
 *   detail?: string;
 * }} AssertGateResult
 *
 * @typedef {{
 *   target: PrTarget;
 *   passthrough: AssertPassthrough;
 *   dryRun: boolean;
 *   mergeArgs: readonly string[];
 * }} LandRequest
 *
 * @typedef {{
 *   exitCode: number;
 *   stdout: string;
 *   stderr: string;
 * }} ProcResult
 *
 * @typedef {{
 *   runAssert: (target: PrTarget, passthrough: AssertPassthrough) => Promise<ProcResult>;
 *   runMerge: (permit: LandPermit, mergeArgs: readonly string[]) => Promise<ProcResult>;
 *   readLastObserveReceipt: (
 *     target: PrTarget,
 *   ) => import("./last-observe-store.mjs").LastObserveReceipt | null;
 *   resolveHeadRefOid: (target: PrTarget) => Promise<string | null>;
 *   io?: { stdout: (s: string) => void; stderr: (s: string) => void };
 *   nowMs?: () => number;
 * }} LandDeps
 */

const LAND_VALUE_FLAGS = new Set([
  "--owner",
  "--repo",
  "--pr",
  "--merge-override",
  "--merge-override-reason",
]);

/** @type {string} */
export const LAND_SHIPPING_VERDICT_REMOVED =
  "land-pr: --shipping-verdict removed; run seal-shipping after Shipping VERDICT PASS, then land-pr (or use --merge-override)";

const LAND_BOOL_FLAGS = new Set([
  "--dry-run",
  "--self-test",
  "--pretty",
  "--assert-merge",
  "--status-only",
]);

/**
 * @param {readonly string[]} argv
 * @param {string} flag
 * @returns {string | undefined}
 */
function flagValue(argv, flag) {
  const i = argv.indexOf(flag);
  if (i < 0 || i + 1 >= argv.length) return undefined;
  const v = argv[i + 1];
  if (v.startsWith("--")) return undefined;
  return v;
}

/**
 * @param {readonly string[]} argv
 * @returns {LandRequest}
 */
export function parseLandArgv(argv) {
  const owner = flagValue(argv, "--owner");
  const repo = flagValue(argv, "--repo");
  const prRaw = flagValue(argv, "--pr");

  if (!owner || !repo || prRaw === undefined) {
    throw new Error(
      "land-pr: require --owner <org> --repo <name> --pr <n>",
    );
  }

  const pr = Number.parseInt(prRaw, 10);
  if (!Number.isInteger(pr) || pr <= 0) {
    throw new Error(`land-pr: --pr must be a positive integer, got ${prRaw}`);
  }

  if (argv.includes("--shipping-verdict")) {
    throw new Error(LAND_SHIPPING_VERDICT_REMOVED);
  }

  /** @type {string[]} */
  const argvTail = [];
  if (argv.includes("--pretty")) argvTail.push("--pretty");

  const overrideBy = flagValue(argv, "--merge-override");
  const overrideReason = flagValue(argv, "--merge-override-reason");
  if (
    argv.includes("--merge-override") ||
    argv.includes("--merge-override-reason")
  ) {
    if (!overrideBy || !overrideReason) {
      throw new Error(
        "land-pr: --merge-override and --merge-override-reason both required",
      );
    }
    argvTail.push("--merge-override", overrideBy);
    argvTail.push("--merge-override-reason", overrideReason);
  }

  /** @type {string[]} */
  const mergeArgs = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    if (LAND_BOOL_FLAGS.has(a)) continue;
    if (LAND_VALUE_FLAGS.has(a)) {
      i += 1;
      continue;
    }
    mergeArgs.push(a);
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith("--")) {
      mergeArgs.push(next);
      i += 1;
    }
  }

  return {
    target: { owner, repo, pr },
    passthrough: { argvTail },
    dryRun: argv.includes("--dry-run"),
    mergeArgs,
  };
}

/**
 * @param {PrTarget} target
 * @param {AssertPassthrough} passthrough
 * @returns {string[]}
 */
export function buildAssertArgv(target, passthrough) {
  return [
    "--assert-merge",
    "--status-only",
    "--owner",
    target.owner,
    "--repo",
    target.repo,
    "--pr",
    String(target.pr),
    ...passthrough.argvTail,
  ];
}

/**
 * Exit 0 is necessary but not sufficient. Clearance markers must appear in
 * assert stdout (pretty header or hebmu.clearance.v1 sidecar).
 *
 * @param {{
 *   target: PrTarget;
 *   exitCode: number;
 *   stdout: string;
 *   stderr?: string;
 *   clock: { nowMs: () => number };
 * }} args
 * @returns {AssertGateResult}
 */
export function mintPermitFromAssertSession(args) {
  if (!stdoutHasHebmuClearance(args.stdout)) {
    return {
      kind: "deny",
      exitCode: 4,
      detail: "hebmu-missing-clearance",
    };
  }
  if (args.exitCode !== 0) {
    return {
      kind: "deny",
      exitCode: args.exitCode,
      detail: `assert exit ${args.exitCode}`,
    };
  }
  return {
    kind: "allow",
    permit: {
      __brand: "LandPermit",
      target: args.target,
      assertedAtMs: args.clock.nowMs(),
    },
  };
}

/**
 * Assert child must be verify-only: scrub seal + observe mint even if the
 * land shell still has them after seal/observe-then-land in one session.
 *
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} env
 * @returns {NodeJS.ProcessEnv}
 */
export function scrubMintKeyFromAssertEnv(env) {
  /** @type {NodeJS.ProcessEnv} */
  const out = { ...env };
  delete out[HEBMU_SEAL_MINT_KEY_ENV];
  delete out[HEBMU_OBSERVE_MINT_KEY_ENV];
  return out;
}

/**
 * @param {PrTarget} target
 * @param {AssertPassthrough} passthrough
 * @returns {Promise<ProcResult>}
 */
export async function defaultRunAssert(target, passthrough) {
  const argv = buildAssertArgv(target, passthrough);
  const r = spawnSync(WATCH_PR, argv, {
    encoding: "utf8",
    cwd: REPO_ROOT,
    env: scrubMintKeyFromAssertEnv(process.env),
  });
  return {
    exitCode: r.status === null ? 1 : r.status,
    stdout: r.stdout ?? "",
    stderr: r.stderr ?? "",
  };
}

/**
 * @param {LandPermit} permit
 * @param {readonly string[]} mergeArgs
 * @returns {Promise<ProcResult>}
 */
export async function defaultRunMerge(permit, mergeArgs) {
  const ghArgv = [
    "pr",
    "merge",
    String(permit.target.pr),
    "--repo",
    `${permit.target.owner}/${permit.target.repo}`,
    ...mergeArgs,
  ];
  const r = spawnSync("gh", ghArgv, {
    encoding: "utf8",
    cwd: REPO_ROOT,
    env: process.env,
  });
  return {
    exitCode: r.status === null ? 1 : r.status,
    stdout: r.stdout ?? "",
    stderr: r.stderr ?? "",
  };
}

/**
 * Best-effort live tip for last-observe preflight. Never throws — null
 * fails closed as tip-unbound.
 *
 * @param {PrTarget} target
 * @returns {Promise<string | null>}
 */
export async function defaultLandResolveHeadRefOid(target) {
  try {
    const r = spawnSync(
      "gh",
      [
        "pr",
        "view",
        String(target.pr),
        "--repo",
        `${target.owner}/${target.repo}`,
        "--json",
        "headRefOid",
      ],
      { encoding: "utf8", cwd: REPO_ROOT, env: process.env },
    );
    if (r.status !== 0) return null;
    const parsed = JSON.parse(r.stdout ?? "{}");
    return typeof parsed.headRefOid === "string" && parsed.headRefOid
      ? parsed.headRefOid
      : null;
  } catch {
    return null;
  }
}

/**
 * @param {PrTarget} target
 * @returns {import("./last-observe-store.mjs").LastObserveReceipt | null}
 */
export function defaultReadLastObserveReceipt(target) {
  refuseObserveMintKeyInLandEnv(process.env);
  return createVerifyingFsLastObserveStore(
    defaultLastObserveDir(REPO_ROOT),
    loadObserveVerifyKeyFromEnv(process.env),
  ).get(target);
}

/**
 * @param {LandRequest} request
 * @param {LandDeps} deps
 * @returns {Promise<number>}
 */
export async function landPr(request, deps) {
  const io = deps.io ?? {
    stdout: (s) => process.stdout.write(s),
    stderr: (s) => process.stderr.write(s),
  };
  const nowMs = deps.nowMs ?? Date.now;

  const tipOid = await deps.resolveHeadRefOid(request.target);
  const receipt = deps.readLastObserveReceipt(request.target);
  const pre = evaluateLastObservePreflight({ receipt, tipOid });
  if (pre.kind === "deny") {
    io.stderr(
      `land-pr: ${pre.detail} (exit ${pre.exitCode}); assert skipped\n`,
    );
    return pre.exitCode;
  }

  const assertResult = await deps.runAssert(
    request.target,
    request.passthrough,
  );
  if (assertResult.stdout) io.stdout(assertResult.stdout);
  if (assertResult.stderr) io.stderr(assertResult.stderr);

  const gate = mintPermitFromAssertSession({
    target: request.target,
    exitCode: assertResult.exitCode,
    stdout: assertResult.stdout,
    stderr: assertResult.stderr,
    clock: { nowMs },
  });

  if (gate.kind === "deny") {
    io.stderr(
      `land-pr: assert denied (exit ${gate.exitCode}); merge skipped\n`,
    );
    return gate.exitCode;
  }

  if (request.dryRun) {
    io.stderr(
      `land-pr: dry-run allow; would merge PR #${gate.permit.target.pr}\n`,
    );
    return 0;
  }

  const mergeResult = await deps.runMerge(gate.permit, request.mergeArgs);
  if (mergeResult.stdout) io.stdout(mergeResult.stdout);
  if (mergeResult.stderr) io.stderr(mergeResult.stderr);
  return mergeResult.exitCode;
}

/**
 * @param {string} label
 * @param {boolean} ok
 */
function assertSelf(label, ok) {
  if (!ok) throw new Error(`land-pr --self-test failed: ${label}`);
  console.log(`ok  ${label}`);
}

/**
 * @returns {Promise<void>}
 */
export async function runLandSelfTest() {
  const target = { owner: "Lilong-Dong-Lab", repo: "slidev-theme-hebmu", pr: 46 };
  const silentIo = { stdout: () => {}, stderr: () => {} };
  const clock = { nowMs: () => 1_700_000_000_000 };
  const TIP = "cccccccccccccccccccccccccccccccccccccccc";

  function clearedObserveDeps() {
    const store = createVerifyingMemoryLastObserveStore(
      SELF_TEST_OBSERVE_VERIFY_KEY,
    );
    store.put(
      mintObserveBoundReceipt(
        buildLastObserveClaims({
          target,
          presence: {
            kind: "present",
            verdictKind: "READY",
          },
          upstreamExit: 0,
          headRefOid: TIP,
          observedAt: "2026-11-08T13:00:00.000Z",
        }),
        SELF_TEST_OBSERVE_MINT_KEY,
      ),
    );
    return {
      readLastObserveReceipt: (t) => store.get(t),
      resolveHeadRefOid: async () => TIP,
    };
  }

  {
    const withoutFlag = parseLandArgv([
      "--owner",
      target.owner,
      "--repo",
      target.repo,
      "--pr",
      "46",
    ]);
    assertSelf(
      "caller argv without --assert-merge stays out of passthrough",
      !withoutFlag.passthrough.argvTail.includes("--assert-merge"),
    );
    const injected = buildAssertArgv(
      withoutFlag.target,
      withoutFlag.passthrough,
    );
    assertSelf(
      "buildAssertArgv injects --assert-merge when caller omitted it",
      injected[0] === "--assert-merge" && injected.includes("--status-only"),
    );
  }

  {
    const req = parseLandArgv([
      "--owner",
      target.owner,
      "--repo",
      target.repo,
      "--pr",
      "46",
      "--assert-merge",
      "--status-only",
      "--pretty",
    ]);
    const argv = buildAssertArgv(req.target, req.passthrough);
    assertSelf(
      "caller-supplied --assert-merge still injects once at head",
      argv[0] === "--assert-merge" &&
        argv.filter((a) => a === "--assert-merge").length === 1,
    );
    assertSelf(
      "happy-path passthrough has no shipping-verdict",
      !argv.includes("--shipping-verdict") &&
        req.passthrough.argvTail.filter((a) => a !== "--pretty").length === 0,
    );
  }

  {
    let rejected = false;
    try {
      parseLandArgv([
        "--owner",
        target.owner,
        "--repo",
        target.repo,
        "--pr",
        "46",
        "--shipping-verdict",
        "PASS",
      ]);
    } catch (err) {
      rejected =
        err instanceof Error && err.message === LAND_SHIPPING_VERDICT_REMOVED;
    }
    assertSelf("parse rejects --shipping-verdict PASS", rejected);
  }

  {
    const req = parseLandArgv([
      "--owner",
      target.owner,
      "--repo",
      target.repo,
      "--pr",
      "46",
      "--merge-override",
      "alice",
      "--merge-override-reason",
      "emergency",
    ]);
    const argv = buildAssertArgv(req.target, req.passthrough);
    assertSelf(
      "override passthrough reaches assert argv",
      argv.includes("--merge-override") &&
        argv.includes("alice") &&
        argv.includes("--merge-override-reason") &&
        argv.includes("emergency"),
    );
  }

  const bareReadyStdout = [
    "READY: no merge conflicts, no unresolved review threads, no failing or pending checks",
    "mergeStateStatus=CLEAN",
    "reviewDecision=null",
    "isDraft=false",
    "",
  ].join("\n");

  const enrichedStdout = [
    bareReadyStdout.trimEnd(),
    "--- hebmu clearance ---",
    "reviewClearance=approved",
    "protection=unprotected",
    "",
  ].join("\n");

  /**
   * @param {number} assertExit
   * @param {{ dryRun?: boolean; mergeExit?: number; stdout?: string }} opts
   */
  async function runCase(assertExit, opts = {}) {
    let mergeCalls = 0;
    /** @type {LandPermit | null} */
    let lastPermit = null;
    const exit = await landPr(
      {
        target,
        passthrough: { argvTail: [] },
        dryRun: Boolean(opts.dryRun),
        mergeArgs: ["--squash"],
      },
      {
        io: silentIo,
        nowMs: clock.nowMs,
        ...clearedObserveDeps(),
        runAssert: async () => ({
          exitCode: assertExit,
          stdout: opts.stdout ?? enrichedStdout,
          stderr: "",
        }),
        runMerge: async (permit, mergeArgs) => {
          mergeCalls += 1;
          lastPermit = permit;
          assertSelf(
            "runMerge received branded LandPermit",
            permit.__brand === "LandPermit",
          );
          assertSelf(
            "runMerge received mergeArgs",
            mergeArgs.includes("--squash"),
          );
          return {
            exitCode: opts.mergeExit ?? 0,
            stdout: "",
            stderr: "",
          };
        },
      },
    );
    return { exit, mergeCalls, lastPermit };
  }

  {
    const r = await runCase(2);
    assertSelf("assert exit 2 → land exit 2", r.exit === 2);
    assertSelf("assert exit 2 → merge NOT called", r.mergeCalls === 0);
  }

  {
    const r = await runCase(3);
    assertSelf("assert exit 3 → land exit 3", r.exit === 3);
    assertSelf("assert exit 3 → merge NOT called", r.mergeCalls === 0);
  }

  {
    const r = await runCase(1);
    assertSelf("assert exit 1 → land exit 1 (fail closed)", r.exit === 1);
    assertSelf("assert exit 1 → merge NOT called", r.mergeCalls === 0);
  }

  {
    const r = await runCase(0, { dryRun: true });
    assertSelf("assert exit 0 dry-run → land exit 0", r.exit === 0);
    assertSelf("assert exit 0 dry-run → merge NOT called", r.mergeCalls === 0);
  }

  {
    const r = await runCase(0, { mergeExit: 0 });
    assertSelf("assert exit 0 live → merge called once", r.mergeCalls === 1);
    assertSelf("assert exit 0 live + merge 0 → land exit 0", r.exit === 0);
    assertSelf(
      "live allow minted LandPermit for target",
      r.lastPermit !== null &&
        r.lastPermit.target.pr === target.pr &&
        r.lastPermit.__brand === "LandPermit",
    );
  }

  {
    const r = await runCase(0, { mergeExit: 1 });
    assertSelf("assert exit 0 live + merge 1 → land exit 1", r.exit === 1);
    assertSelf("merge failure still called merge once", r.mergeCalls === 1);
  }

  {
    const r = await runCase(0, { stdout: bareReadyStdout });
    assertSelf("exit 0 + bare READY stdout → land exit 4", r.exit === 4);
    assertSelf("exit 0 + bare READY → merge NOT called", r.mergeCalls === 0);
  }

  {
    const denyBare = mintPermitFromAssertSession({
      target,
      exitCode: 0,
      stdout: bareReadyStdout,
      clock,
    });
    assertSelf(
      "mintPermitFromAssertSession exit 0 + bare → deny/4",
      denyBare.kind === "deny" && denyBare.exitCode === 4,
    );
    const denyDisp = mintPermitFromAssertSession({
      target,
      exitCode: 2,
      stdout: enrichedStdout,
      clock,
    });
    assertSelf(
      "mintPermitFromAssertSession enriched exit 2 → deny/2",
      denyDisp.kind === "deny" && denyDisp.exitCode === 2,
    );
    const allow = mintPermitFromAssertSession({
      target,
      exitCode: 0,
      stdout: enrichedStdout,
      clock,
    });
    assertSelf(
      "mintPermitFromAssertSession exit 0 + enriched → allow",
      allow.kind === "allow" && allow.permit.__brand === "LandPermit",
    );
  }

  {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync(new URL("./land-pr.mjs", import.meta.url), "utf8");
    const legacyMint = ["mintPermit", "FromAssertExit"].join("");
    assertSelf("exit-only assert mint removed", !src.includes(legacyMint));
  }

  {
    const scrubbed = scrubMintKeyFromAssertEnv({
      HEBMU_SEAL_MINT_KEY: "must-not-forward",
      HEBMU_SEAL_VERIFY_KEY: "keep-verify",
      PATH: "/usr/bin",
    });
    assertSelf(
      "#58 scrubMintKeyFromAssertEnv drops mint",
      scrubbed.HEBMU_SEAL_MINT_KEY === undefined,
    );
    assertSelf(
      "#58 scrubMintKeyFromAssertEnv keeps verify",
      scrubbed.HEBMU_SEAL_VERIFY_KEY === "keep-verify",
    );
    assertSelf(
      "#58 scrubMintKeyFromAssertEnv keeps PATH",
      scrubbed.PATH === "/usr/bin",
    );
    assertSelf(
      "#58 defaultRunAssert uses scrubMintKeyFromAssertEnv",
      defaultRunAssert
        .toString()
        .includes("scrubMintKeyFromAssertEnv"),
    );
  }

  {
    let assertCalls = 0;
    /** @type {string[]} */
    const err = [];
    const exitMissing = await landPr(
      {
        target,
        passthrough: { argvTail: [] },
        dryRun: true,
        mergeArgs: [],
      },
      {
        io: {
          stdout: () => {},
          stderr: (s) => err.push(s),
        },
        nowMs: clock.nowMs,
        readLastObserveReceipt: () => null,
        resolveHeadRefOid: async () => TIP,
        runAssert: async () => {
          assertCalls += 1;
          throw new Error("runAssert must not run");
        },
        runMerge: async () => {
          throw new Error("runMerge must not run");
        },
      },
    );
    assertSelf("missing last-observe → land exit 4", exitMissing === 4);
    assertSelf("missing last-observe → runAssert not called", assertCalls === 0);
    assertSelf(
      "missing last-observe stderr detail",
      err.join("").includes("hebmu-last-observe-missing"),
    );
  }

  {
    let assertCalls = 0;
    const store = createVerifyingMemoryLastObserveStore(
      SELF_TEST_OBSERVE_VERIFY_KEY,
    );
    store.put(
      mintObserveBoundReceipt(
        buildLastObserveClaims({
          target,
          presence: { kind: "absent" },
          upstreamExit: 0,
          headRefOid: TIP,
          observedAt: "2026-11-08T13:00:00.000Z",
          verdictKind: "READY",
        }),
        SELF_TEST_OBSERVE_MINT_KEY,
      ),
    );
    const exitBare = await landPr(
      {
        target,
        passthrough: { argvTail: [] },
        dryRun: true,
        mergeArgs: [],
      },
      {
        io: silentIo,
        nowMs: clock.nowMs,
        readLastObserveReceipt: (t) => store.get(t),
        resolveHeadRefOid: async () => TIP,
        runAssert: async () => {
          assertCalls += 1;
          throw new Error("runAssert must not run");
        },
        runMerge: async () => ({ exitCode: 0, stdout: "", stderr: "" }),
      },
    );
    assertSelf(
      "bare last-observe (markersPresent false) → land exit 4",
      exitBare === 4,
    );
    assertSelf("bare last-observe → runAssert not called", assertCalls === 0);

    const preBare = evaluateLastObservePreflight({
      receipt: store.get(target),
      tipOid: TIP,
    });
    assertSelf(
      "preflight bare detail lacked-clearance",
      preBare.kind === "deny" &&
        preBare.detail === "hebmu-last-observe-lacked-clearance",
    );
  }

  {
    const store = createVerifyingMemoryLastObserveStore(
      SELF_TEST_OBSERVE_VERIFY_KEY,
    );
    store.put(
      mintObserveBoundReceipt(
        buildLastObserveClaims({
          target,
          presence: {
            kind: "present",
            verdictKind: "READY",
          },
          upstreamExit: 0,
          headRefOid: null,
          observedAt: "2026-11-08T13:00:00.000Z",
        }),
        SELF_TEST_OBSERVE_MINT_KEY,
      ),
    );
    const preUnbound = evaluateLastObservePreflight({
      receipt: store.get(target),
      tipOid: TIP,
    });
    assertSelf(
      "cleared receipt with null tip → tip-unbound",
      preUnbound.kind === "deny" &&
        preUnbound.detail === "hebmu-last-observe-tip-unbound",
    );

    store.put(
      mintObserveBoundReceipt(
        buildLastObserveClaims({
          target,
          presence: {
            kind: "present",
            verdictKind: "READY",
          },
          upstreamExit: 0,
          headRefOid: TIP,
          observedAt: "2026-11-08T13:00:00.000Z",
        }),
        SELF_TEST_OBSERVE_MINT_KEY,
      ),
    );
    const preStale = evaluateLastObservePreflight({
      receipt: store.get(target),
      tipOid: "dddddddddddddddddddddddddddddddddddddddd",
    });
    assertSelf(
      "tip mismatch → tip-stale",
      preStale.kind === "deny" &&
        preStale.detail === "hebmu-last-observe-tip-stale",
    );
  }

  {
    let assertCalls = 0;
    const store = createVerifyingMemoryLastObserveStore(
      SELF_TEST_OBSERVE_VERIFY_KEY,
    );
    store.put(
      mintObserveBoundReceipt(
        buildLastObserveClaims({
          target,
          presence: {
            kind: "present",
            verdictKind: "READY",
          },
          upstreamExit: 0,
          headRefOid: TIP,
          observedAt: "2026-11-08T13:00:00.000Z",
        }),
        SELF_TEST_OBSERVE_MINT_KEY,
      ),
    );
    const exitOk = await landPr(
      {
        target,
        passthrough: { argvTail: [] },
        dryRun: true,
        mergeArgs: [],
      },
      {
        io: silentIo,
        nowMs: clock.nowMs,
        readLastObserveReceipt: (t) => store.get(t),
        resolveHeadRefOid: async () => TIP,
        runAssert: async () => {
          assertCalls += 1;
          return {
            exitCode: 0,
            stdout: enrichedStdout,
            stderr: "",
          };
        },
        runMerge: async () => ({ exitCode: 0, stdout: "", stderr: "" }),
      },
    );
    assertSelf(
      "good receipt + tip match → continues to assert (dry-run 0)",
      exitOk === 0 && assertCalls === 1,
    );
  }

  {
    const scrubbedObs = scrubMintKeyFromAssertEnv({
      HEBMU_OBSERVE_MINT_KEY: "must-not-forward-observe",
      HEBMU_SEAL_VERIFY_KEY: "keep-verify",
    });
    assertSelf(
      "#59 scrubMintKeyFromAssertEnv drops observe mint",
      scrubbedObs.HEBMU_OBSERVE_MINT_KEY === undefined,
    );
  }

  console.log("ok  land-pr self-test passed");
}

/**
 * @param {readonly string[]} argv
 * @returns {Promise<number>}
 */
export async function main(argv) {
  if (argv.includes("--self-test")) {
    await runLandSelfTest();
    return 0;
  }

  const request = parseLandArgv(argv);
  return landPr(request, {
    runAssert: defaultRunAssert,
    runMerge: defaultRunMerge,
    readLastObserveReceipt: defaultReadLastObserveReceipt,
    resolveHeadRefOid: defaultLandResolveHeadRefOid,
  });
}

const isDirectRun =
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === process.argv[1];

if (isDirectRun) {
  main(process.argv.slice(2))
    .then((code) => {
      process.exitCode = code;
    })
    .catch((err) => {
      console.error(err instanceof Error ? err.message : err);
      process.exitCode = 1;
    });
}
