#!/usr/bin/env node
/**
 * Ed25519 mint/verify split for last-observe receipts (#59).
 *
 * ObserveMintKey (PKCS8 private) mints; ObserveVerifyKey (SPKI public) verifies.
 * Distinct from SealMintKey / SealVerifyKey — seal brands cannot mint or verify
 * observe wires (cross-brand refuse).
 */
import {
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  sign,
  verify,
} from "node:crypto";

/** @type {string} */
export const HEBMU_OBSERVE_MINT_KEY_ENV = "HEBMU_OBSERVE_MINT_KEY";

/** @type {string} */
export const HEBMU_OBSERVE_VERIFY_KEY_ENV = "HEBMU_OBSERVE_VERIFY_KEY";

/** @type {"hebmu.last-observe.v2"} */
export const LAST_OBSERVE_SCHEMA_V2 = "hebmu.last-observe.v2";

/** @deprecated Forge-for-reject / migration errors only. */
export const LAST_OBSERVE_SCHEMA_V1 = "hebmu.last-observe.v1";

/**
 * @typedef {{
 *   owner: string;
 *   repo: string;
 *   pr: number;
 * }} PrTarget
 *
 * @typedef {{
 *   target: PrTarget;
 *   observedAt: string;
 *   headRefOid: string | null;
 *   verdictKind: "READY" | "STATUS" | null;
 *   markersPresent: boolean;
 *   upstreamExit: number;
 * }} LastObserveClaims
 *
 * @typedef {{
 *   readonly __brand: "ObserveMintKey";
 *   readonly privateKeyDer: Buffer;
 * }} ObserveMintKey
 *
 * @typedef {{
 *   readonly __brand: "ObserveVerifyKey";
 *   readonly publicKeyDer: Buffer;
 * }} ObserveVerifyKey
 *
 * @typedef {{
 *   readonly __brand: "ObserveBoundReceipt";
 *   readonly schema: "hebmu.last-observe.v2";
 *   readonly target: PrTarget;
 *   readonly observedAt: string;
 *   readonly headRefOid: string | null;
 *   readonly verdictKind: "READY" | "STATUS" | null;
 *   readonly markersPresent: boolean;
 *   readonly upstreamExit: number;
 *   readonly sig: string;
 * }} ObserveBoundReceipt
 */

/**
 * @param {Buffer} privateKeyDer
 * @returns {ObserveMintKey}
 */
function brandMintKey(privateKeyDer) {
  return {
    __brand: "ObserveMintKey",
    privateKeyDer,
  };
}

/**
 * @param {Buffer} publicKeyDer
 * @returns {ObserveVerifyKey}
 */
function brandVerifyKey(publicKeyDer) {
  return {
    __brand: "ObserveVerifyKey",
    publicKeyDer,
  };
}

/**
 * Stable claim serialization for observe mint and verify (fixed field order).
 *
 * @param {LastObserveClaims} claims
 * @returns {Buffer}
 */
export function canonicalObserveClaimsBytes(claims) {
  /** @type {Record<string, string | number | boolean | null>} */
  const ordered = {
    owner: claims.target.owner,
    repo: claims.target.repo,
    pr: claims.target.pr,
    observedAt: claims.observedAt,
    headRefOid: claims.headRefOid,
    verdictKind: claims.verdictKind,
    markersPresent: claims.markersPresent,
    upstreamExit: claims.upstreamExit,
  };
  return Buffer.from(JSON.stringify(ordered), "utf8");
}

/**
 * @returns {{ mintKey: ObserveMintKey, verifyKey: ObserveVerifyKey }}
 */
export function generateObserveKeyPairForTest() {
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
 * @param {ObserveMintKey} mintKey
 * @returns {string}
 */
export function encodeObserveMintKeyForEnv(mintKey) {
  if (!mintKey || mintKey.__brand !== "ObserveMintKey") {
    throw new Error(
      "observe-crypto: encodeObserveMintKeyForEnv requires ObserveMintKey",
    );
  }
  return mintKey.privateKeyDer.toString("base64");
}

/**
 * @param {ObserveVerifyKey} verifyKey
 * @returns {string}
 */
export function encodeObserveVerifyKeyForEnv(verifyKey) {
  if (!verifyKey || verifyKey.__brand !== "ObserveVerifyKey") {
    throw new Error(
      "observe-crypto: encodeObserveVerifyKeyForEnv requires ObserveVerifyKey",
    );
  }
  return verifyKey.publicKeyDer.toString("base64");
}

/**
 * Land must not hold observe mint material.
 *
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} env
 */
export function refuseObserveMintKeyInLandEnv(env) {
  const mint = env[HEBMU_OBSERVE_MINT_KEY_ENV];
  if (typeof mint === "string" && mint) {
    throw new Error(
      `observe-crypto: ${HEBMU_OBSERVE_MINT_KEY_ENV} must not be set in land env; ` +
        `unset mint before land (verify-only: ${HEBMU_OBSERVE_VERIFY_KEY_ENV})`,
    );
  }
}

/**
 * PKCS8 Ed25519 private only. Never accepts Seal mint/verify env names.
 *
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} env
 * @returns {ObserveMintKey}
 */
export function loadObserveMintKeyFromEnv(env) {
  const raw = env[HEBMU_OBSERVE_MINT_KEY_ENV];
  if (typeof raw !== "string" || !raw) {
    throw new Error(
      `observe-crypto: ${HEBMU_OBSERVE_MINT_KEY_ENV} required (Ed25519 PKCS8 private, base64)`,
    );
  }
  let der;
  try {
    der = Buffer.from(raw, "base64");
  } catch {
    throw new Error(
      `observe-crypto: ${HEBMU_OBSERVE_MINT_KEY_ENV} must be base64 PKCS8`,
    );
  }
  let keyObject;
  try {
    keyObject = createPrivateKey({ key: der, format: "der", type: "pkcs8" });
  } catch {
    throw new Error(
      `observe-crypto: ${HEBMU_OBSERVE_MINT_KEY_ENV} must be PKCS8 Ed25519 private (not SPKI/public)`,
    );
  }
  if (keyObject.asymmetricKeyType !== "ed25519") {
    throw new Error(
      `observe-crypto: ${HEBMU_OBSERVE_MINT_KEY_ENV} must be an Ed25519 private key`,
    );
  }
  return brandMintKey(der);
}

/**
 * SPKI Ed25519 public only.
 *
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} env
 * @returns {ObserveVerifyKey}
 */
export function loadObserveVerifyKeyFromEnv(env) {
  const raw = env[HEBMU_OBSERVE_VERIFY_KEY_ENV];
  if (typeof raw !== "string" || !raw) {
    throw new Error(
      `observe-crypto: ${HEBMU_OBSERVE_VERIFY_KEY_ENV} required (Ed25519 SPKI public, base64)`,
    );
  }
  let der;
  try {
    der = Buffer.from(raw, "base64");
  } catch {
    throw new Error(
      `observe-crypto: ${HEBMU_OBSERVE_VERIFY_KEY_ENV} must be base64 SPKI`,
    );
  }
  let keyObject;
  try {
    keyObject = createPublicKey({ key: der, format: "der", type: "spki" });
  } catch {
    throw new Error(
      `observe-crypto: ${HEBMU_OBSERVE_VERIFY_KEY_ENV} must be SPKI Ed25519 public (not PKCS8/private)`,
    );
  }
  if (keyObject.asymmetricKeyType !== "ed25519") {
    throw new Error(
      `observe-crypto: ${HEBMU_OBSERVE_VERIFY_KEY_ENV} must be an Ed25519 public key`,
    );
  }
  return brandVerifyKey(der);
}

/**
 * @param {LastObserveClaims} claims
 * @returns {LastObserveClaims}
 */
function normalizeClaims(claims) {
  if (!claims || typeof claims !== "object") {
    throw new Error("observe-crypto: claims required");
  }
  if (!claims.target || typeof claims.target !== "object") {
    throw new Error("observe-crypto: target required");
  }
  if (typeof claims.target.owner !== "string" || !claims.target.owner) {
    throw new Error("observe-crypto: owner required");
  }
  if (typeof claims.target.repo !== "string" || !claims.target.repo) {
    throw new Error("observe-crypto: repo required");
  }
  if (!Number.isInteger(claims.target.pr) || claims.target.pr <= 0) {
    throw new Error("observe-crypto: pr must be a positive integer");
  }
  if (typeof claims.observedAt !== "string" || !claims.observedAt) {
    throw new Error("observe-crypto: observedAt required");
  }
  if (typeof claims.markersPresent !== "boolean") {
    throw new Error("observe-crypto: markersPresent required");
  }
  if (typeof claims.upstreamExit !== "number") {
    throw new Error("observe-crypto: upstreamExit required");
  }
  if (
    claims.headRefOid !== null &&
    (typeof claims.headRefOid !== "string" || !claims.headRefOid)
  ) {
    throw new Error("observe-crypto: headRefOid must be string or null");
  }
  if (
    claims.verdictKind !== null &&
    claims.verdictKind !== "READY" &&
    claims.verdictKind !== "STATUS"
  ) {
    throw new Error("observe-crypto: verdictKind must be READY | STATUS | null");
  }

  return {
    target: {
      owner: claims.target.owner,
      repo: claims.target.repo,
      pr: claims.target.pr,
    },
    observedAt: claims.observedAt,
    headRefOid: claims.headRefOid,
    verdictKind: claims.verdictKind,
    markersPresent: claims.markersPresent,
    upstreamExit: claims.upstreamExit,
  };
}

/**
 * @param {LastObserveClaims} claims
 * @param {ObserveMintKey} mintKey
 * @returns {ObserveBoundReceipt}
 */
export function mintObserveBoundReceipt(claims, mintKey) {
  if (!mintKey || mintKey.__brand !== "ObserveMintKey") {
    throw new Error("observe-crypto: mint requires ObserveMintKey");
  }
  const normalized = normalizeClaims(claims);
  const privateKey = createPrivateKey({
    key: mintKey.privateKeyDer,
    format: "der",
    type: "pkcs8",
  });
  const sig = sign(
    null,
    canonicalObserveClaimsBytes(normalized),
    privateKey,
  ).toString("hex");
  return {
    __brand: "ObserveBoundReceipt",
    schema: LAST_OBSERVE_SCHEMA_V2,
    target: normalized.target,
    observedAt: normalized.observedAt,
    headRefOid: normalized.headRefOid,
    verdictKind: normalized.verdictKind,
    markersPresent: normalized.markersPresent,
    upstreamExit: normalized.upstreamExit,
    sig,
  };
}

/**
 * Flatten branded domain value to on-disk wire shape.
 *
 * @param {ObserveBoundReceipt} receipt
 * @returns {Record<string, string | number | boolean | null>}
 */
export function observeBoundWireFromReceipt(receipt) {
  if (!receipt || receipt.__brand !== "ObserveBoundReceipt") {
    throw new Error(
      "observe-crypto: wire export requires ObserveBoundReceipt",
    );
  }
  return {
    schema: LAST_OBSERVE_SCHEMA_V2,
    owner: receipt.target.owner,
    repo: receipt.target.repo,
    pr: receipt.target.pr,
    observedAt: receipt.observedAt,
    headRefOid: receipt.headRefOid,
    verdictKind: receipt.verdictKind,
    markersPresent: receipt.markersPresent,
    upstreamExit: receipt.upstreamExit,
    sig: receipt.sig,
  };
}

/**
 * Untrusted disk → domain. Bad/missing sig, v1 schema, wrong key → null.
 *
 * @param {unknown} raw
 * @param {ObserveVerifyKey} verifyKey
 * @returns {ObserveBoundReceipt | null}
 */
export function verifyObserveBoundWire(raw, verifyKey) {
  if (!verifyKey || verifyKey.__brand !== "ObserveVerifyKey") {
    return null;
  }
  if (!raw || typeof raw !== "object") return null;
  const rec = /** @type {Record<string, unknown>} */ (raw);
  if (rec.schema !== LAST_OBSERVE_SCHEMA_V2) return null;
  if (typeof rec.sig !== "string" || !rec.sig) return null;
  if (typeof rec.owner !== "string" || !rec.owner) return null;
  if (typeof rec.repo !== "string" || !rec.repo) return null;
  const pr = Number(rec.pr);
  if (!Number.isInteger(pr) || pr <= 0) return null;
  if (typeof rec.observedAt !== "string" || !rec.observedAt) return null;
  if (typeof rec.markersPresent !== "boolean") return null;
  if (typeof rec.upstreamExit !== "number") return null;
  if (rec.headRefOid !== null && typeof rec.headRefOid !== "string") {
    return null;
  }
  if (
    rec.verdictKind !== null &&
    rec.verdictKind !== "READY" &&
    rec.verdictKind !== "STATUS"
  ) {
    return null;
  }

  const headRefOid =
    typeof rec.headRefOid === "string" && rec.headRefOid.length > 0
      ? rec.headRefOid
      : null;
  /** @type {"READY" | "STATUS" | null} */
  const verdictKind =
    rec.verdictKind === "READY" || rec.verdictKind === "STATUS"
      ? rec.verdictKind
      : null;

  /** @type {LastObserveClaims} */
  const claims = {
    target: { owner: rec.owner, repo: rec.repo, pr },
    observedAt: rec.observedAt,
    headRefOid,
    verdictKind,
    markersPresent: rec.markersPresent,
    upstreamExit: rec.upstreamExit,
  };

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
    ok = verify(
      null,
      canonicalObserveClaimsBytes(claims),
      publicKey,
      sigBuf,
    );
  } catch {
    return null;
  }
  if (!ok) return null;

  return {
    __brand: "ObserveBoundReceipt",
    schema: LAST_OBSERVE_SCHEMA_V2,
    target: claims.target,
    observedAt: claims.observedAt,
    headRefOid: claims.headRefOid,
    verdictKind: claims.verdictKind,
    markersPresent: claims.markersPresent,
    upstreamExit: claims.upstreamExit,
    sig: rec.sig,
  };
}
