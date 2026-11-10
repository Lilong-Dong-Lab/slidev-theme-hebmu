#!/usr/bin/env node
/**
 * Verifier CLI: mint tip-bound Shipping seals (#47 / #58 / #66).
 *
 * PASS seals: prefer --via-actions (Actions OIDC + check-run; no host mint key).
 * Local Ed25519 mint (HEBMU_SEAL_MINT_KEY) remains for tests / FAIL seals and
 * is demoted by policy (cannot clear ci-only).
 *
 * Usage:
 *   node scripts/seal-shipping.mjs --gen-keys
 *   npm run seal-shipping -- --owner … --repo … --pr <n> --verdict PASS --via-actions
 *   export HEBMU_SEAL_MINT_KEY='…'   # local / FAIL path
 *   npm run seal-shipping -- --owner … --repo … --pr <n> --verdict FAIL
 *   node scripts/seal-shipping.mjs --self-test
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  encodeMintKeyForEnv,
  encodeVerifyKeyForEnv,
  forgeLegacyHmacWireForTest,
  forgeRandomSigWireForTest,
  generateSealKeyPairForTest,
  loadSealMintKeyFromEnv,
  loadSealVerifyKeyFromEnv,
  mintVerifierBoundAttestation,
  sealedShippingWireFromBound,
  verifySealedShippingWire,
  HEBMU_SEAL_HMAC_KEY_ENV,
  HEBMU_SEAL_MINT_KEY_ENV,
  HEBMU_SEAL_VERIFY_KEY_ENV,
  SEALED_SHIPPING_SCHEMA_V3,
} from "./attestation-crypto.mjs";
import {
  createVerifyingMemoryStore,
  defaultSealedShippingDir,
  putBoundAttestation,
} from "./attestation-store.mjs";
import {
  createGhIdentityVerifier,
  verifyCheckRunSealWire,
} from "./check-run-crypto.mjs";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(SCRIPT_DIR, "..");

/**
 * @typedef {import("./attestation-crypto.mjs").VerifierBoundAttestation} VerifierBoundAttestation
 * @typedef {import("./attestation-crypto.mjs").SealMintKey} SealMintKey
 * @typedef {import("./attestation-store.mjs").AttestationStore} AttestationStore
 *
 * @typedef {{
 *   owner: string;
 *   repo: string;
 *   pr: number;
 *   verdict: "PASS" | "FAIL";
 *   headRefOid?: string;
 *   by?: string;
 *   viaActions?: boolean;
 * }} SealRequest
 *
 * @typedef {{
 *   resolveHeadRefOid: (target: {
 *     owner: string;
 *     repo: string;
 *     pr: number;
 *   }) => string;
 *   store: AttestationStore;
 *   mintKey: SealMintKey;
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
  const viaActions = argv.includes("--via-actions");

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
  if (viaActions) req.viaActions = true;
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
  if (!deps.mintKey || deps.mintKey.__brand !== "SealMintKey") {
    throw new Error(
      `seal-shipping: mintKey required (${HEBMU_SEAL_MINT_KEY_ENV})`,
    );
  }
  const headRefOid =
    request.headRefOid ??
    deps.resolveHeadRefOid({
      owner: request.owner,
      repo: request.repo,
      pr: request.pr,
    });
  const nowIso = deps.nowIso ?? (() => new Date().toISOString());
  /** @type {import("./attestation-crypto.mjs").ShippingClaims} */
  const claims = {
    owner: request.owner,
    repo: request.repo,
    pr: request.pr,
    headRefOid,
    verdict: request.verdict,
    sealedAt: nowIso(),
  };
  if (request.by) claims.by = request.by;

  const bound = mintVerifierBoundAttestation(claims, deps.mintKey);
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
 * Prod FS writer used by CLI main (no verify key on mint path).
 * @param {string} rootDir
 * @returns {AttestationStore}
 */
function createMintFsStore(rootDir) {
  return {
    put(artifact) {
      putBoundAttestation(rootDir, artifact);
    },
    async get() {
      throw new Error("seal-shipping: mint store is write-only");
    },
    async classify() {
      throw new Error("seal-shipping: mint store is write-only");
    },
  };
}

/**
 * @param {string[]} args
 * @param {{ cwd?: string; env?: NodeJS.ProcessEnv }} [opts]
 * @returns {{ status: number; stdout: string; stderr: string }}
 */
function runGh(args, opts = {}) {
  const r = spawnSync("gh", args, {
    encoding: "utf8",
    cwd: opts.cwd ?? REPO_ROOT,
    env: opts.env ?? process.env,
    maxBuffer: 20 * 1024 * 1024,
  });
  return {
    status: r.status ?? 1,
    stdout: r.stdout || "",
    stderr: r.stderr || "",
  };
}

/**
 * Dispatch seal-shipping workflow, download artifact, self-verify, put store.
 *
 * @param {SealRequest} request
 * @param {{
 *   resolveHeadRefOid?: (target: { owner: string; repo: string; pr: number }) => string;
 *   storeRoot: string;
 *   io?: { stdout: (s: string) => void; stderr: (s: string) => void };
 *   sleepMs?: (ms: number) => Promise<void>;
 *   identity?: import("./check-run-crypto.mjs").SealIdentityVerifier;
 *   pollAttempts?: number;
 *   pollIntervalMs?: number;
 * }} deps
 * @returns {Promise<import("./check-run-crypto.mjs").CheckRunSealAttestation>}
 */
export async function sealShippingViaActions(request, deps) {
  const io = deps.io ?? {
    stdout: (s) => process.stdout.write(s),
    stderr: (s) => process.stderr.write(s),
  };
  const repoSlug = `${request.owner}/${request.repo}`;
  const dispatch = runGh([
    "workflow",
    "run",
    "seal-shipping.yml",
    "--repo",
    repoSlug,
    "-f",
    `pr=${request.pr}`,
    "-f",
    `verdict=${request.verdict}`,
  ]);
  if (dispatch.status !== 0) {
    throw new Error(
      `seal-shipping: workflow dispatch failed: ${(dispatch.stderr || dispatch.stdout).trim()}`,
    );
  }
  io.stderr(
    `seal-shipping: dispatched seal-shipping for ${repoSlug}#${request.pr} (${request.verdict})\n`,
  );

  const sleep =
    deps.sleepMs ??
    ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const attempts = deps.pollAttempts ?? 60;
  const intervalMs = deps.pollIntervalMs ?? 5000;

  /** @type {number | null} */
  let runId = null;
  for (let i = 0; i < attempts; i++) {
    const list = runGh([
      "run",
      "list",
      "--repo",
      repoSlug,
      "--workflow",
      "seal-shipping.yml",
      "--json",
      "databaseId,status,conclusion,event,displayTitle,createdAt",
      "--limit",
      "5",
    ]);
    if (list.status === 0) {
      try {
        const rows = JSON.parse(list.stdout);
        if (Array.isArray(rows)) {
          const hit = rows.find(
            (row) =>
              row &&
              typeof row === "object" &&
              row.event === "workflow_dispatch" &&
              (row.status === "completed" ||
                row.status === "in_progress" ||
                row.status === "queued"),
          );
          if (hit && typeof hit.databaseId === "number") {
            runId = hit.databaseId;
            if (hit.status === "completed") break;
          }
        }
      } catch {
        // keep polling
      }
    }
    await sleep(intervalMs);
  }
  if (runId === null) {
    throw new Error("seal-shipping: timed out waiting for workflow run id");
  }

  for (let i = 0; i < attempts; i++) {
    const view = runGh([
      "run",
      "view",
      String(runId),
      "--repo",
      repoSlug,
      "--json",
      "status,conclusion",
    ]);
    if (view.status === 0) {
      try {
        const parsed = JSON.parse(view.stdout);
        if (parsed.status === "completed") {
          if (parsed.conclusion !== "success") {
            throw new Error(
              `seal-shipping: workflow run ${runId} conclusion=${parsed.conclusion}`,
            );
          }
          break;
        }
      } catch (err) {
        if (
          err instanceof Error &&
          err.message.startsWith("seal-shipping: workflow run")
        ) {
          throw err;
        }
      }
    }
    if (i === attempts - 1) {
      throw new Error(
        `seal-shipping: timed out waiting for workflow run ${runId}`,
      );
    }
    await sleep(intervalMs);
  }

  const tmp = mkdtempSync(join(tmpdir(), "hebmu-seal-"));
  try {
    const dl = runGh([
      "run",
      "download",
      String(runId),
      "--repo",
      repoSlug,
      "--name",
      `sealed-shipping-${request.pr}`,
      "--dir",
      tmp,
    ]);
    if (dl.status !== 0) {
      throw new Error(
        `seal-shipping: artifact download failed: ${(dl.stderr || dl.stdout).trim()}`,
      );
    }
    const wirePath = join(tmp, `sealed-shipping-${request.pr}.json`);
    let raw;
    try {
      raw = JSON.parse(readFileSync(wirePath, "utf8"));
    } catch {
      throw new Error(
        `seal-shipping: missing artifact JSON at ${wirePath}`,
      );
    }
    const identity = deps.identity ?? createGhIdentityVerifier();
    const verified = await verifyCheckRunSealWire(raw, { identity });
    if (verified.status !== "verified") {
      throw new Error(
        `seal-shipping: downloaded seal failed identity verify (${verified.status})`,
      );
    }
    putBoundAttestation(deps.storeRoot, verified.attestation);
    io.stderr(
      `seal-shipping: placed check-run seal for ${repoSlug}#${request.pr} @ ${verified.attestation.claims.headRefOid} (run ${verified.attestation.runId})\n`,
    );
    return verified.attestation;
  } finally {
    try {
      rmSync(tmp, { recursive: true, force: true });
    } catch {
      // best-effort cleanup
    }
  }
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
 * @returns {Promise<void>}
 */
export async function runSealSelfTest() {
  const { mintKey, verifyKey } = generateSealKeyPairForTest();
  const store = createVerifyingMemoryStore(verifyKey);
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
        mintKey,
        nowIso: () => "2026-11-08T00:00:00.000Z",
        io: silent,
      },
    );
    assertSelf("resolver returned oid used in artifact", artifact.claims.headRefOid === oidA);
    assertSelf("resolver was invoked when oid omitted", resolved === oidA);
    assertSelf("minted schema is v3", artifact.schema === SEALED_SHIPPING_SCHEMA_V3);
    assertSelf("minted brand is verifier-bound", artifact.__brand === "VerifierBoundAttestation");
    const got = await store.get({
      owner: "Lilong-Dong-Lab",
      repo: "slidev-theme-hebmu",
      pr: 47,
    });
    assertSelf("memory get round-trip schema", got?.schema === SEALED_SHIPPING_SCHEMA_V3);
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
        mintKey,
        nowIso: () => "2026-11-08T01:00:00.000Z",
        io: silent,
      },
    );
    const got = await store.get({
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
          mintKey: /** @type {any} */ (undefined),
          nowIso: () => "2026-11-08T00:00:00.000Z",
          io: silent,
        },
      );
    } catch {
      threw = true;
    }
    assertSelf("seal without mintKey throws (never unsigned write)", threw);
  }

  {
    const tipMatchingPass = {
      owner: "o",
      repo: "r",
      pr: 58,
      headRefOid: oidA,
      verdict: /** @type {const} */ ("PASS"),
      sealedAt: "2026-11-08T00:00:00.000Z",
    };
    const forgeStore = createVerifyingMemoryStore(verifyKey);

    forgeStore.putRawForTest({
      schema: "hebmu.sealed-shipping.v3",
      owner: "o",
      repo: "r",
      pr: 58,
      headRefOid: oidA,
      verdict: "PASS",
      sealedAt: "2026-11-08T00:00:00.000Z",
    });
    assertSelf(
      "lander-mintable unsigned JSON → get null",
      (await forgeStore.get({ owner: "o", repo: "r", pr: 58 })) === null,
    );

    forgeStore.putRawForTest({
      schema: "hebmu.sealed-shipping.v1",
      owner: "o",
      repo: "r",
      pr: 58,
      headRefOid: oidA,
      verdict: "PASS",
      sealedAt: "2026-11-08T00:00:00.000Z",
    });
    assertSelf(
      "lander-mintable v1 unsigned JSON → get null",
      (await forgeStore.get({ owner: "o", repo: "r", pr: 58 })) === null,
    );

    forgeStore.putRawForTest(forgeRandomSigWireForTest(tipMatchingPass));
    assertSelf(
      "lander-mintable forged sig → get null",
      (await forgeStore.get({ owner: "o", repo: "r", pr: 58 })) === null,
    );

    // #58: lander-held secrets only (verify public + legacy shared HMAC)
    const landerEnv = {
      [HEBMU_SEAL_VERIFY_KEY_ENV]: encodeVerifyKeyForEnv(verifyKey),
      [HEBMU_SEAL_HMAC_KEY_ENV]: "legacy-shared-hmac-secret",
    };
    let mintLoadThrew = false;
    try {
      loadSealMintKeyFromEnv(landerEnv);
    } catch {
      mintLoadThrew = true;
    }
    assertSelf(
      "#58 lander env without mint key → loadSealMintKeyFromEnv throws",
      mintLoadThrew,
    );

    let verifyBrandMintThrew = false;
    try {
      mintVerifierBoundAttestation(
        tipMatchingPass,
        /** @type {any} */ (verifyKey),
      );
    } catch {
      verifyBrandMintThrew = true;
    }
    assertSelf(
      "#58 verify-only brand cannot mint",
      verifyBrandMintThrew,
    );

    forgeStore.putRawForTest(
      forgeLegacyHmacWireForTest(
        tipMatchingPass,
        landerEnv[HEBMU_SEAL_HMAC_KEY_ENV],
      ),
    );
    assertSelf(
      "#58 lander-with-shared-key / legacy HMAC wire → get null",
      (await forgeStore.get({ owner: "o", repo: "r", pr: 58 })) === null,
    );

    // True verifier mint still verifies at store (policy demotes local allow).
    const bound = mintVerifierBoundAttestation(tipMatchingPass, mintKey);
    forgeStore.put(bound);
    const verified = await forgeStore.get({ owner: "o", repo: "r", pr: 58 });
    assertSelf(
      "#58 verifier mint → get branded PASS",
      verified?.__brand === "VerifierBoundAttestation" &&
        verified.claims.headRefOid === oidA &&
        verified.claims.verdict === "PASS",
    );
    assertSelf(
      "#58 verifySealedShippingWire accepts minted wire",
      verifySealedShippingWire(sealedShippingWireFromBound(bound), verifyKey) !==
        null,
    );
  }

  {
    let hmacMigrationThrew = false;
    try {
      loadSealVerifyKeyFromEnv({
        [HEBMU_SEAL_VERIFY_KEY_ENV]: encodeVerifyKeyForEnv(verifyKey),
        [HEBMU_SEAL_HMAC_KEY_ENV]: "still-present",
      });
    } catch (err) {
      hmacMigrationThrew =
        err instanceof Error && err.message.includes("retired");
    }
    assertSelf(
      "#58 HEBMU_SEAL_HMAC_KEY → migration error from verify loader",
      hmacMigrationThrew,
    );

    let mintHmacThrew = false;
    try {
      loadSealMintKeyFromEnv({
        [HEBMU_SEAL_MINT_KEY_ENV]: encodeMintKeyForEnv(mintKey),
        [HEBMU_SEAL_HMAC_KEY_ENV]: "still-present",
      });
    } catch (err) {
      mintHmacThrew =
        err instanceof Error && err.message.includes("retired");
    }
    assertSelf(
      "#58 HEBMU_SEAL_HMAC_KEY → migration error from mint loader",
      mintHmacThrew,
    );

    let spkiAsMintThrew = false;
    try {
      loadSealMintKeyFromEnv({
        [HEBMU_SEAL_MINT_KEY_ENV]: encodeVerifyKeyForEnv(verifyKey),
      });
    } catch {
      spkiAsMintThrew = true;
    }
    assertSelf("#58 VERIFY SPKI rejected by mint loader", spkiAsMintThrew);

    let pkcs8AsVerifyThrew = false;
    try {
      loadSealVerifyKeyFromEnv({
        [HEBMU_SEAL_VERIFY_KEY_ENV]: encodeMintKeyForEnv(mintKey),
      });
    } catch {
      pkcs8AsVerifyThrew = true;
    }
    assertSelf("#58 MINT PKCS8 rejected by verify loader", pkcs8AsVerifyThrew);
  }

  console.log("ok  seal-shipping self-test passed");
}

/**
 * @param {readonly string[]} argv
 * @returns {Promise<number>}
 */
export async function main(argv) {
  if (argv.includes("--self-test")) {
    await runSealSelfTest();
    return 0;
  }

  if (argv.includes("--gen-keys")) {
    const { mintKey, verifyKey } = generateSealKeyPairForTest();
    process.stdout.write(
      `# One-time seal keypair (#58). Mint is verifier-only; land uses verify.\n` +
        `export ${HEBMU_SEAL_MINT_KEY_ENV}='${encodeMintKeyForEnv(mintKey)}'\n` +
        `export ${HEBMU_SEAL_VERIFY_KEY_ENV}='${encodeVerifyKeyForEnv(verifyKey)}'\n` +
        `# unset ${HEBMU_SEAL_MINT_KEY_ENV} before land-pr / --assert-merge\n`,
    );
    return 0;
  }

  const request = parseSealArgv(argv);
  if (request.viaActions) {
    await sealShippingViaActions(request, {
      resolveHeadRefOid: defaultResolveHeadRefOid,
      storeRoot: defaultSealedShippingDir(REPO_ROOT),
    });
    return 0;
  }

  const mintKey = loadSealMintKeyFromEnv(process.env);
  const io = {
    stdout: (s) => process.stdout.write(s),
    stderr: (s) => process.stderr.write(s),
  };
  sealShipping(request, {
    resolveHeadRefOid: defaultResolveHeadRefOid,
    store: createMintFsStore(defaultSealedShippingDir(REPO_ROOT)),
    mintKey,
    io,
  });
  io.stderr(
    "seal-shipping: local mint no longer clears ci-only; use --via-actions for PASS seals (#66)\n",
  );
  return 0;
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
