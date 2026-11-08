/**
 * Fail-closed aggregator for the #53 adversarial land suite.
 */
import { ATTACKS, assertAttackTableComplete } from "./attack-table.mjs";
import { createAttackContext } from "./context.mjs";
import { HOLE_IDS } from "./holes.mjs";

/**
 * @typedef {import("./attack-table.mjs").Attack} Attack
 * @typedef {import("./attack-table.mjs").AttackObservation} AttackObservation
 * @typedef {import("./context.mjs").AttackContext} AttackContext
 *
 * @typedef {{
 *   ok: boolean;
 *   lines: readonly string[];
 *   observations: readonly AttackObservation[];
 * }} SuiteReport
 */

/**
 * Fold observations: every outcome must be denied.
 * Exported so the suite can prove an `allowed` observation fails closed.
 *
 * @param {readonly AttackObservation[]} observations
 * @returns {boolean}
 */
export function allAttacksDenied(observations) {
  return (
    observations.length > 0 &&
    observations.every((o) => o.outcome === "denied")
  );
}

/**
 * Built-in negative: aggregator must reject an `allowed` observation.
 * @returns {boolean} true when the self-check passes (aggregator fails closed)
 */
export function aggregatorRejectsAllowedObservation() {
  /** @type {AttackObservation} */
  const fakeAllowed = {
    id: "bare-pass",
    outcome: "allowed",
    detail: "synthetic allowed observation for aggregator self-check",
  };
  return allAttacksDenied([fakeAllowed]) === false;
}

/**
 * Format one observation for CI logs.
 * @param {AttackObservation} obs
 * @returns {string}
 */
export function formatObservationLine(obs) {
  if (obs.outcome === "denied") {
    return `ok  attack ${obs.id}: denied (${obs.detail})`;
  }
  return `FAIL attack ${obs.id}: ${obs.outcome} (${obs.detail})`;
}

/**
 * Iterate ATTACKS; fail closed if any observation.outcome !== "denied"
 * or if the table is incomplete. Never calls real gh / network.
 *
 * @param {{
 *   ctx?: AttackContext;
 *   attacks?: readonly Attack[];
 * }} [opts]
 * @returns {Promise<SuiteReport>}
 */
export async function runAdversarialLandSuite(opts = {}) {
  const attacks = opts.attacks ?? ATTACKS;
  assertAttackTableComplete(attacks);

  if (!aggregatorRejectsAllowedObservation()) {
    return {
      ok: false,
      lines: [
        "FAIL adversarial-land: aggregator self-check (allowed observation must fail suite)",
      ],
      observations: [],
    };
  }

  const ctx = opts.ctx ?? createAttackContext();
  /** @type {AttackObservation[]} */
  const observations = [];
  /** @type {string[]} */
  const lines = [];

  for (const attack of attacks) {
    /** @type {AttackObservation} */
    let obs;
    try {
      obs = await attack.run(ctx);
    } catch (err) {
      obs = {
        id: attack.id,
        outcome: "error",
        detail: err instanceof Error ? err.message : String(err),
        evidence: {
          threw: err instanceof Error ? err.message : String(err),
        },
      };
    }
    observations.push(obs);
    lines.push(formatObservationLine(obs));
  }

  const ok = allAttacksDenied(observations);
  if (ok) {
    lines.push("ok  adversarial-land: all attacks denied");
  } else {
    const failed = observations
      .filter((o) => o.outcome !== "denied")
      .map((o) => o.id);
    lines.push(
      `FAIL adversarial-land: holes not denied: ${failed.join(", ")}`,
    );
  }

  return { ok, lines, observations };
}

/** Re-export for CLI --list */
export { HOLE_IDS };
