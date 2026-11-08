#!/usr/bin/env node
/**
 * Verifier CLI: mint a tip-bound, Ed25519-signed Shipping seal (#47 / #58).
 *
 * Requires HEBMU_SEAL_MINT_KEY. Never writes unsigned JSON.
 * Assert/land use HEBMU_SEAL_VERIFY_KEY only — never this mint material.
 *
 * Usage:
 *   node scripts/seal-shipping.mjs --gen-keys
 *   export HEBMU_SEAL_MINT_KEY='…'
 *   npm run seal-shipping -- --owner … --repo … --pr <n> --verdict PASS
 *   node scripts/seal-shipping.mjs --self-test
 */
import { spawnSync } from "node:child_process";
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
    get() {
      throw new Error("seal-shipping: mint store is write-only");
    },
  };
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
    const got = store.get({
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
      forgeStore.get({ owner: "o", repo: "r", pr: 58 }) === null,
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
      forgeStore.get({ owner: "o", repo: "r", pr: 58 }) === null,
    );

    forgeStore.putRawForTest(forgeRandomSigWireForTest(tipMatchingPass));
    assertSelf(
      "lander-mintable forged sig → get null",
      forgeStore.get({ owner: "o", repo: "r", pr: 58 }) === null,
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
      forgeStore.get({ owner: "o", repo: "r", pr: 58 }) === null,
    );

    // True verifier mint still allows
    const bound = mintVerifierBoundAttestation(tipMatchingPass, mintKey);
    forgeStore.put(bound);
    const verified = forgeStore.get({ owner: "o", repo: "r", pr: 58 });
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
 * @returns {number}
 */
export function main(argv) {
  if (argv.includes("--self-test")) {
    runSealSelfTest();
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
  const mintKey = loadSealMintKeyFromEnv(process.env);
  sealShipping(request, {
    resolveHeadRefOid: defaultResolveHeadRefOid,
    store: createMintFsStore(defaultSealedShippingDir(REPO_ROOT)),
    mintKey,
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
