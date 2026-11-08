#!/usr/bin/env node
/**
 * Verifier CLI: mint a tip-bound, HMAC-signed Shipping seal (#47 / #52).
 *
 * Requires HEBMU_SEAL_HMAC_KEY. Never writes unsigned JSON.
 *
 * Usage:
 *   export HEBMU_SEAL_HMAC_KEY='…'
 *   npm run seal-shipping -- --owner … --repo … --pr <n> --verdict PASS
 *   npm run seal-shipping -- --owner … --repo … --pr <n> --verdict PASS --head-ref-oid <sha>
 *   node scripts/seal-shipping.mjs --self-test
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  loadVerifierSigningKeyFromEnv,
  mintVerifierBoundAttestation,
  signingKeyFromTestSecret,
  verifySealedShippingWire,
} from "./attestation-mac.mjs";
import {
  createVerifyingFsStore,
  createVerifyingMemoryStore,
  defaultSealedShippingDir,
} from "./attestation-store.mjs";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(SCRIPT_DIR, "..");

/**
 * @typedef {import("./attestation-mac.mjs").VerifierBoundAttestation} VerifierBoundAttestation
 * @typedef {import("./attestation-mac.mjs").VerifierSigningKey} VerifierSigningKey
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
 *   signingKey: VerifierSigningKey;
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
 * @returns {VerifierBoundAttestation}
 */
export function sealShipping(request, deps) {
  if (!deps.signingKey || deps.signingKey.__brand !== "VerifierSigningKey") {
    throw new Error("seal-shipping: signingKey required (HEBMU_SEAL_HMAC_KEY)");
  }
  const headRefOid =
    request.headRefOid ??
    deps.resolveHeadRefOid({
      owner: request.owner,
      repo: request.repo,
      pr: request.pr,
    });
  const nowIso = deps.nowIso ?? (() => new Date().toISOString());
  /** @type {import("./attestation-mac.mjs").ShippingClaims} */
  const claims = {
    owner: request.owner,
    repo: request.repo,
    pr: request.pr,
    headRefOid,
    verdict: request.verdict,
    sealedAt: nowIso(),
  };
  if (request.by) claims.by = request.by;

  const bound = mintVerifierBoundAttestation(claims, deps.signingKey);
  deps.store.put(bound);
  const io = deps.io ?? {
    stdout: (s) => process.stdout.write(s),
    stderr: (s) => process.stderr.write(s),
  };
  io.stderr(
    `seal-shipping: sealed ${bound.claims.verdict} for ${bound.claims.owner}/${bound.claims.repo}#${bound.claims.pr} @ ${bound.claims.headRefOid}\n`,
  );
  return bound;
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
  const key = signingKeyFromTestSecret("hebmu-seal-self-test-key");
  const store = createVerifyingMemoryStore(key);
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
        signingKey: key,
        nowIso: () => "2026-11-08T00:00:00.000Z",
        io: silent,
      },
    );
    assertSelf("resolver returned oid used in artifact", artifact.claims.headRefOid === oidA);
    assertSelf("resolver was invoked when oid omitted", resolved === oidA);
    assertSelf("minted schema is v2", artifact.schema === "hebmu.sealed-shipping.v2");
    assertSelf("minted brand is verifier-bound", artifact.__brand === "VerifierBoundAttestation");
    const got = store.get({
      owner: "Lilong-Dong-Lab",
      repo: "slidev-theme-hebmu",
      pr: 47,
    });
    assertSelf("memory get round-trip schema", got?.schema === "hebmu.sealed-shipping.v2");
    assertSelf("memory get preserves headRefOid", got?.claims.headRefOid === oidA);
    assertSelf("memory get preserves PASS", got?.claims.verdict === "PASS");
    assertSelf("memory get returns branded attestation", got?.__brand === "VerifierBoundAttestation");
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
        signingKey: key,
        nowIso: () => "2026-11-08T01:00:00.000Z",
        io: silent,
      },
    );
    const got = store.get({
      owner: "Lilong-Dong-Lab",
      repo: "slidev-theme-hebmu",
      pr: 47,
    });
    assertSelf("re-seal overwrites prior oid", got?.claims.headRefOid === oidB);
    assertSelf("old oid no longer stored", got?.claims.headRefOid !== oidA);
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

  {
    let threw = false;
    try {
      sealShipping(
        {
          owner: "o",
          repo: "r",
          pr: 1,
          verdict: "PASS",
          headRefOid: oidA,
        },
        {
          resolveHeadRefOid: () => oidA,
          store,
          signingKey: /** @type {any} */ (undefined),
          nowIso: () => "2026-11-08T00:00:00.000Z",
          io: silent,
        },
      );
    } catch {
      threw = true;
    }
    assertSelf("seal without signingKey throws (never unsigned write)", threw);
  }

  {
    const forgeStore = createVerifyingMemoryStore(key);
    forgeStore.putRawForTest({
      schema: "hebmu.sealed-shipping.v2",
      owner: "o",
      repo: "r",
      pr: 52,
      headRefOid: oidA,
      verdict: "PASS",
      sealedAt: "2026-11-08T00:00:00.000Z",
      // lander-mintable unsigned JSON — no mac
    });
    assertSelf(
      "lander-mintable unsigned JSON → get null",
      forgeStore.get({ owner: "o", repo: "r", pr: 52 }) === null,
    );

    forgeStore.putRawForTest({
      schema: "hebmu.sealed-shipping.v1",
      owner: "o",
      repo: "r",
      pr: 52,
      headRefOid: oidA,
      verdict: "PASS",
      sealedAt: "2026-11-08T00:00:00.000Z",
    });
    assertSelf(
      "lander-mintable v1 unsigned JSON → get null",
      forgeStore.get({ owner: "o", repo: "r", pr: 52 }) === null,
    );

    forgeStore.putRawForTest({
      schema: "hebmu.sealed-shipping.v2",
      owner: "o",
      repo: "r",
      pr: 52,
      headRefOid: oidA,
      verdict: "PASS",
      sealedAt: "2026-11-08T00:00:00.000Z",
      mac: "deadbeef".repeat(8),
    });
    assertSelf(
      "lander-mintable forged mac → get null",
      forgeStore.get({ owner: "o", repo: "r", pr: 52 }) === null,
    );

    const bound = mintVerifierBoundAttestation(
      {
        owner: "o",
        repo: "r",
        pr: 52,
        headRefOid: oidA,
        verdict: "PASS",
        sealedAt: "2026-11-08T00:00:00.000Z",
      },
      key,
    );
    forgeStore.put(bound);
    const verified = forgeStore.get({ owner: "o", repo: "r", pr: 52 });
    assertSelf(
      "verifier-signed matching OID → get branded",
      verified?.__brand === "VerifierBoundAttestation" &&
        verified.claims.headRefOid === oidA,
    );
    assertSelf(
      "verifySealedShippingWire accepts minted wire",
      verifySealedShippingWire(
        {
          schema: "hebmu.sealed-shipping.v2",
          owner: "o",
          repo: "r",
          pr: 52,
          headRefOid: oidA,
          verdict: "PASS",
          sealedAt: "2026-11-08T00:00:00.000Z",
          mac: bound.mac,
        },
        key,
      ) !== null,
    );
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
  const signingKey = loadVerifierSigningKeyFromEnv(process.env);
  const store = createVerifyingFsStore(
    defaultSealedShippingDir(REPO_ROOT),
    signingKey,
  );
  sealShipping(request, {
    resolveHeadRefOid: defaultResolveHeadRefOid,
    store,
    signingKey,
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
