#!/usr/bin/env node
/**
 * Durable last-observe receipt store (#54).
 *
 * Trust-on-write local provenance under `.git/hebmu/last-observe/`.
 * Not MAC-bound (unlike sealed-shipping). Observe always puts positive
 * and negative receipts; land fails closed on missing/corrupt/wrong schema.
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

/** @type {"hebmu.last-observe.v1"} */
export const LAST_OBSERVE_SCHEMA = "hebmu.last-observe.v1";

/**
 * @typedef {{
 *   owner: string;
 *   repo: string;
 *   pr: number;
 * }} PrTarget
 *
 * @typedef {{
 *   readonly schema: "hebmu.last-observe.v1";
 *   readonly target: PrTarget;
 *   readonly observedAt: string;
 *   readonly headRefOid: string | null;
 *   readonly verdictKind: "READY" | "STATUS" | null;
 *   readonly markersPresent: boolean;
 *   readonly upstreamExit: number;
 * }} LastObserveReceipt
 *
 * @typedef {{
 *   put: (receipt: LastObserveReceipt) => void;
 *   get: (key: PrTarget) => LastObserveReceipt | null;
 * }} LastObserveStore
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
 *
 * @param {{
 *   target: PrTarget;
 *   presence: { kind: string; verdictKind?: "READY" | "STATUS" };
 *   upstreamExit: number;
 *   headRefOid?: string | null;
 *   observedAt?: string;
 *   verdictKind?: "READY" | "STATUS" | null;
 * }} args
 * @returns {LastObserveReceipt}
 */
export function buildLastObserveReceipt(args) {
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
    schema: LAST_OBSERVE_SCHEMA,
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
 * Wire → domain. Missing / corrupt / wrong schema → null (fail closed).
 *
 * @param {unknown} raw
 * @returns {LastObserveReceipt | null}
 */
function parseLastObserveWire(raw) {
  if (!raw || typeof raw !== "object") return null;
  const rec = /** @type {Record<string, unknown>} */ (raw);
  if (rec.schema !== LAST_OBSERVE_SCHEMA) return null;
  if (typeof rec.owner !== "string" || typeof rec.repo !== "string") return null;
  const pr = Number(rec.pr);
  if (!Number.isInteger(pr) || pr <= 0) return null;
  if (typeof rec.observedAt !== "string") return null;
  if (typeof rec.markersPresent !== "boolean") return null;
  if (typeof rec.upstreamExit !== "number") return null;
  if (rec.headRefOid !== null && typeof rec.headRefOid !== "string") {
    return null;
  }
  if (
    rec.verdictKind !== undefined &&
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
  return {
    schema: LAST_OBSERVE_SCHEMA,
    target: { owner: rec.owner, repo: rec.repo, pr },
    observedAt: rec.observedAt,
    headRefOid,
    verdictKind,
    markersPresent: rec.markersPresent,
    upstreamExit: rec.upstreamExit,
  };
}

/**
 * @param {LastObserveReceipt} receipt
 * @returns {Record<string, unknown>}
 */
function serializeLastObserveWire(receipt) {
  return {
    schema: receipt.schema,
    owner: receipt.target.owner,
    repo: receipt.target.repo,
    pr: receipt.target.pr,
    observedAt: receipt.observedAt,
    headRefOid: receipt.headRefOid,
    verdictKind: receipt.verdictKind,
    markersPresent: receipt.markersPresent,
    upstreamExit: receipt.upstreamExit,
  };
}

/**
 * @param {string} rootDir
 * @returns {LastObserveStore}
 */
export function createFsLastObserveStore(rootDir) {
  return {
    put(receipt) {
      mkdirSync(rootDir, { recursive: true });
      const path = join(rootDir, lastObserveFilename(receipt.target));
      writeFileSync(
        path,
        JSON.stringify(serializeLastObserveWire(receipt), null, 2) + "\n",
        "utf8",
      );
    },
    get(key) {
      const path = join(rootDir, lastObserveFilename(key));
      if (!existsSync(path)) return null;
      try {
        const raw = JSON.parse(readFileSync(path, "utf8"));
        return parseLastObserveWire(raw);
      } catch {
        return null;
      }
    },
  };
}

/**
 * @returns {LastObserveStore}
 */
export function createMemoryLastObserveStore() {
  /** @type {Map<string, LastObserveReceipt>} */
  const map = new Map();
  return {
    put(receipt) {
      map.set(lastObserveKeyString(receipt.target), {
        schema: receipt.schema,
        target: { ...receipt.target },
        observedAt: receipt.observedAt,
        headRefOid: receipt.headRefOid,
        verdictKind: receipt.verdictKind,
        markersPresent: receipt.markersPresent,
        upstreamExit: receipt.upstreamExit,
      });
    },
    get(key) {
      return map.get(lastObserveKeyString(key)) ?? null;
    },
  };
}
