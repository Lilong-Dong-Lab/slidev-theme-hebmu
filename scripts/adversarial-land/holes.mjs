/**
 * Closed HoleId set for #53 adversarial land-path suite.
 * ATTACKS must cover each id exactly once (assertAttackTableComplete).
 */

/**
 * @typedef {"bare-pass"
 *   | "bare-ready"
 *   | "stale-tip"
 *   | "forged-seal"
 *   | "bare-merge"
 *   | "trunk-helper-on-gate-pr"
 *   | "soft-lure-observe"} HoleId
 */

/** @type {readonly HoleId[]} */
export const HOLE_IDS = Object.freeze([
  "bare-pass",
  "bare-ready",
  "stale-tip",
  "forged-seal",
  "bare-merge",
  "trunk-helper-on-gate-pr",
  "soft-lure-observe",
]);
