#!/usr/bin/env node
/**
 * Fail-closed land helper (#46 / #47).
 *
 * Always runs ./scripts/watch-pr --assert-merge before gh pr merge.
 * Observe READY/STATUS exit 0 is never merge clearance.
 * On ci-only, assert reads a verifier-bound sealed-shipping artifact
 * (seal-shipping CLI + HEBMU_SEAL_HMAC_KEY); bare --shipping-verdict is
 * rejected at parse.
 *
 * Usage:
 *   npm run land-pr -- --owner … --repo … --pr <n> [--dry-run]
 *   npm run land-pr -- --owner … --repo … --pr <n> --merge-override <who> --merge-override-reason <why>
 *   node scripts/land-pr.mjs --self-test
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { stdoutHasHebmuClearance } from "./clearance-presence.mjs";

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
 * @param {PrTarget} target
 * @param {AssertPassthrough} passthrough
 * @returns {Promise<ProcResult>}
 */
export async function defaultRunAssert(target, passthrough) {
  const argv = buildAssertArgv(target, passthrough);
  const r = spawnSync(WATCH_PR, argv, {
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
