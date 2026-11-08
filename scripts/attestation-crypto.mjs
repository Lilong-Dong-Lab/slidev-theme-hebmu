#!/usr/bin/env node
/**
 * Ed25519 mint/verify split for sealed-shipping (#58).
 *
 * SealMintKey (PKCS8 private) mints; SealVerifyKey (SPKI public) verifies.
 * Shared HEBMU_SEAL_HMAC_KEY is migration-rejected — it cannot mint accept-able wire.
 */
import {
  createHmac,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  sign,
  verify,
} from "node:crypto";

/** @type {string} */
export const SEALED_SHIPPING_SCHEMA_V3 = "hebmu.sealed-shipping.v3";

/** Legacy schema — forge-for-reject only; verify always returns null. */
export const SEALED_SHIPPING_SCHEMA_V2 = "hebmu.sealed-shipping.v2";

/** @type {string} */
export const HEBMU_SEAL_MINT_KEY_ENV = "HEBMU_SEAL_MINT_KEY";

/** @type {string} */
export const HEBMU_SEAL_VERIFY_KEY_ENV = "HEBMU_SEAL_VERIFY_KEY";

/**
 * @deprecated Rejected by loaders; named for migration errors + self-tests.
 * @type {string}
 */
export const HEBMU_SEAL_HMAC_KEY_ENV = "HEBMU_SEAL_HMAC_KEY";

/**
 * @typedef {"PASS" | "FAIL"} ShippingVerdict
 *
 * @typedef {{
 *   owner: string;
 *   repo: string;
 *   pr: number;
 *   headRefOid: string;
 *   verdict: ShippingVerdict;
 *   sealedAt: string;
 *   by?: string;
 * }} ShippingClaims
 *
 * @typedef {{
 *   readonly __brand: "SealMintKey";
 *   readonly privateKeyDer: Buffer;
 * }} SealMintKey
 *
 * @typedef {{
 *   readonly __brand: "SealVerifyKey";
 *   readonly publicKeyDer: Buffer;
 * }} SealVerifyKey
 *
 * @typedef {{
 *   readonly __brand: "VerifierBoundAttestation";
 *   readonly schema: "hebmu.sealed-shipping.v3";
 *   readonly claims: ShippingClaims;
 *   readonly sig: string;
 * }} VerifierBoundAttestation
 */

/**
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} env
 */
function refuseHmacMigration(env) {
  const hmac = env[HEBMU_SEAL_HMAC_KEY_ENV];
  if (typeof hmac === "string" && hmac) {
    throw new Error(
      `attestation-crypto: ${HEBMU_SEAL_HMAC_KEY_ENV} is retired (#58); ` +
        `use ${HEBMU_SEAL_MINT_KEY_ENV} (seal) and ${HEBMU_SEAL_VERIFY_KEY_ENV} (assert/land)`,
    );
  }
}

/**
 * @param {Buffer} privateKeyDer
 * @returns {SealMintKey}
 */
function brandMintKey(privateKeyDer) {
  return {
    __brand: "SealMintKey",
    privateKeyDer,
  };
}

/**
 * @param {Buffer} publicKeyDer
 * @returns {SealVerifyKey}
 */
function brandVerifyKey(publicKeyDer) {
  return {
    __brand: "SealVerifyKey",
    publicKeyDer,
  };
}

/**
 * Stable claim serialization for mint and verify (same field order as #52).
 *
 * @param {ShippingClaims} claims
 * @returns {Buffer}
 */
export function canonicalClaimsBytes(claims) {
  /** @type {Record<string, string | number>} */
  const ordered = {
    owner: claims.owner,
    repo: claims.repo,
    pr: claims.pr,
    headRefOid: claims.headRefOid,
    verdict: claims.verdict,
    sealedAt: claims.sealedAt,
  };
  if (typeof claims.by === "string" && claims.by) {
    ordered.by = claims.by;
  }
  return Buffer.from(JSON.stringify(ordered), "utf8");
}

/**
 * @returns {{ mintKey: SealMintKey, verifyKey: SealVerifyKey }}
 */
export function generateSealKeyPairForTest() {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  return {
    mintKey: brandMintKey(
      privateKey.export({ type: "pkcs8", format: "der" }),
    ),
    verifyKey: brandVerifyKey(
      publicKey.export({ type: "spki", format: "der" }),
    ),
  };
}

/**
 * @param {SealMintKey} mintKey
 * @returns {string}
 */
export function encodeMintKeyForEnv(mintKey) {
  if (!mintKey || mintKey.__brand !== "SealMintKey") {
    throw new Error("attestation-crypto: encodeMintKeyForEnv requires SealMintKey");
  }
  return mintKey.privateKeyDer.toString("base64");
}

/**
 * @param {SealVerifyKey} verifyKey
 * @returns {string}
 */
export function encodeVerifyKeyForEnv(verifyKey) {
  if (!verifyKey || verifyKey.__brand !== "SealVerifyKey") {
    throw new Error(
      "attestation-crypto: encodeVerifyKeyForEnv requires SealVerifyKey",
    );
  }
  return verifyKey.publicKeyDer.toString("base64");
}

/**
 * Assert/land must not hold mint material.
 *
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} env
 */
export function refuseSealMintKeyInAssertEnv(env) {
  const mint = env[HEBMU_SEAL_MINT_KEY_ENV];
  if (typeof mint === "string" && mint) {
    throw new Error(
      `attestation-crypto: ${HEBMU_SEAL_MINT_KEY_ENV} must not be set in assert/land env; ` +
        `unset mint before land (verify-only: ${HEBMU_SEAL_VERIFY_KEY_ENV})`,
    );
  }
}

/**
 * PKCS8 Ed25519 private only. HMAC env → migration error.
 *
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} env
 * @returns {SealMintKey}
 */
export function loadSealMintKeyFromEnv(env) {
  refuseHmacMigration(env);
  const raw = env[HEBMU_SEAL_MINT_KEY_ENV];
  if (typeof raw !== "string" || !raw) {
    throw new Error(
      `attestation-crypto: ${HEBMU_SEAL_MINT_KEY_ENV} required (Ed25519 PKCS8 private, base64)`,
    );
  }
  let der;
  try {
    der = Buffer.from(raw, "base64");
  } catch {
    throw new Error(
      `attestation-crypto: ${HEBMU_SEAL_MINT_KEY_ENV} must be base64 PKCS8`,
    );
  }
  let keyObject;
  try {
    keyObject = createPrivateKey({ key: der, format: "der", type: "pkcs8" });
  } catch {
    throw new Error(
      `attestation-crypto: ${HEBMU_SEAL_MINT_KEY_ENV} must be PKCS8 Ed25519 private (not SPKI/public)`,
    );
  }
  if (keyObject.asymmetricKeyType !== "ed25519") {
    throw new Error(
      `attestation-crypto: ${HEBMU_SEAL_MINT_KEY_ENV} must be an Ed25519 private key`,
    );
  }
  return brandMintKey(der);
}

/**
 * SPKI Ed25519 public only. HMAC env → migration error.
 *
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} env
 * @returns {SealVerifyKey}
 */
export function loadSealVerifyKeyFromEnv(env) {
  refuseHmacMigration(env);
  const raw = env[HEBMU_SEAL_VERIFY_KEY_ENV];
  if (typeof raw !== "string" || !raw) {
    throw new Error(
      `attestation-crypto: ${HEBMU_SEAL_VERIFY_KEY_ENV} required (Ed25519 SPKI public, base64)`,
    );
  }
  let der;
  try {
    der = Buffer.from(raw, "base64");
  } catch {
    throw new Error(
      `attestation-crypto: ${HEBMU_SEAL_VERIFY_KEY_ENV} must be base64 SPKI`,
    );
  }
  let keyObject;
  try {
    keyObject = createPublicKey({ key: der, format: "der", type: "spki" });
  } catch {
    throw new Error(
      `attestation-crypto: ${HEBMU_SEAL_VERIFY_KEY_ENV} must be SPKI Ed25519 public (not PKCS8/private)`,
    );
  }
  if (keyObject.asymmetricKeyType !== "ed25519") {
    throw new Error(
      `attestation-crypto: ${HEBMU_SEAL_VERIFY_KEY_ENV} must be an Ed25519 public key`,
    );
  }
  return brandVerifyKey(der);
}

/**
 * @param {ShippingClaims} claims
 * @returns {ShippingClaims}
 */
function normalizeClaims(claims) {
  if (!claims || typeof claims !== "object") {
    throw new Error("attestation-crypto: claims required");
  }
  if (typeof claims.owner !== "string" || !claims.owner) {
    throw new Error("attestation-crypto: owner required");
  }
  if (typeof claims.repo !== "string" || !claims.repo) {
    throw new Error("attestation-crypto: repo required");
  }
  if (!Number.isInteger(claims.pr) || claims.pr <= 0) {
    throw new Error("attestation-crypto: pr must be a positive integer");
  }
  if (typeof claims.headRefOid !== "string" || !claims.headRefOid) {
    throw new Error("attestation-crypto: headRefOid required");
  }
  if (claims.verdict !== "PASS" && claims.verdict !== "FAIL") {
    throw new Error("attestation-crypto: verdict must be PASS or FAIL");
  }
  if (typeof claims.sealedAt !== "string" || !claims.sealedAt) {
    throw new Error("attestation-crypto: sealedAt required");
  }

  /** @type {ShippingClaims} */
  const normalized = {
    owner: claims.owner,
    repo: claims.repo,
    pr: claims.pr,
    headRefOid: claims.headRefOid,
    verdict: claims.verdict,
    sealedAt: claims.sealedAt,
  };
  if (typeof claims.by === "string" && claims.by) {
    normalized.by = claims.by;
  }
  return normalized;
}

/**
 * @param {ShippingClaims} claims
 * @param {SealMintKey} mintKey
 * @returns {VerifierBoundAttestation}
 */
export function mintVerifierBoundAttestation(claims, mintKey) {
  if (!mintKey || mintKey.__brand !== "SealMintKey") {
    throw new Error("attestation-crypto: mint requires SealMintKey");
  }
  const normalized = normalizeClaims(claims);
  const privateKey = createPrivateKey({
    key: mintKey.privateKeyDer,
    format: "der",
    type: "pkcs8",
  });
  const sig = sign(null, canonicalClaimsBytes(normalized), privateKey).toString(
    "hex",
  );
  return {
    __brand: "VerifierBoundAttestation",
    schema: SEALED_SHIPPING_SCHEMA_V3,
    claims: normalized,
    sig,
  };
}

/**
 * Wire → domain. Untrusted disk: bad/missing sig, v2 mac schema, wrong key → null.
 *
 * @param {unknown} raw
 * @param {SealVerifyKey} verifyKey
 * @returns {VerifierBoundAttestation | null}
 */
export function verifySealedShippingWire(raw, verifyKey) {
  if (!verifyKey || verifyKey.__brand !== "SealVerifyKey") {
    return null;
  }
  if (!raw || typeof raw !== "object") return null;
  const rec = /** @type {Record<string, unknown>} */ (raw);
  if (rec.schema !== SEALED_SHIPPING_SCHEMA_V3) return null;
  if (typeof rec.sig !== "string" || !rec.sig) return null;
  if (typeof rec.owner !== "string" || !rec.owner) return null;
  if (typeof rec.repo !== "string" || !rec.repo) return null;
  const pr = Number(rec.pr);
  if (!Number.isInteger(pr) || pr <= 0) return null;
  if (typeof rec.headRefOid !== "string" || !rec.headRefOid) return null;
  if (rec.verdict !== "PASS" && rec.verdict !== "FAIL") return null;
  if (typeof rec.sealedAt !== "string" || !rec.sealedAt) return null;

  /** @type {ShippingClaims} */
  const claims = {
    owner: rec.owner,
    repo: rec.repo,
    pr,
    headRefOid: rec.headRefOid,
    verdict: rec.verdict,
    sealedAt: rec.sealedAt,
  };
  if (typeof rec.by === "string" && rec.by) claims.by = rec.by;

  let sigBuf;
  try {
    sigBuf = Buffer.from(rec.sig, "hex");
  } catch {
    return null;
  }
  if (sigBuf.length !== 64) return null;

  let publicKey;
  try {
    publicKey = createPublicKey({
      key: verifyKey.publicKeyDer,
      format: "der",
      type: "spki",
    });
  } catch {
    return null;
  }

  let ok = false;
  try {
    ok = verify(null, canonicalClaimsBytes(claims), publicKey, sigBuf);
  } catch {
    return null;
  }
  if (!ok) return null;

  return {
    __brand: "VerifierBoundAttestation",
    schema: SEALED_SHIPPING_SCHEMA_V3,
    claims,
    sig: rec.sig,
  };
}

/**
 * Flatten branded domain value to on-disk wire shape.
 *
 * @param {VerifierBoundAttestation} artifact
 * @returns {Record<string, string | number>}
 */
export function sealedShippingWireFromBound(artifact) {
  if (!artifact || artifact.__brand !== "VerifierBoundAttestation") {
    throw new Error(
      "attestation-crypto: wire export requires VerifierBoundAttestation",
    );
  }
  /** @type {Record<string, string | number>} */
  const wire = {
    schema: SEALED_SHIPPING_SCHEMA_V3,
    owner: artifact.claims.owner,
    repo: artifact.claims.repo,
    pr: artifact.claims.pr,
    headRefOid: artifact.claims.headRefOid,
    verdict: artifact.claims.verdict,
    sealedAt: artifact.claims.sealedAt,
    sig: artifact.sig,
  };
  if (artifact.claims.by) wire.by = artifact.claims.by;
  return wire;
}

/**
 * Tip-matching v2 HMAC wire a lander could mint with HEBMU_SEAL_HMAC_KEY.
 * Prove verify / store.get returns null (#58).
 *
 * @param {ShippingClaims} claims
 * @param {string} hmacSecret
 * @returns {Record<string, string | number>}
 */
export function forgeLegacyHmacWireForTest(claims, hmacSecret) {
  const normalized = normalizeClaims(claims);
  const mac = createHmac("sha256", Buffer.from(hmacSecret, "utf8"))
    .update(canonicalClaimsBytes(normalized))
    .digest("hex");
  /** @type {Record<string, string | number>} */
  const wire = {
    schema: SEALED_SHIPPING_SCHEMA_V2,
    owner: normalized.owner,
    repo: normalized.repo,
    pr: normalized.pr,
    headRefOid: normalized.headRefOid,
    verdict: normalized.verdict,
    sealedAt: normalized.sealedAt,
    mac,
  };
  if (normalized.by) wire.by = normalized.by;
  return wire;
}

/**
 * Tip-matching v3 claims with a garbage sig (not mintable from verify-only).
 *
 * @param {ShippingClaims} claims
 * @returns {Record<string, string | number>}
 */
export function forgeRandomSigWireForTest(claims) {
  const normalized = normalizeClaims(claims);
  /** @type {Record<string, string | number>} */
  const wire = {
    schema: SEALED_SHIPPING_SCHEMA_V3,
    owner: normalized.owner,
    repo: normalized.repo,
    pr: normalized.pr,
    headRefOid: normalized.headRefOid,
    verdict: normalized.verdict,
    sealedAt: normalized.sealedAt,
    sig: "00".repeat(64),
  };
  if (normalized.by) wire.by = normalized.by;
  return wire;
}
