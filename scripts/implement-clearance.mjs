#!/usr/bin/env node
/**
 * Implement clearance over open-blocker snapshots (#61).
 *
 * Pure evaluator + wire→snapshot helpers. No label predicate.
 */

/**
 * @typedef {{
 *   readonly number: number;
 *   readonly title: string;
 *   readonly state: "OPEN";
 * }} OpenBlocker
 *
 * @typedef {{
 *   readonly number: number;
 *   readonly state: "OPEN" | "CLOSED";
 *   readonly openBlockers: readonly OpenBlocker[];
 * }} IssueClearanceSnapshot
 *
 * @typedef {{
 *   readonly kind: "startable";
 *   readonly issue: number;
 *   readonly exitCode: 0;
 * } | {
 *   readonly kind: "blocked";
 *   readonly issue: number;
 *   readonly openBlockers: readonly OpenBlocker[];
 *   readonly reason: string;
 *   readonly exitCode: 2;
 * } | {
 *   readonly kind: "unavailable";
 *   readonly issue?: number;
 *   readonly reason: string;
 *   readonly exitCode: 1;
 * }} ImplementClearanceVerdict
 *
 * @typedef {"OPEN" | "CLOSED" | null} IssueStateResult
 *
 * @typedef {(n: number) => IssueStateResult | Promise<IssueStateResult>} GetIssueState
 */

/**
 * Top-of-body `Blocked by: #a, #b` only. Later mentions are ignored.
 *
 * @param {string} body
 * @returns {readonly number[]}
 */
export function parseBlockedByFallback(body) {
  if (typeof body !== "string" || !body) return [];
  const lines = body.replace(/^\uFEFF/, "").split(/\r?\n/);
  let first = "";
  for (const line of lines) {
    if (line.trim() !== "") {
      first = line;
      break;
    }
  }
  const m = first.match(/^\s*Blocked by:\s*(.+?)\s*$/i);
  if (!m) return [];
  const nums = [];
  for (const part of m[1].matchAll(/#(\d+)/g)) {
    const n = Number(part[1]);
    if (Number.isInteger(n) && n > 0) nums.push(n);
  }
  return nums;
}

/**
 * @param {unknown} raw
 * @returns {"OPEN" | "CLOSED" | null}
 */
export function normalizeIssueState(raw) {
  if (typeof raw !== "string") return null;
  const s = raw.trim().toUpperCase();
  if (s === "OPEN") return "OPEN";
  if (s === "CLOSED") return "CLOSED";
  return null;
}

/**
 * Pure policy. Snapshot must already list only OPEN blockers.
 *
 * @param {IssueClearanceSnapshot} snapshot
 * @returns {ImplementClearanceVerdict}
 */
export function evaluateImplementClearance(snapshot) {
  if (!snapshot || typeof snapshot !== "object") {
    return {
      kind: "unavailable",
      reason: "invalid snapshot",
      exitCode: 1,
    };
  }
  const number = Number(snapshot.number);
  if (!Number.isInteger(number) || number <= 0) {
    return {
      kind: "unavailable",
      reason: "invalid issue number",
      exitCode: 1,
    };
  }
  if (snapshot.state !== "OPEN") {
    return {
      kind: "unavailable",
      issue: number,
      reason: `issue #${number} is not OPEN (${snapshot.state ?? "missing"})`,
      exitCode: 1,
    };
  }
  const openBlockers = Array.isArray(snapshot.openBlockers)
    ? snapshot.openBlockers
    : [];
  if (openBlockers.length > 0) {
    const ids = openBlockers.map((b) => `#${b.number}`).join(", ");
    return {
      kind: "blocked",
      issue: number,
      openBlockers,
      reason: `open blockers: ${ids}`,
      exitCode: 2,
    };
  }
  return { kind: "startable", issue: number, exitCode: 0 };
}

/**
 * @param {unknown} node
 * @returns {OpenBlocker | null}
 */
function openBlockerFromNode(node) {
  if (!node || typeof node !== "object") return null;
  const rec = /** @type {Record<string, unknown>} */ (node);
  if (normalizeIssueState(rec.state) !== "OPEN") return null;
  const n = Number(rec.number);
  if (!Number.isInteger(n) || n <= 0) return null;
  const title = typeof rec.title === "string" ? rec.title : `#${n}`;
  return { number: n, title, state: "OPEN" };
}

/**
 * Native OPEN blockers from `blockedBy.nodes` or a positive summary count.
 *
 * @param {Record<string, unknown>} wire
 * @returns {{ kind: "nodes"; blockers: OpenBlocker[] }
 *   | { kind: "summary"; count: number }
 *   | { kind: "absent" }}
 */
export function readNativeOpenBlockers(wire) {
  const blockedBy = wire.blockedBy;
  if (blockedBy && typeof blockedBy === "object") {
    const nodes = /** @type {Record<string, unknown>} */ (blockedBy).nodes;
    if (Array.isArray(nodes)) {
      /** @type {OpenBlocker[]} */
      const blockers = [];
      for (const node of nodes) {
        const b = openBlockerFromNode(node);
        if (b) blockers.push(b);
      }
      return { kind: "nodes", blockers };
    }
  }

  const summary = wire.issue_dependencies_summary;
  if (summary && typeof summary === "object") {
    const count = Number(
      /** @type {Record<string, unknown>} */ (summary).blocked_by,
    );
    if (Number.isFinite(count) && count > 0) {
      return { kind: "summary", count };
    }
  }

  return { kind: "absent" };
}

/**
 * Resolve body-cited issues; count OPEN only. null state → throw (fail closed).
 *
 * @param {string} body
 * @param {GetIssueState} getIssueState
 * @returns {Promise<OpenBlocker[]>}
 */
export async function resolveBodyOpenBlockers(body, getIssueState) {
  const cited = parseBlockedByFallback(body);
  /** @type {OpenBlocker[]} */
  const open = [];
  for (const n of cited) {
    const state = await getIssueState(n);
    if (state === null) {
      throw new Error(`cannot resolve state for cited blocker #${n}`);
    }
    if (state === "OPEN") {
      open.push({ number: n, title: `#${n}`, state: "OPEN" });
    }
  }
  return open;
}

/**
 * Build a domain snapshot from gh-like wire.
 * Prefer native OPEN nodes / positive summary; else body parse + resolve.
 * Empty native nodes still consult the body (forge-portability).
 *
 * @param {unknown} wire
 * @param {GetIssueState} getIssueState
 * @returns {Promise<IssueClearanceSnapshot>}
 */
export async function buildSnapshotFromWire(wire, getIssueState) {
  if (!wire || typeof wire !== "object") {
    throw new Error("wire must be an object");
  }
  const rec = /** @type {Record<string, unknown>} */ (wire);
  const number = Number(rec.number);
  if (!Number.isInteger(number) || number <= 0) {
    throw new Error("wire.number must be a positive integer");
  }
  const state = normalizeIssueState(rec.state);
  if (!state) {
    throw new Error(`wire.state missing or invalid (${rec.state})`);
  }

  const native = readNativeOpenBlockers(rec);
  /** @type {OpenBlocker[]} */
  let openBlockers = [];

  if (native.kind === "nodes" && native.blockers.length > 0) {
    openBlockers = native.blockers;
  } else if (native.kind === "summary") {
    openBlockers = [
      {
        number: 0,
        title: `(${native.count} open via issue_dependencies_summary)`,
        state: "OPEN",
      },
    ];
  } else {
    // nodes:[] / all-closed / absent → body fallback with open-state resolve
    const body = typeof rec.body === "string" ? rec.body : "";
    openBlockers = await resolveBodyOpenBlockers(body, getIssueState);
  }

  return { number, state, openBlockers };
}

/**
 * Accept a pre-built snapshot object (fixture path).
 *
 * @param {unknown} raw
 * @returns {IssueClearanceSnapshot}
 */
export function snapshotFromFixture(raw) {
  if (!raw || typeof raw !== "object") {
    throw new Error("fixture must be an object");
  }
  const rec = /** @type {Record<string, unknown>} */ (raw);
  const number = Number(rec.number);
  if (!Number.isInteger(number) || number <= 0) {
    throw new Error("fixture.number must be a positive integer");
  }
  const state = normalizeIssueState(rec.state);
  if (!state) {
    throw new Error(`fixture.state missing or invalid (${rec.state})`);
  }
  const list = Array.isArray(rec.openBlockers) ? rec.openBlockers : [];
  /** @type {OpenBlocker[]} */
  const openBlockers = [];
  for (const item of list) {
    const b = openBlockerFromNode(
      item && typeof item === "object"
        ? { .../** @type {object} */ (item), state: "OPEN" }
        : item,
    );
    if (b) openBlockers.push(b);
  }
  return { number, state, openBlockers };
}
