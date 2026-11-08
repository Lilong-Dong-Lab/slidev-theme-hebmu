#!/usr/bin/env node
/**
 * Verifier-keyed HMAC for sealed-shipping (#52).
 *
 * Capability is HEBMU_SEAL_HMAC_KEY, not an honor-system `by` string.
 * Mint and verify share canonicalClaimsBytes so wire MACs stay comparable.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

/** @type {string} */
export const SEALED_SHIPPING_SCHEMA_V2 = "hebmu.sealed-shipping.v2";

/** @type {string} */
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
 *   readonly __brand: "VerifierSigningKey";
 *   readonly bytes: Buffer;
 * }} VerifierSigningKey
 *
 * @typedef {{
 *   readonly __brand: "VerifierBoundAttestation";
 *   readonly schema: "hebmu.sealed-shipping.v2";
 *   readonly claims: ShippingClaims;
 *   readonly mac: string;
 * }} VerifierBoundAttestation
 */

/**
 * @param {Buffer} bytes
 * @returns {VerifierSigningKey}
 */
function brandSigningKey(bytes) {
  return {
    __brand: "VerifierSigningKey",
    bytes,
  };
}

/**
 * Self-test / harness key. Not for production secrets.
 *
 * @param {string} secret
 * @returns {VerifierSigningKey}
 */
export function signingKeyFromTestSecret(secret) {
  if (typeof secret !== "string" || !secret) {
    throw new Error("attestation-mac: test secret must be a non-empty string");
  }
  return brandSigningKey(Buffer.from(secret, "utf8"));
}

/**
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} env
 * @returns {VerifierSigningKey}
 */
export function loadVerifierSigningKeyFromEnv(env) {
  const raw = env[HEBMU_SEAL_HMAC_KEY_ENV];
  if (typeof raw !== "string" || !raw) {
    throw new Error(
      `attestation-mac: ${HEBMU_SEAL_HMAC_KEY_ENV} required (verifier-only HMAC material)`,
    );
  }
  return brandSigningKey(Buffer.from(raw, "utf8"));
}

/**
 * Stable claim serialization for mint and verify.
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
 * @param {ShippingClaims} claims
 * @param {VerifierSigningKey} signingKey
 * @returns {string}
 */
function macHexForClaims(claims, signingKey) {
  return createHmac("sha256", signingKey.bytes)
    .update(canonicalClaimsBytes(claims))
    .digest("hex");
}

/**
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
function safeEqualHex(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * @param {ShippingClaims} claims
 * @param {VerifierSigningKey} signingKey
 * @returns {VerifierBoundAttestation}
 */
export function mintVerifierBoundAttestation(claims, signingKey) {
  if (!signingKey || signingKey.__brand !== "VerifierSigningKey") {
    throw new Error("attestation-mac: mint requires VerifierSigningKey");
  }
  if (!claims || typeof claims !== "object") {
    throw new Error("attestation-mac: claims required");
  }
  if (typeof claims.owner !== "string" || !claims.owner) {
    throw new Error("attestation-mac: owner required");
  }
  if (typeof claims.repo !== "string" || !claims.repo) {
    throw new Error("attestation-mac: repo required");
  }
  if (!Number.isInteger(claims.pr) || claims.pr <= 0) {
    throw new Error("attestation-mac: pr must be a positive integer");
  }
  if (typeof claims.headRefOid !== "string" || !claims.headRefOid) {
    throw new Error("attestation-mac: headRefOid required");
  }
  if (claims.verdict !== "PASS" && claims.verdict !== "FAIL") {
    throw new Error("attestation-mac: verdict must be PASS or FAIL");
  }
  if (typeof claims.sealedAt !== "string" || !claims.sealedAt) {
    throw new Error("attestation-mac: sealedAt required");
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

  return {
    __brand: "VerifierBoundAttestation",
    schema: SEALED_SHIPPING_SCHEMA_V2,
    claims: normalized,
    mac: macHexForClaims(normalized, signingKey),
  };
}

/**
 * Wire → domain. Untrusted disk input: bad/missing MAC or schema → null.
 *
 * @param {unknown} raw
 * @param {VerifierSigningKey} signingKey
 * @returns {VerifierBoundAttestation | null}
 */
export function verifySealedShippingWire(raw, signingKey) {
  if (!signingKey || signingKey.__brand !== "VerifierSigningKey") {
    return null;
  }
  if (!raw || typeof raw !== "object") return null;
  const rec = /** @type {Record<string, unknown>} */ (raw);
  if (rec.schema !== SEALED_SHIPPING_SCHEMA_V2) return null;
  if (typeof rec.mac !== "string" || !rec.mac) return null;
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

  const expected = macHexForClaims(claims, signingKey);
  if (!safeEqualHex(expected, rec.mac)) return null;

  return {
    __brand: "VerifierBoundAttestation",
    schema: SEALED_SHIPPING_SCHEMA_V2,
    claims,
    mac: expected,
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
    throw new Error("attestation-mac: wire export requires VerifierBoundAttestation");
  }
  /** @type {Record<string, string | number>} */
  const wire = {
    schema: SEALED_SHIPPING_SCHEMA_V2,
    owner: artifact.claims.owner,
    repo: artifact.claims.repo,
    pr: artifact.claims.pr,
    headRefOid: artifact.claims.headRefOid,
    verdict: artifact.claims.verdict,
    sealedAt: artifact.claims.sealedAt,
    mac: artifact.mac,
  };
  if (artifact.claims.by) wire.by = artifact.claims.by;
  return wire;
}
