#!/usr/bin/env node

/**
 * @typedef {{ kind: "approved" }
 *   | { kind: "review-required" }
 *   | { kind: "changes-requested" }
 *   | { kind: "ci-only"; reason: "no-required-reviews" | "unprotected-base" }
 *   | { kind: "unknown"; detail: string }} ReviewClearance
 *
 * @typedef {{
 *   kind: "verifier-bound-shipping";
 *   verdict: "PASS" | "FAIL";
 *   headRefOid: string;
 *   sealedAt: string;
 *   by?: string;
 * } | {
 *   kind: "explicit-override";
 *   by: string;
 *   reason: string;
 * }} MergeAttestation
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
 *   missing: "sealed-shipping-or-override";
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
 *   headRefOid: string | null;
 * }} EvaluateMergeArgs
 */

/**
 * Exact OID equality; empty / null never matches.
 *
 * @param {string | null | undefined} a
 * @param {string | null | undefined} b
 * @returns {boolean}
 */
export function oidsMatch(a, b) {
  if (!a || !b) return false;
  return a === b;
}

/**
 * Map a verifying-store domain value into a policy attestation.
 * Store already verified sig; unsigned wire never reaches here as branded.
 *
 * @param {import("./attestation-crypto.mjs").VerifierBoundAttestation | null | undefined} artifact
 * @returns {MergeAttestation | null}
 */
export function artifactToAttestation(artifact) {
  if (!artifact || artifact.__brand !== "VerifierBoundAttestation") return null;
  if (artifact.schema !== "hebmu.sealed-shipping.v3") return null;
  const { claims } = artifact;
  if (claims.verdict !== "PASS" && claims.verdict !== "FAIL") return null;
  if (typeof claims.headRefOid !== "string" || !claims.headRefOid) return null;
  if (typeof claims.sealedAt !== "string" || !claims.sealedAt) return null;
  /** @type {MergeAttestation} */
  const att = {
    kind: "verifier-bound-shipping",
    verdict: claims.verdict,
    headRefOid: claims.headRefOid,
    sealedAt: claims.sealedAt,
  };
  if (typeof claims.by === "string" && claims.by) att.by = claims.by;
  return att;
}

/**
 * Sealed PASS with no live tip (or tip ≠ seal) is stale/unbound — re-seal, not block.
 *
 * @param {MergeAttestation} attestation
 * @param {string | null | undefined} headRefOid
 * @returns {boolean}
 */
function isStaleOrUnboundSeal(attestation, headRefOid) {
  return (
    attestation.kind === "verifier-bound-shipping" &&
    attestation.verdict === "PASS" &&
    !oidsMatch(attestation.headRefOid, headRefOid)
  );
}

/**
 * @param {MergeAttestation | null} attestation
 * @param {string | null | undefined} headRefOid
 * @returns {boolean}
 */
export function isValidAttestation(attestation, headRefOid) {
  if (!attestation) return false;
  if (attestation.kind === "verifier-bound-shipping") {
    return (
      attestation.verdict === "PASS" &&
      oidsMatch(attestation.headRefOid, headRefOid)
    );
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
  const { clearance, attestation, headRefOid = null } = args;

  switch (clearance.kind) {
    case "approved":
      return {
        disposition: "allow",
        exitCode: 0,
        clearance,
        attestation,
      };
    case "ci-only":
      if (attestation && !isValidAttestation(attestation, headRefOid)) {
        if (isStaleOrUnboundSeal(attestation, headRefOid)) {
          return {
            disposition: "require-attestation",
            exitCode: 2,
            clearance,
            missing: "sealed-shipping-or-override",
          };
        }
        return {
          disposition: "block",
          exitCode: 3,
          clearance,
          reason: "attestation-rejected",
        };
      }
      if (isValidAttestation(attestation, headRefOid)) {
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
        missing: "sealed-shipping-or-override",
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

/** @type {string} */
export const SHIPPING_VERDICT_REMOVED =
  "merge-policy: --shipping-verdict removed; seal with seal-shipping then land-pr (or use --merge-override)";

/**
 * @param {unknown} err
 * @returns {boolean}
 */
export function isShippingVerdictRemovedError(err) {
  return err instanceof Error && err.message === SHIPPING_VERDICT_REMOVED;
}

/**
 * Argv attestation is override-only. Bare --shipping-verdict never yields a
 * valid attestation (hard throw).
 *
 * @param {readonly string[]} argv
 * @returns {MergeAttestation | null}
 */
export function parseAttestationFromArgv(argv) {
  const hasVerdict = argv.includes("--shipping-verdict");
  const hasOverride = argv.includes("--merge-override");
  const hasOverrideReason = argv.includes("--merge-override-reason");

  if (hasVerdict && (hasOverride || hasOverrideReason)) {
    throw new Error(
      "merge-policy: use either sealed-shipping (store) or --merge-override, not --shipping-verdict with override",
    );
  }

  if (hasVerdict) {
    throw new Error(SHIPPING_VERDICT_REMOVED);
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
      "hint=run seal-shipping after Shipping VERDICT PASS, then land-pr (no --shipping-verdict)",
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
