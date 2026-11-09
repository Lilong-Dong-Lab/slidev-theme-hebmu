#!/usr/bin/env node
/**
 * CLI for implement clearance (#61).
 *
 * Usage:
 *   npm run check:implement-clearance -- --self-test
 *   npm run check:implement-clearance -- --fixture <path>
 *   npm run check:implement-clearance -- --issue N
 *
 * Exit: 0 startable | 2 open blockers | 1 unavailable (forge/parse/closed).
 */
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  buildSnapshotFromWire,
  evaluateImplementClearance,
  parseBlockedByFallback,
  snapshotFromFixture,
} from "./implement-clearance.mjs";

/**
 * @typedef {import("./implement-clearance.mjs").ImplementClearanceVerdict} ImplementClearanceVerdict
 * @typedef {import("./implement-clearance.mjs").GetIssueState} GetIssueState
 * @typedef {import("./implement-clearance.mjs").IssueClearanceSnapshot} IssueClearanceSnapshot
 */

/**
 * @param {ImplementClearanceVerdict} verdict
 * @param {{ stdout?: NodeJS.WritableStream; stderr?: NodeJS.WritableStream }} [io]
 * @returns {number}
 */
export function printVerdict(verdict, io = {}) {
  const out = io.stdout ?? process.stdout;
  const err = io.stderr ?? process.stderr;
  if (verdict.kind === "startable") {
    out.write(`startable: #${verdict.issue}\n`);
    return 0;
  }
  if (verdict.kind === "blocked") {
    err.write(`blocked: #${verdict.issue} — ${verdict.reason}\n`);
    for (const b of verdict.openBlockers) {
      err.write(`  blocker #${b.number}: ${b.title}\n`);
    }
    return 2;
  }
  err.write(`unavailable: ${verdict.reason}\n`);
  return 1;
}

/**
 * Default forge read via `gh issue view`.
 *
 * @param {number} issue
 * @returns {Promise<unknown>}
 */
export async function fetchIssueWire(issue) {
  const r = spawnSync(
    "gh",
    [
      "issue",
      "view",
      String(issue),
      "--json",
      "number,title,state,body,blockedBy",
    ],
    { encoding: "utf8" },
  );
  if (r.error) throw r.error;
  if (r.status !== 0) {
    throw new Error(
      (r.stderr || r.stdout || `gh issue view ${issue} failed`).trim(),
    );
  }
  return JSON.parse(r.stdout);
}

/**
 * @param {number} n
 * @returns {Promise<"OPEN" | "CLOSED" | null>}
 */
export async function defaultGetIssueState(n) {
  const r = spawnSync(
    "gh",
    ["issue", "view", String(n), "--json", "state"],
    { encoding: "utf8" },
  );
  if (r.error || r.status !== 0) return null;
  try {
    const obj = JSON.parse(r.stdout);
    const s = typeof obj?.state === "string" ? obj.state.toUpperCase() : "";
    if (s === "OPEN" || s === "CLOSED") return s;
    return null;
  } catch {
    return null;
  }
}

/**
 * @param {string} path
 * @param {GetIssueState} [getIssueState]
 * @returns {Promise<IssueClearanceSnapshot>}
 */
export async function loadFixture(path, getIssueState) {
  const raw = JSON.parse(readFileSync(path, "utf8"));
  if (raw && typeof raw === "object" && Array.isArray(raw.openBlockers)) {
    return snapshotFromFixture(raw);
  }
  if (raw && typeof raw === "object" && raw.wire) {
    const table =
      raw.resolvedStates && typeof raw.resolvedStates === "object"
        ? /** @type {Record<string, string>} */ (raw.resolvedStates)
        : {};
    const resolver =
      getIssueState ??
      ((n) => {
        const v = table[String(n)] ?? table[`#${n}`];
        if (v === "OPEN" || v === "CLOSED") return v;
        return null;
      });
    return buildSnapshotFromWire(raw.wire, resolver);
  }
  if (raw && typeof raw === "object" && "number" in raw && "state" in raw) {
    if (
      raw.blockedBy != null ||
      raw.body != null ||
      raw.issue_dependencies_summary != null
    ) {
      const table =
        raw.resolvedStates && typeof raw.resolvedStates === "object"
          ? /** @type {Record<string, string>} */ (raw.resolvedStates)
          : {};
      const resolver =
        getIssueState ??
        ((n) => {
          const v = table[String(n)] ?? table[`#${n}`];
          if (v === "OPEN" || v === "CLOSED") return v;
          return null;
        });
      const { resolvedStates: _drop, ...wire } = raw;
      return buildSnapshotFromWire(wire, resolver);
    }
    return snapshotFromFixture(raw);
  }
  throw new Error(
    "fixture must be a snapshot {number,state,openBlockers} or wire (+ optional resolvedStates)",
  );
}

/**
 * Offline fixtures covering MERGED self-test cases. No network.
 *
 * @returns {number} 0 on pass, 1 on fail
 */
export function runSelfTest() {
  /** @type {{ name: string; ok: boolean; detail?: string }[]} */
  const results = [];

  function check(name, cond, detail = "") {
    results.push({ name, ok: Boolean(cond), detail });
  }

  {
    const v = evaluateImplementClearance({
      number: 73,
      state: "OPEN",
      openBlockers: [
        {
          number: 72,
          title: "reflect: pending Accepted approval (sess)",
          state: "OPEN",
        },
      ],
    });
    check(
      "OPEN + open blocker → blocked/2",
      v.kind === "blocked" && v.exitCode === 2 && v.openBlockers.length === 1,
      v.kind,
    );
  }

  {
    const v = evaluateImplementClearance({
      number: 73,
      state: "OPEN",
      openBlockers: [],
    });
    check(
      "OPEN + no open blockers → startable/0",
      v.kind === "startable" && v.exitCode === 0,
      v.kind,
    );
  }

  {
    const v = evaluateImplementClearance({
      number: 73,
      state: "CLOSED",
      openBlockers: [],
    });
    check(
      "CLOSED target → unavailable/1",
      v.kind === "unavailable" && v.exitCode === 1,
      v.kind,
    );
  }

  check(
    "parseBlockedByFallback top line",
    JSON.stringify(parseBlockedByFallback("Blocked by: #72, #73\nrest")) ===
      JSON.stringify([72, 73]),
  );
  check(
    "parseBlockedByFallback ignores later lines",
    parseBlockedByFallback("Title\n\nBlocked by: #9\n").length === 0,
  );

  return (async () => {
    {
      const snap = await buildSnapshotFromWire(
        {
          number: 80,
          state: "OPEN",
          body: "Blocked by: #72\n\nTags: reflect-backlog\n",
          blockedBy: { nodes: [] },
        },
        (n) => (n === 72 ? "CLOSED" : null),
      );
      const v = evaluateImplementClearance(snap);
      check(
        "body cites CLOSED blocker only → startable/0",
        v.kind === "startable" &&
          v.exitCode === 0 &&
          snap.openBlockers.length === 0,
        v.kind,
      );
    }

    {
      const snap = await buildSnapshotFromWire(
        {
          number: 81,
          state: "OPEN",
          body: "Blocked by: #72\n\nTags: reflect-backlog\n",
          blockedBy: { nodes: [] },
        },
        (n) => (n === 72 ? "OPEN" : null),
      );
      const v = evaluateImplementClearance(snap);
      check(
        "body cites OPEN blocker → blocked/2",
        v.kind === "blocked" &&
          v.exitCode === 2 &&
          snap.openBlockers.some((b) => b.number === 72),
        v.kind,
      );
    }

    {
      const snap = await buildSnapshotFromWire(
        {
          number: 82,
          state: "OPEN",
          body: "Blocked by: #99\n\nhello\n",
          blockedBy: { nodes: [] },
        },
        (n) => (n === 99 ? "OPEN" : null),
      );
      const v = evaluateImplementClearance(snap);
      check(
        "native empty nodes + body OPEN → blocked/2",
        v.kind === "blocked" && v.exitCode === 2,
        v.kind,
      );
    }

    {
      const snap = await buildSnapshotFromWire(
        {
          number: 83,
          state: "OPEN",
          body: "",
          blockedBy: {
            nodes: [
              { number: 10, title: "done", state: "CLOSED" },
              { number: 11, title: "still open", state: "OPEN" },
            ],
          },
        },
        () => null,
      );
      const v = evaluateImplementClearance(snap);
      check(
        "native OPEN node preferred → blocked/2",
        v.kind === "blocked" &&
          v.openBlockers.length === 1 &&
          v.openBlockers[0].number === 11,
        v.kind,
      );
    }

    const failed = results.some((r) => !r.ok);
    for (const r of results) {
      const mark = r.ok ? "PASS" : "FAIL";
      const line = `${mark} ${r.name}${r.detail && !r.ok ? ` (${r.detail})` : ""}`;
      if (r.ok) console.log(line);
      else console.error(line);
    }
    if (failed) {
      console.error("check-implement-clearance --self-test failed");
      return 1;
    }
    console.log("check-implement-clearance --self-test: all passed");
    return 0;
  })();
}

/**
 * @param {readonly string[]} argv
 * @param {{
 *   fetchWire?: (n: number) => Promise<unknown>;
 *   getIssueState?: GetIssueState;
 * }} [deps]
 * @returns {Promise<number>}
 */
export async function main(argv = process.argv.slice(2), deps = {}) {
  if (argv.includes("--self-test")) {
    return runSelfTest();
  }

  const fixtureIdx = argv.indexOf("--fixture");
  if (fixtureIdx >= 0) {
    const path = argv[fixtureIdx + 1];
    if (!path) {
      console.error("usage: --fixture <path>");
      return 1;
    }
    try {
      const snap = await loadFixture(path, deps.getIssueState);
      return printVerdict(evaluateImplementClearance(snap));
    } catch (err) {
      console.error(err instanceof Error ? err.message : err);
      return 1;
    }
  }

  const issueIdx = argv.indexOf("--issue");
  if (issueIdx >= 0) {
    const raw = argv[issueIdx + 1];
    const n = Number(raw);
    if (!Number.isInteger(n) || n <= 0) {
      console.error("usage: --issue N");
      return 1;
    }
    const fetchWire = deps.fetchWire ?? fetchIssueWire;
    const getIssueState = deps.getIssueState ?? defaultGetIssueState;
    try {
      const wire = await fetchWire(n);
      const snap = await buildSnapshotFromWire(wire, getIssueState);
      return printVerdict(evaluateImplementClearance(snap));
    } catch (err) {
      console.error(err instanceof Error ? err.message : err);
      return 1;
    }
  }

  console.error(
    "usage: check-implement-clearance --self-test | --fixture <path> | --issue N",
  );
  return 1;
}

const isDirectRun =
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === process.argv[1];

if (isDirectRun) {
  main(process.argv.slice(2))
    .then((code) => {
      process.exitCode = code;
    })
    .catch((err) => {
      console.error(err instanceof Error ? err.message : err);
      process.exitCode = 1;
    });
}
