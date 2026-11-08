#!/usr/bin/env node
/**
 * Pure last-observe land preflight (#54).
 *
 * Fail-closed before runAssert when the durable receipt is missing, bare,
 * tip-unbound, or tip-stale. Distinct from assert-session mintPermit.
 */
/**
 * @typedef {import("./last-observe-store.mjs").LastObserveReceipt} LastObserveReceipt
 *
 * @typedef {{
 *   readonly __brand: "ObserveClearanceProof";
 *   readonly target: LastObserveReceipt["target"];
 *   readonly observedAt: string;
 *   readonly headRefOid: string;
 *   readonly verdictKind: "READY" | "STATUS" | null;
 * }} ObserveClearanceProof
 *
 * @typedef {{
 *   kind: "allow";
 *   proof: ObserveClearanceProof;
 * } | {
 *   kind: "deny";
 *   exitCode: 4;
 *   detail:
 *     | "hebmu-last-observe-missing"
 *     | "hebmu-last-observe-lacked-clearance"
 *     | "hebmu-last-observe-tip-unbound"
 *     | "hebmu-last-observe-tip-stale";
 * }} LastObservePreflightResult
 */

/**
 * Pure gate. Missing / bare / unbound tip / stale tip → deny exit 4.
 *
 * @param {{
 *   receipt: LastObserveReceipt | null;
 *   tipOid: string | null;
 * }} args
 * @returns {LastObservePreflightResult}
 */
export function evaluateLastObservePreflight(args) {
  const { receipt, tipOid } = args;
  if (receipt === null) {
    return {
      kind: "deny",
      exitCode: 4,
      detail: "hebmu-last-observe-missing",
    };
  }
  if (!receipt.markersPresent) {
    return {
      kind: "deny",
      exitCode: 4,
      detail: "hebmu-last-observe-lacked-clearance",
    };
  }
  if (receipt.headRefOid == null || tipOid == null) {
    return {
      kind: "deny",
      exitCode: 4,
      detail: "hebmu-last-observe-tip-unbound",
    };
  }
  if (receipt.headRefOid !== tipOid) {
    return {
      kind: "deny",
      exitCode: 4,
      detail: "hebmu-last-observe-tip-stale",
    };
  }
  return {
    kind: "allow",
    proof: {
      __brand: "ObserveClearanceProof",
      target: receipt.target,
      observedAt: receipt.observedAt,
      headRefOid: receipt.headRefOid,
      verdictKind: receipt.verdictKind,
    },
  };
}

/**
 * Branded proof language for "markers present on this capture" (graft from B).
 * Maps a cleared, tip-bound receipt onto ObserveClearanceProof; otherwise deny.
 * Does not replace evaluateLastObservePreflight — thin alias for tests/docs.
 *
 * @param {{
 *   receipt: LastObserveReceipt | null;
 *   tipOid: string | null;
 * }} args
 * @returns {LastObservePreflightResult}
 */
export function mintObserveClearanceProof(args) {
  return evaluateLastObservePreflight(args);
}
