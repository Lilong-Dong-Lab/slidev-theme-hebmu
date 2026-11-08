#!/usr/bin/env node
/**
 * Verifier CLI: seal a Shipping verdict bound to the PR tip headRefOid (#47).
 *
 * Usage:
 *   npm run seal-shipping -- --owner … --repo … --pr <n> --verdict PASS
 *   npm run seal-shipping -- --owner … --repo … --pr <n> --verdict PASS --head-ref-oid <sha>
 *   node scripts/seal-shipping.mjs --self-test
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  createFsStore,
  createMemoryStore,
  defaultSealedShippingDir,
  parseSealedShippingArtifact,
} from "./attestation-store.mjs";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(SCRIPT_DIR, "..");

/**
 * @typedef {import("./attestation-store.mjs").SealedShippingArtifact} SealedShippingArtifact
 * @typedef {import("./attestation-store.mjs").AttestationStore} AttestationStore
 *
 * @typedef {{
 *   owner: string;
 *   repo: string;
 *   pr: number;
 *   verdict: "PASS" | "FAIL";
 *   headRefOid?: string;
 *   by?: string;
 * }} SealRequest
 *
 * @typedef {{
 *   resolveHeadRefOid: (target: {
 *     owner: string;
 *     repo: string;
 *     pr: number;
 *   }) => string;
 *   store: AttestationStore;
 *   nowIso?: () => string;
 *   io?: { stdout: (s: string) => void; stderr: (s: string) => void };
 * }} SealDeps
 */

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
 * @returns {SealRequest}
 */
export function parseSealArgv(argv) {
  const owner = flagValue(argv, "--owner");
  const repo = flagValue(argv, "--repo");
  const prRaw = flagValue(argv, "--pr");
  const verdict = flagValue(argv, "--verdict");
  const headRefOid = flagValue(argv, "--head-ref-oid");
  const by = flagValue(argv, "--by");

  if (!owner || !repo || prRaw === undefined) {
    throw new Error(
      "seal-shipping: require --owner <org> --repo <name> --pr <n>",
    );
  }
  const pr = Number.parseInt(prRaw, 10);
  if (!Number.isInteger(pr) || pr <= 0) {
    throw new Error(`seal-shipping: --pr must be a positive integer, got ${prRaw}`);
  }
  if (verdict !== "PASS" && verdict !== "FAIL") {
    throw new Error(
      "seal-shipping: --verdict must be PASS or FAIL",
    );
  }

  /** @type {SealRequest} */
  const req = { owner, repo, pr, verdict };
  if (headRefOid) req.headRefOid = headRefOid;
  if (by) req.by = by;
  return req;
}

/**
 * @param {{ owner: string; repo: string; pr: number }} target
 * @returns {string}
 */
export function defaultResolveHeadRefOid(target) {
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
  if (r.status !== 0) {
    throw new Error(
      `seal-shipping: gh pr view failed: ${(r.stderr || r.stdout || "").trim() || `exit ${r.status}`}`,
    );
  }
  const parsed = JSON.parse(r.stdout);
  if (typeof parsed.headRefOid !== "string" || !parsed.headRefOid) {
    throw new Error("seal-shipping: gh pr view did not return headRefOid");
  }
  return parsed.headRefOid;
}

/**
 * @param {SealRequest} request
 * @param {SealDeps} deps
 * @returns {SealedShippingArtifact}
 */
export function sealShipping(request, deps) {
  const headRefOid =
    request.headRefOid ??
    deps.resolveHeadRefOid({
      owner: request.owner,
      repo: request.repo,
      pr: request.pr,
    });
  const nowIso = deps.nowIso ?? (() => new Date().toISOString());
  /** @type {SealedShippingArtifact} */
  const artifact = parseSealedShippingArtifact({
    schema: "hebmu.sealed-shipping.v1",
    owner: request.owner,
    repo: request.repo,
    pr: request.pr,
    headRefOid,
    verdict: request.verdict,
    sealedAt: nowIso(),
    ...(request.by ? { by: request.by } : {}),
  });
  deps.store.put(artifact);
  const io = deps.io ?? {
    stdout: (s) => process.stdout.write(s),
    stderr: (s) => process.stderr.write(s),
  };
  io.stderr(
    `seal-shipping: sealed ${artifact.verdict} for ${artifact.owner}/${artifact.repo}#${artifact.pr} @ ${artifact.headRefOid}\n`,
  );
  return artifact;
}

/**
 * @param {string} label
 * @param {boolean} ok
 */
function assertSelf(label, ok) {
  if (!ok) throw new Error(`seal-shipping --self-test failed: ${label}`);
  console.log(`ok  ${label}`);
}

/**
 * @returns {void}
 */
export function runSealSelfTest() {
  const store = createMemoryStore();
  const oidA = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  const oidB = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
  const silent = { stdout: () => {}, stderr: () => {} };

  {
    let resolved = "";
    const artifact = sealShipping(
      {
        owner: "Lilong-Dong-Lab",
        repo: "slidev-theme-hebmu",
        pr: 47,
        verdict: "PASS",
      },
      {
        resolveHeadRefOid: () => {
          resolved = oidA;
          return oidA;
        },
        store,
        nowIso: () => "2026-11-08T00:00:00.000Z",
        io: silent,
      },
    );
    assertSelf("resolver returned oid used in artifact", artifact.headRefOid === oidA);
    assertSelf("resolver was invoked when oid omitted", resolved === oidA);
    const got = store.get({
      owner: "Lilong-Dong-Lab",
      repo: "slidev-theme-hebmu",
      pr: 47,
    });
    assertSelf("memory get round-trip schema", got?.schema === "hebmu.sealed-shipping.v1");
    assertSelf("memory get preserves headRefOid", got?.headRefOid === oidA);
    assertSelf("memory get preserves PASS", got?.verdict === "PASS");
  }

  {
    sealShipping(
      {
        owner: "Lilong-Dong-Lab",
        repo: "slidev-theme-hebmu",
        pr: 47,
        verdict: "PASS",
        headRefOid: oidB,
      },
      {
        resolveHeadRefOid: () => {
          throw new Error("should not resolve when --head-ref-oid given");
        },
        store,
        nowIso: () => "2026-11-08T01:00:00.000Z",
        io: silent,
      },
    );
    const got = store.get({
      owner: "Lilong-Dong-Lab",
      repo: "slidev-theme-hebmu",
      pr: 47,
    });
    assertSelf("re-seal overwrites prior oid", got?.headRefOid === oidB);
    assertSelf("old oid no longer stored", got?.headRefOid !== oidA);
  }

  {
    let threw = false;
    try {
      parseSealArgv(["--owner", "o", "--repo", "r", "--pr", "1"]);
    } catch {
      threw = true;
    }
    assertSelf("parse requires --verdict", threw);
  }

  console.log("ok  seal-shipping self-test passed");
}

/**
 * @param {readonly string[]} argv
 * @returns {number}
 */
export function main(argv) {
  if (argv.includes("--self-test")) {
    runSealSelfTest();
    return 0;
  }

  const request = parseSealArgv(argv);
  const store = createFsStore(defaultSealedShippingDir(REPO_ROOT));
  sealShipping(request, {
    resolveHeadRefOid: defaultResolveHeadRefOid,
    store,
  });
  return 0;
}

const isDirectRun =
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === process.argv[1];

if (isDirectRun) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  }
}
