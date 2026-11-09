#!/usr/bin/env node
/**
 * Verifying last-observe receipt store (#54 / #59).
 *
 * Schema hebmu.last-observe.v2 + required Ed25519 sig. `get` verifies at the
 * store seam; unsigned / v1 / bad sig → null. `put` accepts ObserveBoundReceipt
 * only — no unsigned JSON writer.
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  LAST_OBSERVE_SCHEMA_V2,
  observeBoundWireFromReceipt,
  verifyObserveBoundWire,
} from "./observe-crypto.mjs";

/** @type {"hebmu.last-observe.v2"} */
export const LAST_OBSERVE_SCHEMA = LAST_OBSERVE_SCHEMA_V2;

/** @deprecated Forge-for-reject / migration errors only. */
export { LAST_OBSERVE_SCHEMA_V1 } from "./observe-crypto.mjs";

/**
 * @typedef {import("./observe-crypto.mjs").PrTarget} PrTarget
 * @typedef {import("./observe-crypto.mjs").LastObserveClaims} LastObserveClaims
 * @typedef {import("./observe-crypto.mjs").ObserveBoundReceipt} ObserveBoundReceipt
 * @typedef {import("./observe-crypto.mjs").ObserveVerifyKey} ObserveVerifyKey
 *
 * Authenticated domain receipt after observe mint / verifying get.
 * @typedef {ObserveBoundReceipt} LastObserveReceipt
 *
 * @typedef {{
 *   put: (receipt: ObserveBoundReceipt) => void;
 *   get: (key: PrTarget) => ObserveBoundReceipt | null;
 * }} LastObserveStore
 *
 * @typedef {LastObserveStore & {
 *   putRawForTest: (raw: unknown) => void;
 * }} MemoryLastObserveStore
 */

/**
 * @param {PrTarget} key
 * @returns {string}
 */
export function lastObserveKeyString(key) {
  return `${key.owner}__${key.repo}__${key.pr}`;
}

/**
 * @param {PrTarget} key
 * @returns {string}
 */
export function lastObserveFilename(key) {
  return `${lastObserveKeyString(key)}.json`;
}

/**
 * @param {string} repoRoot
 * @returns {string}
 */
export function defaultLastObserveDir(repoRoot) {
  return join(repoRoot, ".git", "hebmu", "last-observe");
}

/**
 * Derive markersPresent only from parseClearancePresence kind === "present".
 * Claims only — no sig. Callers mint via mintObserveBoundReceipt.
 *
 * @param {{
 *   target: PrTarget;
 *   presence: { kind: string; verdictKind?: "READY" | "STATUS" };
 *   upstreamExit: number;
 *   headRefOid?: string | null;
 *   observedAt?: string;
 *   verdictKind?: "READY" | "STATUS" | null;
 * }} args
 * @returns {LastObserveClaims}
 */
export function buildLastObserveClaims(args) {
  const markersPresent = args.presence.kind === "present";
  /** @type {"READY" | "STATUS" | null} */
  let verdictKind = null;
  if (args.verdictKind === "READY" || args.verdictKind === "STATUS") {
    verdictKind = args.verdictKind;
  } else if (
    args.presence.verdictKind === "READY" ||
    args.presence.verdictKind === "STATUS"
  ) {
    verdictKind = args.presence.verdictKind;
  }

  return {
    target: {
      owner: args.target.owner,
      repo: args.target.repo,
      pr: args.target.pr,
    },
    observedAt: args.observedAt ?? new Date().toISOString(),
    headRefOid:
      typeof args.headRefOid === "string" && args.headRefOid.length > 0
        ? args.headRefOid
        : null,
    verdictKind,
    markersPresent,
    upstreamExit: args.upstreamExit,
  };
}

/**
 * @param {ObserveBoundReceipt} receipt
 */
function assertBoundReceipt(receipt) {
  if (!receipt || receipt.__brand !== "ObserveBoundReceipt") {
    throw new Error(
      "last-observe-store: put requires ObserveBoundReceipt (mint via observe-crypto)",
    );
  }
}

/**
 * Brand-only write; no key material.
 *
 * @param {string} rootDir
 * @param {ObserveBoundReceipt} receipt
 */
export function putObserveBoundReceipt(rootDir, receipt) {
  assertBoundReceipt(receipt);
  const wire = observeBoundWireFromReceipt(receipt);
  mkdirSync(rootDir, { recursive: true });
  const path = join(rootDir, lastObserveFilename(receipt.target));
  writeFileSync(path, JSON.stringify(wire, null, 2) + "\n", "utf8");
}

/**
 * Assert/land/self-test: get always verifies with ObserveVerifyKey.
 *
 * @param {ObserveVerifyKey} verifyKey
 * @returns {MemoryLastObserveStore}
 */
export function createVerifyingMemoryLastObserveStore(verifyKey) {
  if (!verifyKey || verifyKey.__brand !== "ObserveVerifyKey") {
    throw new Error(
      "last-observe-store: createVerifyingMemoryLastObserveStore requires ObserveVerifyKey",
    );
  }
  /** @type {Map<string, unknown>} */
  const map = new Map();
  return {
    put(receipt) {
      assertBoundReceipt(receipt);
      const wire = observeBoundWireFromReceipt(receipt);
      map.set(lastObserveKeyString(receipt.target), wire);
    },
    get(key) {
      const raw = map.get(lastObserveKeyString(key));
      if (raw === undefined) return null;
      return verifyObserveBoundWire(raw, verifyKey);
    },
    // Forged / unsigned wire for self-tests; get still verifies.
    putRawForTest(raw) {
      if (!raw || typeof raw !== "object") {
        throw new Error(
          "last-observe-store: putRawForTest requires an object",
        );
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
          "last-observe-store: putRawForTest needs owner, repo, positive pr",
        );
      }
      map.set(
        lastObserveKeyString({ owner: rec.owner, repo: rec.repo, pr }),
        raw,
      );
    },
  };
}

/**
 * @param {string} rootDir
 * @param {ObserveVerifyKey} verifyKey
 * @returns {LastObserveStore}
 */
export function createVerifyingFsLastObserveStore(rootDir, verifyKey) {
  if (!verifyKey || verifyKey.__brand !== "ObserveVerifyKey") {
    throw new Error(
      "last-observe-store: createVerifyingFsLastObserveStore requires ObserveVerifyKey",
    );
  }
  return {
    put(receipt) {
      putObserveBoundReceipt(rootDir, receipt);
    },
    get(key) {
      const path = join(rootDir, lastObserveFilename(key));
      if (!existsSync(path)) return null;
      try {
        const raw = JSON.parse(readFileSync(path, "utf8"));
        return verifyObserveBoundWire(raw, verifyKey);
      } catch {
        return null;
      }
    },
  };
}
