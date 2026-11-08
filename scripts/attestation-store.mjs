#!/usr/bin/env node
/**
 * Verifying sealed-shipping store (#47 / #52 / #58).
 *
 * `get` verifies Ed25519 sig at the store seam; v2/HMAC / unsigned / forged → null.
 * `put` accepts VerifierBoundAttestation only — no unsigned JSON writer.
 *
 * Prod adapter: `.git/hebmu/sealed-shipping/{owner}__{repo}__{pr}.json`
 * Self-test adapter: in-memory Map (+ putRawForTest for lander-forge proofs).
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  sealedShippingWireFromBound,
  verifySealedShippingWire,
} from "./attestation-crypto.mjs";

/**
 * @typedef {import("./attestation-crypto.mjs").VerifierBoundAttestation} VerifierBoundAttestation
 * @typedef {import("./attestation-crypto.mjs").SealVerifyKey} SealVerifyKey
 *
 * @typedef {{
 *   owner: string;
 *   repo: string;
 *   pr: number;
 * }} AttestationKey
 *
 * @typedef {{
 *   put: (artifact: VerifierBoundAttestation) => void;
 *   get: (key: AttestationKey) => VerifierBoundAttestation | null;
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
 * @param {VerifierBoundAttestation} artifact
 */
function assertBoundAttestation(artifact) {
  if (!artifact || artifact.__brand !== "VerifierBoundAttestation") {
    throw new Error(
      "attestation-store: put requires VerifierBoundAttestation (mint via attestation-crypto)",
    );
  }
}

/**
 * Mint/CLI write path: brand check + wire flush. No key material.
 *
 * @param {string} rootDir
 * @param {VerifierBoundAttestation} artifact
 */
export function putBoundAttestation(rootDir, artifact) {
  assertBoundAttestation(artifact);
  const wire = sealedShippingWireFromBound(artifact);
  mkdirSync(rootDir, { recursive: true });
  const path = join(
    rootDir,
    attestationFilename({
      owner: artifact.claims.owner,
      repo: artifact.claims.repo,
      pr: artifact.claims.pr,
    }),
  );
  writeFileSync(path, JSON.stringify(wire, null, 2) + "\n", "utf8");
}

/**
 * Assert/self-test store: get always verifies with SealVerifyKey.
 *
 * @param {SealVerifyKey} verifyKey
 * @returns {MemoryAttestationStore}
 */
export function createVerifyingMemoryStore(verifyKey) {
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
      const wire = sealedShippingWireFromBound(artifact);
      map.set(
        attestationKeyString({
          owner: artifact.claims.owner,
          repo: artifact.claims.repo,
          pr: artifact.claims.pr,
        }),
        wire,
      );
    },
    get(key) {
      const raw = map.get(attestationKeyString(key));
      if (raw === undefined) return null;
      return verifySealedShippingWire(raw, verifyKey);
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
 * @returns {AttestationStore}
 */
export function createVerifyingFsStore(rootDir, verifyKey) {
  if (!verifyKey || verifyKey.__brand !== "SealVerifyKey") {
    throw new Error(
      "attestation-store: createVerifyingFsStore requires SealVerifyKey",
    );
  }
  return {
    put(artifact) {
      putBoundAttestation(rootDir, artifact);
    },
    get(key) {
      const path = join(rootDir, attestationFilename(key));
      if (!existsSync(path)) return null;
      try {
        const raw = JSON.parse(readFileSync(path, "utf8"));
        return verifySealedShippingWire(raw, verifyKey);
      } catch {
        // Corrupt on disk → fail closed for assert (treat as missing).
        return null;
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
