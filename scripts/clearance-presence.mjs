#!/usr/bin/env node
/**
 * Clearance presence / provenance (#48).
 *
 * Owns the wire markers and the assert presence gate so bare READY/STATUS
 * cannot count as hebmu-cleared. Disposition stays in merge-policy.mjs.
 */
import { evaluateMergeDisposition } from "./merge-policy.mjs";

/** @type {string} */
export const CLEARANCE_PRETTY_HEADER = "--- hebmu clearance ---";

/** @type {"hebmu.clearance.v1"} */
export const CLEARANCE_SCHEMA = "hebmu.clearance.v1";

/**
 * @typedef {{ kind: "unprotected" }
 *   | { kind: "protected"; requiredApprovingReviewCount: number }
 *   | { kind: "unavailable"; detail: string }} ProtectionSummary
 *
 * @typedef {{ kind: "approved" }
 *   | { kind: "review-required" }
 *   | { kind: "changes-requested" }
 *   | { kind: "ci-only"; reason: "no-required-reviews" | "unprotected-base" }
 *   | { kind: "unknown"; detail: string }} ReviewClearance
 *
 * @typedef {{ form: "json-sidecar"; schema: "hebmu.clearance.v1"; body: Record<string, unknown> }
 *   | { form: "pretty-block"; text: string }} ClearanceWire
 *
 * @typedef {{
 *   kind: "present";
 *   verdictKind: "READY" | "STATUS";
 *   clearance: ReviewClearance;
 *   protection: ProtectionSummary;
 *   wire: ClearanceWire;
 * } | {
 *   kind: "absent";
 *   reason: "no-terminal-verdict" | "terminal-without-clearance";
 * }} ClearancePresence
 *
 * @typedef {{
 *   readonly __brand: "HebmuClearedVerdict";
 *   readonly verdictKind: "READY" | "STATUS";
 *   readonly clearance: ReviewClearance;
 *   readonly protection: ProtectionSummary;
 *   readonly upstreamExit: number;
 * }} HebmuClearedVerdict
 *
 * @typedef {{
 *   kind: "missing-clearance";
 *   exitCode: 4;
 *   detail: string;
 * } | {
 *   kind: "disposition";
 *   decision: import("./merge-policy.mjs").MergeDisposition;
 * }} AssertOutcome
 */

/**
 * @param {string} stdout
 * @returns {"READY" | "STATUS" | null}
 */
function detectTerminalVerdict(stdout) {
  const trimmed = stdout.replace(/\s+$/, "");
  if (!trimmed) return null;

  if (/^READY:/m.test(trimmed) && !trimmed.trimStart().startsWith("{")) {
    return "READY";
  }
  if (/^\| PR \| CI \|/m.test(trimmed) && !trimmed.trimStart().startsWith("{")) {
    return "STATUS";
  }

  /** @type {"READY" | "STATUS" | null} */
  let statusHit = null;
  for (const line of trimmed.split("\n")) {
    const t = line.trim();
    if (!t.startsWith("{")) continue;
    try {
      const obj = JSON.parse(t);
      if (!obj || typeof obj !== "object") continue;
      const rec = /** @type {Record<string, unknown>} */ (obj);
      if (rec.schema === CLEARANCE_SCHEMA) continue;
      if (rec.kind === "READY") return "READY";
      if (rec.kind === "STATUS" && !statusHit) statusHit = "STATUS";
    } catch {
      // keep scanning
    }
  }
  return statusHit;
}

/**
 * @param {string} stdout
 * @returns {{ form: "json-sidecar"; schema: "hebmu.clearance.v1"; body: Record<string, unknown> } | null}
 */
function findJsonSidecar(stdout) {
  for (const line of stdout.split("\n")) {
    const t = line.trim();
    if (!t.startsWith("{")) continue;
    try {
      const obj = JSON.parse(t);
      if (
        obj &&
        typeof obj === "object" &&
        /** @type {Record<string, unknown>} */ (obj).schema === CLEARANCE_SCHEMA
      ) {
        return {
          form: "json-sidecar",
          schema: CLEARANCE_SCHEMA,
          body: /** @type {Record<string, unknown>} */ (obj),
        };
      }
    } catch {
      // keep scanning
    }
  }
  return null;
}

/**
 * @param {string} stdout
 * @returns {{ form: "pretty-block"; text: string } | null}
 */
function findPrettyBlock(stdout) {
  const idx = stdout.indexOf(CLEARANCE_PRETTY_HEADER);
  if (idx < 0) return null;
  const fromHeader = stdout.slice(idx);
  const end = fromHeader.search(/\n\n/);
  const text = end >= 0 ? fromHeader.slice(0, end + 1) : fromHeader;
  return { form: "pretty-block", text };
}

/**
 * @param {unknown} raw
 * @returns {ReviewClearance | null}
 */
function clearanceFromUnknown(raw) {
  if (!raw || typeof raw !== "object") return null;
  const rec = /** @type {Record<string, unknown>} */ (raw);
  const kind = rec.kind;
  if (kind === "approved") return { kind: "approved" };
  if (kind === "review-required") return { kind: "review-required" };
  if (kind === "changes-requested") return { kind: "changes-requested" };
  if (kind === "ci-only") {
    const reason = rec.reason;
    if (reason === "no-required-reviews" || reason === "unprotected-base") {
      return { kind: "ci-only", reason };
    }
    return null;
  }
  if (kind === "unknown") {
    return {
      kind: "unknown",
      detail: typeof rec.detail === "string" ? rec.detail : "unknown",
    };
  }
  return null;
}

/**
 * @param {unknown} raw
 * @returns {ProtectionSummary | null}
 */
function protectionFromUnknown(raw) {
  if (!raw || typeof raw !== "object") return null;
  const rec = /** @type {Record<string, unknown>} */ (raw);
  if (rec.kind === "unprotected") return { kind: "unprotected" };
  if (rec.kind === "protected") {
    const count = Number(rec.requiredApprovingReviewCount ?? 0);
    return {
      kind: "protected",
      requiredApprovingReviewCount: Number.isFinite(count) ? count : 0,
    };
  }
  if (rec.kind === "unavailable") {
    return {
      kind: "unavailable",
      detail: typeof rec.detail === "string" ? rec.detail : "unavailable",
    };
  }
  return null;
}

/**
 * @param {string} block
 * @returns {{ clearance: ReviewClearance; protection: ProtectionSummary } | null}
 */
function parsePrettyClearanceFields(block) {
  const clearanceKind = block.match(/^reviewClearance=(.*)$/m)?.[1]?.trim();
  if (!clearanceKind) return null;

  /** @type {ReviewClearance | null} */
  let clearance = null;
  if (clearanceKind === "approved") clearance = { kind: "approved" };
  else if (clearanceKind === "review-required") {
    clearance = { kind: "review-required" };
  } else if (clearanceKind === "changes-requested") {
    clearance = { kind: "changes-requested" };
  } else if (clearanceKind === "ci-only") {
    const reason = block.match(/^reviewClearanceReason=(.*)$/m)?.[1]?.trim();
    if (reason === "no-required-reviews" || reason === "unprotected-base") {
      clearance = { kind: "ci-only", reason };
    }
  } else if (clearanceKind === "unknown") {
    const detail =
      block.match(/^reviewClearanceDetail=(.*)$/m)?.[1]?.trim() ?? "unknown";
    clearance = { kind: "unknown", detail };
  }
  if (!clearance) return null;

  const protectionKind = block.match(/^protection=(.*)$/m)?.[1]?.trim();
  /** @type {ProtectionSummary | null} */
  let protection = null;
  if (protectionKind === "unprotected") protection = { kind: "unprotected" };
  else if (protectionKind === "protected") {
    const count = Number(
      block.match(/^protectionRequiredApprovals=(.*)$/m)?.[1]?.trim() ?? 0,
    );
    protection = {
      kind: "protected",
      requiredApprovingReviewCount: Number.isFinite(count) ? count : 0,
    };
  } else if (protectionKind === "unavailable") {
    const detail =
      block.match(/^protectionDetail=(.*)$/m)?.[1]?.trim() ?? "unavailable";
    protection = { kind: "unavailable", detail };
  }
  if (!protection) return null;

  return { clearance, protection };
}

/**
 * Single source of truth for "was this stdout hebmu-cleared?"
 *
 * @param {string} stdout
 * @returns {ClearancePresence}
 */
export function parseClearancePresence(stdout) {
  const text = typeof stdout === "string" ? stdout : "";
  const sidecar = findJsonSidecar(text);
  if (sidecar) {
    const body = sidecar.body;
    const clearance = clearanceFromUnknown(body.clearance);
    const protection = protectionFromUnknown(body.protection);
    const verdictRaw = body.verdictKind;
    const verdictKind =
      verdictRaw === "READY" || verdictRaw === "STATUS"
        ? verdictRaw
        : detectTerminalVerdict(text) ?? "READY";
    if (clearance && protection) {
      return {
        kind: "present",
        verdictKind,
        clearance,
        protection,
        wire: sidecar,
      };
    }
  }

  const pretty = findPrettyBlock(text);
  if (pretty) {
    const fields = parsePrettyClearanceFields(pretty.text);
    if (fields) {
      const verdictKind = detectTerminalVerdict(text) ?? "READY";
      return {
        kind: "present",
        verdictKind,
        clearance: fields.clearance,
        protection: fields.protection,
        wire: pretty,
      };
    }
  }

  if (detectTerminalVerdict(text)) {
    return { kind: "absent", reason: "terminal-without-clearance" };
  }
  return { kind: "absent", reason: "no-terminal-verdict" };
}

/**
 * @param {string} stdout
 * @returns {boolean}
 */
export function stdoutHasHebmuClearance(stdout) {
  return parseClearancePresence(stdout).kind === "present";
}

/**
 * @param {{
 *   presence: Extract<ClearancePresence, { kind: "present" }>;
 *   upstreamExit: number;
 * }} args
 * @returns {HebmuClearedVerdict}
 */
export function mintClearedVerdict(args) {
  if (args.presence.kind !== "present") {
    throw new Error("mintClearedVerdict: presence must be present");
  }
  return {
    __brand: "HebmuClearedVerdict",
    verdictKind: args.presence.verdictKind,
    clearance: args.presence.clearance,
    protection: args.presence.protection,
    upstreamExit: args.upstreamExit,
  };
}

/**
 * Assert gate before merge-policy. Pure.
 * Callers must passthrough upstream exit for no-terminal-verdict themselves
 * (ADR 0003 / #48 graft); only terminal-without-clearance hard-fails here.
 *
 * @param {{
 *   presence: ClearancePresence;
 *   clearance?: ReviewClearance | null;
 *   attestation: import("./merge-policy.mjs").MergeAttestation | null;
 *   headRefOid: string | null;
 * }} args
 * @returns {AssertOutcome}
 */
export function advanceAssertPhase(args) {
  const { presence } = args;
  if (presence.kind === "absent") {
    if (presence.reason === "no-terminal-verdict") {
      throw new Error(
        "advanceAssertPhase: no-terminal-verdict must passthrough at caller",
      );
    }
    return {
      kind: "missing-clearance",
      exitCode: 4,
      detail: "READY/STATUS without hebmu clearance markers",
    };
  }

  const clearance = args.clearance ?? presence.clearance;
  const decision = evaluateMergeDisposition({
    clearance,
    attestation: args.attestation,
    headRefOid: args.headRefOid,
  });
  return { kind: "disposition", decision };
}

/**
 * Map assert stdout + context to a process exit code.
 * no-terminal-verdict → upstreamExit; terminal-without-clearance → 4;
 * present → disposition 0/2/3.
 *
 * @param {{
 *   stdout: string;
 *   upstreamExit: number;
 *   clearance?: ReviewClearance | null;
 *   attestation: import("./merge-policy.mjs").MergeAttestation | null;
 *   headRefOid: string | null;
 * }} args
 * @returns {number}
 */
export function resolveAssertProcessExit(args) {
  const presence = parseClearancePresence(args.stdout);
  if (
    presence.kind === "absent" &&
    presence.reason === "no-terminal-verdict"
  ) {
    return args.upstreamExit;
  }
  const outcome = advanceAssertPhase({
    presence,
    clearance: args.clearance ?? null,
    attestation: args.attestation,
    headRefOid: args.headRefOid,
  });
  if (outcome.kind === "missing-clearance") return outcome.exitCode;
  return outcome.decision.exitCode;
}
