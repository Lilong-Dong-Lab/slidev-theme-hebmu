#!/usr/bin/env node
/**
 * Injectable sealed-shipping attestation store (#47).
 *
 * Prod adapter: `.git/hebmu/sealed-shipping/{owner}__{repo}__{pr}.json`
 * Self-test adapter: in-memory Map.
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

/**
 * @typedef {{
 *   schema: "hebmu.sealed-shipping.v1";
 *   owner: string;
 *   repo: string;
 *   pr: number;
 *   headRefOid: string;
 *   verdict: "PASS" | "FAIL";
 *   sealedAt: string;
 *   by?: string;
 * }} SealedShippingArtifact
 *
 * @typedef {{
 *   owner: string;
 *   repo: string;
 *   pr: number;
 * }} AttestationKey
 *
 * @typedef {{
 *   put: (artifact: SealedShippingArtifact) => void;
 *   get: (key: AttestationKey) => SealedShippingArtifact | null;
 * }} AttestationStore
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
 * Validate and normalize a store payload. Throws on put-path invalid input.
 *
 * @param {unknown} raw
 * @returns {SealedShippingArtifact}
 */
export function parseSealedShippingArtifact(raw) {
  if (!raw || typeof raw !== "object") {
    throw new Error("attestation-store: artifact must be an object");
  }
  const rec = /** @type {Record<string, unknown>} */ (raw);
  if (rec.schema !== "hebmu.sealed-shipping.v1") {
    throw new Error(
      `attestation-store: schema must be hebmu.sealed-shipping.v1, got ${String(rec.schema)}`,
    );
  }
  if (typeof rec.owner !== "string" || !rec.owner) {
    throw new Error("attestation-store: owner required");
  }
  if (typeof rec.repo !== "string" || !rec.repo) {
    throw new Error("attestation-store: repo required");
  }
  const pr = Number(rec.pr);
  if (!Number.isInteger(pr) || pr <= 0) {
    throw new Error("attestation-store: pr must be a positive integer");
  }
  if (typeof rec.headRefOid !== "string" || !rec.headRefOid) {
    throw new Error("attestation-store: headRefOid required");
  }
  if (rec.verdict !== "PASS" && rec.verdict !== "FAIL") {
    throw new Error("attestation-store: verdict must be PASS or FAIL");
  }
  if (typeof rec.sealedAt !== "string" || !rec.sealedAt) {
    throw new Error("attestation-store: sealedAt required");
  }
  /** @type {SealedShippingArtifact} */
  const out = {
    schema: "hebmu.sealed-shipping.v1",
    owner: rec.owner,
    repo: rec.repo,
    pr,
    headRefOid: rec.headRefOid,
    verdict: rec.verdict,
    sealedAt: rec.sealedAt,
  };
  if (typeof rec.by === "string" && rec.by) out.by = rec.by;
  return out;
}

/**
 * @returns {AttestationStore}
 */
export function createMemoryStore() {
  /** @type {Map<string, SealedShippingArtifact>} */
  const map = new Map();
  return {
    put(artifact) {
      const validated = parseSealedShippingArtifact(artifact);
      map.set(
        attestationKeyString({
          owner: validated.owner,
          repo: validated.repo,
          pr: validated.pr,
        }),
        validated,
      );
    },
    get(key) {
      return map.get(attestationKeyString(key)) ?? null;
    },
  };
}

/**
 * @param {string} rootDir absolute or cwd-relative store root
 * @returns {AttestationStore}
 */
export function createFsStore(rootDir) {
  return {
    put(artifact) {
      const validated = parseSealedShippingArtifact(artifact);
      mkdirSync(rootDir, { recursive: true });
      const path = join(
        rootDir,
        attestationFilename({
          owner: validated.owner,
          repo: validated.repo,
          pr: validated.pr,
        }),
      );
      writeFileSync(path, JSON.stringify(validated, null, 2) + "\n", "utf8");
    },
    get(key) {
      const path = join(rootDir, attestationFilename(key));
      if (!existsSync(path)) return null;
      try {
        const raw = JSON.parse(readFileSync(path, "utf8"));
        return parseSealedShippingArtifact(raw);
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
