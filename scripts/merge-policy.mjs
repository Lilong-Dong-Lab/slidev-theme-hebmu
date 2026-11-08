#!/usr/bin/env node

/**
 * @typedef {{ kind: "approved" }
 *   | { kind: "review-required" }
 *   | { kind: "changes-requested" }
 *   | { kind: "ci-only"; reason: "no-required-reviews" | "unprotected-base" }
 *   | { kind: "unknown"; detail: string }} ReviewClearance
 *
 * @typedef {{ kind: "shipping-verdict"; verdict: "PASS" | "FAIL" }
 *   | { kind: "explicit-override"; by: string; reason: string }} MergeAttestation
 *
 * @typedef {{
 *   disposition: "allow";
 *   exitCode: 0;
 *   clearance: ReviewClearance;
 *   attestation: MergeAttestation | null;
 * } | {
 *   disposition: "require-attestation";
 *   exitCode: 2;
 *   clearance: { kind: "ci-only"; reason: "no-required-reviews" | "unprotected-base" };
 *   missing: "shipping-verdict-or-override";
 * } | {
 *   disposition: "block";
 *   exitCode: 3;
 *   clearance: ReviewClearance;
 *   reason: "review-required" | "changes-requested" | "unknown" | "attestation-rejected";
 * }} MergeDisposition
 *
 * @typedef {{
 *   clearance: ReviewClearance;
 *   attestation: MergeAttestation | null;
 * }} EvaluateMergeArgs
 */

/**
 * @param {MergeAttestation | null} attestation
 * @returns {boolean}
 */
export function isValidAttestation(attestation) {
  if (!attestation) return false;
  if (attestation.kind === "shipping-verdict") {
    return attestation.verdict === "PASS";
  }
  if (attestation.kind === "explicit-override") {
    return Boolean(attestation.by.trim() && attestation.reason.trim());
  }
  return false;
}

/**
 * @param {EvaluateMergeArgs} args
 * @returns {MergeDisposition}
 */
export function evaluateMergeDisposition(args) {
  const { clearance, attestation } = args;

  switch (clearance.kind) {
    case "approved":
      return {
        disposition: "allow",
        exitCode: 0,
        clearance,
        attestation,
      };
    case "ci-only":
      if (attestation && !isValidAttestation(attestation)) {
        return {
          disposition: "block",
          exitCode: 3,
          clearance,
          reason: "attestation-rejected",
        };
      }
      if (isValidAttestation(attestation)) {
        return {
          disposition: "allow",
          exitCode: 0,
          clearance,
          attestation,
        };
      }
      return {
        disposition: "require-attestation",
        exitCode: 2,
        clearance,
        missing: "shipping-verdict-or-override",
      };
    case "review-required":
      return {
        disposition: "block",
        exitCode: 3,
        clearance,
        reason: "review-required",
      };
    case "changes-requested":
      return {
        disposition: "block",
        exitCode: 3,
        clearance,
        reason: "changes-requested",
      };
    case "unknown":
      return {
        disposition: "block",
        exitCode: 3,
        clearance,
        reason: "unknown",
      };
    default: {
      const _exhaustive = /** @type {never} */ (clearance);
      return {
        disposition: "block",
        exitCode: 3,
        clearance: _exhaustive,
        reason: "unknown",
      };
    }
  }
}

/**
 * @param {readonly string[]} argv
 * @param {string} flag
 * @returns {string | undefined}
 */
function flagValue(argv, flag) {
  const i = argv.indexOf(flag);
  if (i < 0 || i + 1 >= argv.length) return undefined;
  const v = argv[i + 1];
  if (v.startsWith("--")) return undefined;
  return v;
}

/**
 * @param {readonly string[]} argv
 * @returns {MergeAttestation | null}
 */
export function parseAttestationFromArgv(argv) {
  const hasVerdict = argv.includes("--shipping-verdict");
  const hasOverride = argv.includes("--merge-override");
  const hasOverrideReason = argv.includes("--merge-override-reason");

  if (hasVerdict && (hasOverride || hasOverrideReason)) {
    throw new Error(
      "merge-policy: use either --shipping-verdict or --merge-override, not both",
    );
  }

  if (hasVerdict) {
    const verdict = flagValue(argv, "--shipping-verdict");
    if (verdict === undefined) {
      throw new Error("merge-policy: --shipping-verdict requires a value");
    }
    if (verdict !== "PASS" && verdict !== "FAIL") {
      throw new Error(
        `merge-policy: --shipping-verdict must be PASS or FAIL, got ${verdict}`,
      );
    }
    return { kind: "shipping-verdict", verdict };
  }

  if (hasOverride || hasOverrideReason) {
    const by = flagValue(argv, "--merge-override");
    const reason = flagValue(argv, "--merge-override-reason");
    if (!by || !reason) {
      throw new Error(
        "merge-policy: --merge-override and --merge-override-reason both required",
      );
    }
    return { kind: "explicit-override", by, reason };
  }

  return null;
}

/**
 * @param {MergeDisposition} decision
 * @returns {string}
 */
export function formatDispositionPretty(decision) {
  const lines = [
    "--- hebmu merge disposition ---",
    `disposition=${decision.disposition}`,
    `exitCode=${decision.exitCode}`,
    `clearance=${decision.clearance.kind}`,
  ];
  if (decision.disposition === "require-attestation") {
    lines.push(`missing=${decision.missing}`);
    lines.push(
      "hint=pass --shipping-verdict PASS after independent Shipping VERDICT",
    );
  }
  if (decision.disposition === "block") {
    lines.push(`reason=${decision.reason}`);
  }
  if (decision.disposition === "allow" && decision.attestation) {
    lines.push(`attestation=${decision.attestation.kind}`);
  }
  return lines.join("\n") + "\n";
}

/**
 * @param {{ pr: number; decision: MergeDisposition }} args
 * @returns {Record<string, unknown>}
 */
export function buildDispositionSidecar(args) {
  const { pr, decision } = args;
  /** @type {Record<string, unknown>} */
  const out = {
    schema: "hebmu.merge-disposition.v1",
    pr,
    disposition: decision.disposition,
    exitCode: decision.exitCode,
    clearance: decision.clearance,
  };
  if (decision.disposition === "require-attestation") {
    out.missing = decision.missing;
  }
  if (decision.disposition === "block") {
    out.reason = decision.reason;
  }
  if (decision.disposition === "allow") {
    out.attestation = decision.attestation;
  }
  return out;
}
