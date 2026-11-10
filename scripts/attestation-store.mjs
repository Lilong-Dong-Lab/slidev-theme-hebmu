#!/usr/bin/env node
/**
 * Verifying sealed-shipping store (#47 / #52 / #58 / #66).
 *
 * `get` verifies at the store seam:
 *   v3 → Ed25519 (attestation-crypto)
 *   v4 → Actions OIDC identity (check-run-crypto); needs SealIdentityVerifier
 * Unsigned / forged / wrong-key / no-identity-v4 → null.
 * `classify` answers denial taxonomy for null gets (missing | unusable | forged).
 *
 * Prod adapter: `.git/hebmu/sealed-shipping/{owner}__{repo}__{pr}.json`
 * Self-test adapter: in-memory Map (+ putRawForTest for lander-forge proofs).
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  SEALED_SHIPPING_SCHEMA_V3,
  sealedShippingWireFromBound,
  verifySealedShippingWire,
} from "./attestation-crypto.mjs";
import {
  SEALED_SHIPPING_SCHEMA_V4,
  classifyCheckRunSealRaw,
  verifyCheckRunSealWire,
  wireFromCheckRunSeal,
} from "./check-run-crypto.mjs";

/**
 * @typedef {import("./attestation-crypto.mjs").VerifierBoundAttestation} VerifierBoundAttestation
 * @typedef {import("./attestation-crypto.mjs").SealVerifyKey} SealVerifyKey
 * @typedef {import("./check-run-crypto.mjs").CheckRunSealAttestation} CheckRunSealAttestation
 * @typedef {import("./check-run-crypto.mjs").SealIdentityVerifier} SealIdentityVerifier
 *
 * @typedef {VerifierBoundAttestation | CheckRunSealAttestation} BoundShippingAttestation
 *
 * @typedef {{
 *   owner: string;
 *   repo: string;
 *   pr: number;
 * }} AttestationKey
 *
 * @typedef {"missing" | "unusable" | "forged"} AttestationClass
 *
 * @typedef {{
 *   put: (artifact: BoundShippingAttestation) => void;
 *   get: (key: AttestationKey) => Promise<BoundShippingAttestation | null>;
 *   classify: (key: AttestationKey) => Promise<AttestationClass>;
 * }} AttestationStore
 *
 * @typedef {AttestationStore & {
 *   putRawForTest: (raw: unknown) => void;
 * }} MemoryAttestationStore
 */

/**
 * @param {AttestationKey} key
 * @returns {string}
 */
export function attestationKeyString(key) {
  return `${key.owner}__${key.repo}__${key.pr}`;
}

/**
 * @param {AttestationKey} key
 * @returns {string}
 */
export function attestationFilename(key) {
  return `${attestationKeyString(key)}.json`;
}

/**
 * @param {BoundShippingAttestation} artifact
 */
function assertBoundAttestation(artifact) {
  if (
    !artifact ||
    (artifact.__brand !== "VerifierBoundAttestation" &&
      artifact.__brand !== "CheckRunSealAttestation")
  ) {
    throw new Error(
      "attestation-store: put requires VerifierBoundAttestation or CheckRunSealAttestation",
    );
  }
}

/**
 * @param {BoundShippingAttestation} artifact
 * @returns {Record<string, unknown>}
 */
function wireFromBound(artifact) {
  if (artifact.__brand === "CheckRunSealAttestation") {
    return wireFromCheckRunSeal(artifact);
  }
  return sealedShippingWireFromBound(artifact);
}

/**
 * @param {BoundShippingAttestation} artifact
 * @returns {AttestationKey}
 */
function keyFromBound(artifact) {
  return {
    owner: artifact.claims.owner,
    repo: artifact.claims.repo,
    pr: artifact.claims.pr,
  };
}

/**
 * Mint/CLI write path: brand check + wire flush. No key material.
 *
 * @param {string} rootDir
 * @param {BoundShippingAttestation} artifact
 */
export function putBoundAttestation(rootDir, artifact) {
  assertBoundAttestation(artifact);
  const wire = wireFromBound(artifact);
  mkdirSync(rootDir, { recursive: true });
  const path = join(rootDir, attestationFilename(keyFromBound(artifact)));
  writeFileSync(path, JSON.stringify(wire, null, 2) + "\n", "utf8");
}

/**
 * @param {unknown} raw
 * @param {SealVerifyKey} verifyKey
 * @param {SealIdentityVerifier | undefined} identity
 * @returns {Promise<BoundShippingAttestation | null>}
 */
async function verifyRaw(raw, verifyKey, identity) {
  if (!raw || typeof raw !== "object") return null;
  const schema = /** @type {Record<string, unknown>} */ (raw).schema;
  if (schema === SEALED_SHIPPING_SCHEMA_V3) {
    return verifySealedShippingWire(raw, verifyKey);
  }
  if (schema === SEALED_SHIPPING_SCHEMA_V4) {
    if (!identity) return null;
    const result = await verifyCheckRunSealWire(raw, { identity });
    return result.status === "verified" ? result.attestation : null;
  }
  return null;
}

/**
 * @param {unknown} raw
 * @param {SealVerifyKey} verifyKey
 * @param {SealIdentityVerifier | undefined} identity
 * @returns {Promise<AttestationClass>}
 */
async function classifyRaw(raw, verifyKey, identity) {
  if (raw === undefined) return "missing";
  if (!raw || typeof raw !== "object") return "unusable";
  const schema = /** @type {Record<string, unknown>} */ (raw).schema;
  if (schema === SEALED_SHIPPING_SCHEMA_V4) {
    if (!identity) return "unusable";
    return classifyCheckRunSealRaw(raw, { identity });
  }
  // v3 / legacy: forged or undecodable → unusable (exit-2 family; not provenance-forged).
  const got = verifySealedShippingWire(raw, verifyKey);
  if (got) return "unusable";
  return "unusable";
}

/**
 * Assert/self-test store: get always verifies.
 *
 * @param {SealVerifyKey} verifyKey
 * @param {SealIdentityVerifier} [identity]
 * @returns {MemoryAttestationStore}
 */
export function createVerifyingMemoryStore(verifyKey, identity) {
  if (!verifyKey || verifyKey.__brand !== "SealVerifyKey") {
    throw new Error(
      "attestation-store: createVerifyingMemoryStore requires SealVerifyKey",
    );
  }
  /** @type {Map<string, unknown>} */
  const map = new Map();
  return {
    put(artifact) {
      assertBoundAttestation(artifact);
      const wire = wireFromBound(artifact);
      map.set(attestationKeyString(keyFromBound(artifact)), wire);
    },
    async get(key) {
      const raw = map.get(attestationKeyString(key));
      if (raw === undefined) return null;
      return verifyRaw(raw, verifyKey, identity);
    },
    async classify(key) {
      const raw = map.get(attestationKeyString(key));
      if (raw === undefined) return "missing";
      return classifyRaw(raw, verifyKey, identity);
    },
    // Lander-mintable / forged wire for self-tests; get still verifies.
    putRawForTest(raw) {
      if (!raw || typeof raw !== "object") {
        throw new Error("attestation-store: putRawForTest requires an object");
      }
      const rec = /** @type {Record<string, unknown>} */ (raw);
      const pr = Number(rec.pr);
      if (
        typeof rec.owner !== "string" ||
        typeof rec.repo !== "string" ||
        !Number.isInteger(pr) ||
        pr <= 0
      ) {
        throw new Error(
          "attestation-store: putRawForTest needs owner, repo, positive pr",
        );
      }
      map.set(
        attestationKeyString({ owner: rec.owner, repo: rec.repo, pr }),
        raw,
      );
    },
  };
}

/**
 * @param {string} rootDir absolute or cwd-relative store root
 * @param {SealVerifyKey} verifyKey
 * @param {SealIdentityVerifier} [identity]
 * @returns {AttestationStore}
 */
export function createVerifyingFsStore(rootDir, verifyKey, identity) {
  if (!verifyKey || verifyKey.__brand !== "SealVerifyKey") {
    throw new Error(
      "attestation-store: createVerifyingFsStore requires SealVerifyKey",
    );
  }
  return {
    put(artifact) {
      putBoundAttestation(rootDir, artifact);
    },
    async get(key) {
      const path = join(rootDir, attestationFilename(key));
      if (!existsSync(path)) return null;
      try {
        const raw = JSON.parse(readFileSync(path, "utf8"));
        return verifyRaw(raw, verifyKey, identity);
      } catch {
        // Corrupt on disk → fail closed for assert (treat as missing).
        return null;
      }
    },
    async classify(key) {
      const path = join(rootDir, attestationFilename(key));
      if (!existsSync(path)) return "missing";
      try {
        const raw = JSON.parse(readFileSync(path, "utf8"));
        return classifyRaw(raw, verifyKey, identity);
      } catch {
        return "unusable";
      }
    },
  };
}

/**
 * Default prod root under the repo's `.git` (no .gitignore churn).
 *
 * @param {string} repoRoot
 * @returns {string}
 */
export function defaultSealedShippingDir(repoRoot) {
  return join(repoRoot, ".git", "hebmu", "sealed-shipping");
}
