#!/usr/bin/env node
/**
 * Hebmu watch-pr enricher (#31).
 *
 * Runs upstream poteto-mode watch-pr unchanged, then on READY only attaches
 * review/protection clearance so babysit can tell CI-only green from review
 * clearance. Does not gate READY on APPROVED. Does not vendor upstream.
 *
 * Usage (via scripts/watch-pr):
 *   ./scripts/watch-pr --owner … --repo … --pr <n> --status-only --pretty
 *
 * Self-check:
 *   node scripts/watch-pr-clearance.mjs --self-test
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

// ---------------------------------------------------------------------------
// Pure domain
// ---------------------------------------------------------------------------

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
 */

/**
 * Classify review clearance from proof + protection.
 * Never upgrades or demotes upstream READY; classification only.
 *
 * @param {{ reviewDecision: string | null | undefined; protection: ProtectionSummary }} evidence
 * @returns {ReviewClearance}
 */
export function classifyReviewClearance(evidence) {
  const raw = evidence.reviewDecision;
  const decision = raw === "" || raw === undefined ? null : raw;
  const { protection } = evidence;

  if (decision === "APPROVED") return { kind: "approved" };
  if (decision === "REVIEW_REQUIRED") return { kind: "review-required" };
  if (decision === "CHANGES_REQUESTED") return { kind: "changes-requested" };

  if (protection.kind === "unprotected") {
    return { kind: "ci-only", reason: "unprotected-base" };
  }
  if (protection.kind === "protected") {
    if (protection.requiredApprovingReviewCount === 0) {
      return { kind: "ci-only", reason: "no-required-reviews" };
    }
    return {
      kind: "unknown",
      detail: "reviewDecision missing while requiredApprovingReviewCount > 0",
    };
  }
  return { kind: "unknown", detail: protection.detail };
}

/**
 * Parse gh branch protection HTTP into ProtectionSummary.
 * 404 → unprotected. 2xx → protected (count defaults to 0). Else unavailable.
 *
 * @param {number} status
 * @param {unknown} body
 * @returns {ProtectionSummary}
 */
export function parseProtectionHttp(status, body) {
  if (status === 404) return { kind: "unprotected" };
  if (status >= 200 && status < 300) {
    const reviews =
      body &&
      typeof body === "object" &&
      /** @type {{ required_pull_request_reviews?: { required_approving_review_count?: number } }} */ (
        body
      ).required_pull_request_reviews;
    const count = Number(reviews?.required_approving_review_count ?? 0);
    return {
      kind: "protected",
      requiredApprovingReviewCount: Number.isFinite(count) ? count : 0,
    };
  }
  const detail =
    body && typeof body === "object" && "message" in body
      ? String(/** @type {{ message: unknown }} */ (body).message)
      : `HTTP ${status}`;
  return { kind: "unavailable", detail };
}

/**
 * Pretty clearance block (candidate-2 header + candidate-1 keys).
 *
 * @param {ReviewClearance} clearance
 * @param {ProtectionSummary} protection
 * @returns {string}
 */
export function formatClearancePretty(clearance, protection) {
  const lines = ["--- hebmu clearance ---", `reviewClearance=${clearance.kind}`];
  if (clearance.kind === "ci-only") {
    lines.push(`reviewClearanceReason=${clearance.reason}`);
  }
  if (clearance.kind === "unknown") {
    lines.push(`reviewClearanceDetail=${clearance.detail}`);
  }
  lines.push(`protection=${protection.kind}`);
  if (protection.kind === "protected") {
    lines.push(
      `protectionRequiredApprovals=${protection.requiredApprovingReviewCount}`,
    );
  }
  if (protection.kind === "unavailable") {
    lines.push(`protectionDetail=${protection.detail}`);
  }
  return lines.join("\n") + "\n";
}

/**
 * Append clearance under a READY pretty block once.
 *
 * @param {string} prettyStdout
 * @param {ReviewClearance} clearance
 * @param {ProtectionSummary} protection
 * @returns {string}
 */
export function appendClearanceToPretty(prettyStdout, clearance, protection) {
  if (
    /^reviewClearance=/m.test(prettyStdout) ||
    /--- hebmu clearance ---/.test(prettyStdout)
  ) {
    return prettyStdout;
  }
  if (!/^READY:/m.test(prettyStdout)) return prettyStdout;
  const base = prettyStdout.endsWith("\n") ? prettyStdout : prettyStdout + "\n";
  return base + formatClearancePretty(clearance, protection);
}

/**
 * Sidecar line for JSON mode. Upstream kind stays untouched.
 *
 * @param {{
 *   pr: number;
 *   clearance: ReviewClearance;
 *   protection: ProtectionSummary;
 *   reviewDecision: string | null;
 *   baseRefName: string | null;
 * }} args
 * @returns {Record<string, unknown>}
 */
export function buildClearanceSidecar(args) {
  return {
    schema: "hebmu.clearance.v1",
    pr: args.pr,
    verdictKind: "READY",
    clearance: args.clearance,
    protection: args.protection,
    signals: {
      reviewDecision: args.reviewDecision,
      baseRefName: args.baseRefName,
    },
  };
}

// ---------------------------------------------------------------------------
// Boundary parse
// ---------------------------------------------------------------------------

/**
 * @param {readonly string[]} argv
 * @returns {{ owner: string; repo: string; pr: number; pretty: boolean }}
 */
export function parseRepoPrFromArgv(argv) {
  /** @type {Record<string, string>} */
  const flags = {};
  let pretty = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--pretty") {
      pretty = true;
      continue;
    }
    if (a.startsWith("--") && i + 1 < argv.length && !argv[i + 1].startsWith("--")) {
      flags[a.slice(2)] = argv[++i];
    }
  }
  const owner = flags.owner ?? "";
  const repo = flags.repo ?? "";
  const pr = Number(flags.pr);
  if (!owner || !repo || !Number.isInteger(pr) || pr <= 0) {
    throw new Error(
      "watch-pr-clearance: need --owner, --repo, and --pr <n> on argv",
    );
  }
  return { owner, repo, pr, pretty };
}

/**
 * @param {unknown} value
 * @returns {string | null}
 */
function normalizeReviewDecision(value) {
  if (value === undefined || value === null || value === "" || value === "null") {
    return null;
  }
  return String(value);
}

/**
 * @param {unknown} obj
 * @param {{ owner: string; repo: string; pr: number }} fallback
 * @returns {{
 *   kind: "READY";
 *   owner: string;
 *   repo: string;
 *   pr: number;
 *   reviewDecision: string | null;
 *   baseRefName: string | null;
 *   rawJson: unknown;
 * } | null}
 */
function readyEvidenceFromJson(obj, fallback) {
  if (!obj || typeof obj !== "object") return null;
  const rec = /** @type {Record<string, unknown>} */ (obj);
  if (rec.kind !== "READY") return null;

  const scope = /** @type {Record<string, unknown> | undefined} */ (rec.scope);
  /** @type {Record<string, unknown> | null} */
  let prNode = null;
  if (scope?.kind === "single" && scope.pr && typeof scope.pr === "object") {
    prNode = /** @type {Record<string, unknown>} */ (scope.pr);
  } else if (scope?.kind === "stack" && Array.isArray(scope.prs)) {
    prNode =
      /** @type {Record<string, unknown> | undefined} */ (
        scope.prs.find(
          (p) => p && typeof p === "object" && /** @type {Record<string, unknown>} */ (p).kind === "ready-pr",
        )
      ) ??
      (scope.prs[0] && typeof scope.prs[0] === "object"
        ? /** @type {Record<string, unknown>} */ (scope.prs[0])
        : null);
  }

  const ctx =
    prNode?.context && typeof prNode.context === "object"
      ? /** @type {Record<string, unknown>} */ (prNode.context)
      : null;
  const gate =
    prNode?.kind === "ready-pr" &&
    prNode.proof &&
    typeof prNode.proof === "object"
      ? /** @type {Record<string, unknown>} */ (
          /** @type {Record<string, unknown>} */ (prNode.proof).gate
        )
      : null;

  return {
    kind: "READY",
    owner: typeof ctx?.owner === "string" ? ctx.owner : fallback.owner,
    repo: typeof ctx?.repo === "string" ? ctx.repo : fallback.repo,
    pr: typeof ctx?.number === "number" ? ctx.number : fallback.pr,
    reviewDecision: normalizeReviewDecision(gate?.reviewDecision),
    baseRefName: null,
    rawJson: obj,
  };
}

/**
 * @param {string} stdout
 * @param {{ owner: string; repo: string; pr: number }} fallback
 * @returns {{
 *   kind: "READY";
 *   owner: string;
 *   repo: string;
 *   pr: number;
 *   reviewDecision: string | null;
 *   baseRefName: string | null;
 *   rawJson: unknown | null;
 *   mode: "json" | "pretty";
 *   readyLineIndex: number;
 * } | null}
 */
export function parseReadyEvidenceFromStdout(stdout, fallback) {
  const trimmed = stdout.replace(/\s+$/, "");
  if (!trimmed) return null;

  // Pretty path: READY headline.
  if (/^READY:/m.test(trimmed) && !trimmed.trimStart().startsWith("{")) {
    const m = trimmed.match(/^reviewDecision=(.*)$/m);
    return {
      kind: "READY",
      owner: fallback.owner,
      repo: fallback.repo,
      pr: fallback.pr,
      reviewDecision: m ? normalizeReviewDecision(m[1]) : null,
      baseRefName: null,
      rawJson: null,
      mode: "pretty",
      readyLineIndex: -1,
    };
  }

  // JSON / NDJSON: last READY object wins.
  const lines = trimmed.split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (!line.startsWith("{")) continue;
    try {
      const obj = JSON.parse(line);
      const evidence = readyEvidenceFromJson(obj, fallback);
      if (evidence) {
        return { ...evidence, mode: "json", readyLineIndex: i };
      }
    } catch {
      // keep scanning
    }
  }
  return null;
}

/**
 * Insert sidecar after the READY JSON line; leave upstream line bytes intact.
 *
 * @param {string} stdout
 * @param {number} readyLineIndex
 * @param {Record<string, unknown>} sidecar
 * @returns {string}
 */
export function appendSidecarToJsonStdout(stdout, readyLineIndex, sidecar) {
  const endsWithNl = stdout.endsWith("\n");
  const lines = stdout.replace(/\n$/, "").split("\n");
  if (readyLineIndex < 0 || readyLineIndex >= lines.length) {
    return stdout + (endsWithNl || stdout === "" ? "" : "\n") + JSON.stringify(sidecar) + "\n";
  }
  lines.splice(readyLineIndex + 1, 0, JSON.stringify(sidecar));
  return lines.join("\n") + "\n";
}

// ---------------------------------------------------------------------------
// gh + upstream adapters
// ---------------------------------------------------------------------------

/**
 * @param {string} path
 * @returns {{ status: number; body: unknown }}
 */
export function defaultGhApi(path) {
  const r = spawnSync("gh", ["api", "--include", path], {
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
  });
  const raw = r.stdout || "";
  const sep = raw.search(/\r?\n\r?\n/);
  const head = sep >= 0 ? raw.slice(0, sep) : "";
  const bodyRaw = sep >= 0 ? raw.slice(sep).replace(/^\r?\n\r?\n/, "") : raw;
  const m = head.match(/HTTP\/[\d.]+ (\d+)/);
  /** @type {unknown} */
  let body = bodyRaw;
  try {
    body = JSON.parse(bodyRaw);
  } catch {
    // keep string
  }
  let status = m ? Number(m[1]) : r.status === 0 ? 200 : 0;
  if (
    !m &&
    body &&
    typeof body === "object" &&
    body !== null &&
    "status" in body
  ) {
    status = Number(/** @type {{ status: unknown }} */ (body).status);
  }
  if (!status) status = r.status === 0 ? 200 : 500;
  return { status, body };
}

/**
 * @param {{ owner: string; repo: string }} repo
 * @param {number} pr
 * @param {readonly string[]} fields
 * @returns {Record<string, unknown>}
 */
export function defaultGhPrView(repo, pr, fields) {
  const r = spawnSync(
    "gh",
    [
      "pr",
      "view",
      String(pr),
      "--repo",
      `${repo.owner}/${repo.repo}`,
      "--json",
      fields.join(","),
    ],
    { encoding: "utf8", maxBuffer: 10 * 1024 * 1024 },
  );
  if (r.status !== 0) {
    throw new Error(
      `gh pr view failed: ${(r.stderr || r.stdout || "").trim() || `exit ${r.status}`}`,
    );
  }
  return JSON.parse(r.stdout);
}

/**
 * @param {string} cmd
 * @returns {boolean}
 */
function commandExists(cmd) {
  const which = spawnSync(process.platform === "win32" ? "where" : "which", [cmd], {
    encoding: "utf8",
  });
  return which.status === 0;
}

/**
 * @param {string} upstreamDir
 * @param {readonly string[]} argv
 * @returns {{ stdout: string; stderr: string; exitCode: number }}
 */
export function defaultRunUpstream(upstreamDir, argv) {
  const watchPr = join(upstreamDir, "watch-pr");
  /** @type {string} */
  let cmd;
  /** @type {string[]} */
  let args;
  if (commandExists("bun")) {
    cmd = "bun";
    args = [watchPr, ...argv];
  } else if (commandExists("npx")) {
    cmd = "npx";
    args = ["-y", "bun", watchPr, ...argv];
  } else {
    return {
      stdout: "",
      stderr: "watch-pr-clearance: need bun or npx on PATH\n",
      exitCode: 1,
    };
  }
  const r = spawnSync(cmd, args, {
    cwd: upstreamDir,
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
    env: process.env,
  });
  return {
    stdout: r.stdout ?? "",
    stderr: r.stderr ?? "",
    exitCode: r.status ?? 1,
  };
}

/**
 * @param {{ api: (path: string) => { status: number; body: unknown } }} gh
 * @param {{ owner: string; repo: string }} repo
 * @param {string} baseRefName
 * @returns {ProtectionSummary}
 */
export function probeProtection(gh, repo, baseRefName) {
  const path = `repos/${repo.owner}/${repo.repo}/branches/${encodeURIComponent(baseRefName)}/protection`;
  try {
    const { status, body } = gh.api(path);
    return parseProtectionHttp(status, body);
  } catch (err) {
    return {
      kind: "unavailable",
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * @param {{
 *   prView: (
 *     repo: { owner: string; repo: string },
 *     pr: number,
 *     fields: readonly string[],
 *   ) => Record<string, unknown>
 * }} gh
 * @param {{ owner: string; repo: string }} repo
 * @param {number} pr
 * @param {string | null} known
 * @returns {Promise<string>}
 */
export async function resolveBaseRefName(gh, repo, pr, known) {
  if (known) return known;
  const view = gh.prView(repo, pr, ["baseRefName"]);
  const base = view.baseRefName;
  if (typeof base !== "string" || !base) {
    throw new Error("gh pr view did not return baseRefName");
  }
  return base;
}

/**
 * @param {{
 *   argv: readonly string[];
 *   upstreamDir: string;
 *   runUpstream?: typeof defaultRunUpstream;
 *   gh?: {
 *     api: (path: string) => { status: number; body: unknown };
 *     prView: (
 *       repo: { owner: string; repo: string },
 *       pr: number,
 *       fields: readonly string[],
 *     ) => Record<string, unknown>;
 *   };
 *   io?: { stdout: (s: string) => void; stderr: (s: string) => void };
 * }} args
 * @returns {Promise<number>}
 */
export async function runEnrichedWatchPr(args) {
  const runUpstream = args.runUpstream ?? defaultRunUpstream;
  const gh = args.gh ?? { api: defaultGhApi, prView: defaultGhPrView };
  const io = args.io ?? {
    stdout: (s) => process.stdout.write(s),
    stderr: (s) => process.stderr.write(s),
  };

  const result = runUpstream(args.upstreamDir, args.argv);
  if (result.stderr) io.stderr(result.stderr);

  let repoPr;
  try {
    repoPr = parseRepoPrFromArgv(args.argv);
  } catch (err) {
    // Upstream already ran; pass stdout through and keep its exit code.
    if (result.stdout) io.stdout(result.stdout);
    if (!result.stderr) {
      io.stderr(
        err instanceof Error ? err.message + "\n" : String(err) + "\n",
      );
    }
    return result.exitCode;
  }

  const evidence = parseReadyEvidenceFromStdout(result.stdout, repoPr);
  if (!evidence) {
    if (result.stdout) io.stdout(result.stdout);
    return result.exitCode;
  }

  let protection;
  let baseRefName = evidence.baseRefName;
  try {
    baseRefName = await resolveBaseRefName(
      gh,
      { owner: evidence.owner, repo: evidence.repo },
      evidence.pr,
      evidence.baseRefName,
    );
    protection = probeProtection(
      gh,
      { owner: evidence.owner, repo: evidence.repo },
      baseRefName,
    );
  } catch (err) {
    protection = {
      kind: "unavailable",
      detail: err instanceof Error ? err.message : String(err),
    };
  }

  const clearance = classifyReviewClearance({
    reviewDecision: evidence.reviewDecision,
    protection,
  });

  if (evidence.mode === "pretty" || repoPr.pretty) {
    io.stdout(
      appendClearanceToPretty(result.stdout, clearance, protection),
    );
  } else {
    const sidecar = buildClearanceSidecar({
      pr: evidence.pr,
      clearance,
      protection,
      reviewDecision: evidence.reviewDecision,
      baseRefName,
    });
    io.stdout(
      appendSidecarToJsonStdout(
        result.stdout,
        evidence.readyLineIndex,
        sidecar,
      ),
    );
  }

  return result.exitCode;
}

// ---------------------------------------------------------------------------
// Self-test
// ---------------------------------------------------------------------------

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function runSelfTest() {
  const cases = [
    {
      name: "unprotected + null → ci-only/unprotected-base",
      evidence: {
        reviewDecision: null,
        protection: { kind: "unprotected" },
      },
      expect: { kind: "ci-only", reason: "unprotected-base" },
    },
    {
      name: "unprotected + empty → ci-only/unprotected-base",
      evidence: {
        reviewDecision: "",
        protection: { kind: "unprotected" },
      },
      expect: { kind: "ci-only", reason: "unprotected-base" },
    },
    {
      name: "protected count 0 + null → ci-only/no-required-reviews",
      evidence: {
        reviewDecision: null,
        protection: { kind: "protected", requiredApprovingReviewCount: 0 },
      },
      expect: { kind: "ci-only", reason: "no-required-reviews" },
    },
    {
      name: "protected count>0 + null → unknown",
      evidence: {
        reviewDecision: null,
        protection: { kind: "protected", requiredApprovingReviewCount: 1 },
      },
      expectKind: "unknown",
    },
    {
      name: "unavailable + null → unknown",
      evidence: {
        reviewDecision: null,
        protection: { kind: "unavailable", detail: "HTTP 403" },
      },
      expect: { kind: "unknown", detail: "HTTP 403" },
    },
    {
      name: "APPROVED → approved",
      evidence: {
        reviewDecision: "APPROVED",
        protection: { kind: "unprotected" },
      },
      expect: { kind: "approved" },
    },
    {
      name: "REVIEW_REQUIRED → review-required",
      evidence: {
        reviewDecision: "REVIEW_REQUIRED",
        protection: { kind: "protected", requiredApprovingReviewCount: 1 },
      },
      expect: { kind: "review-required" },
    },
    {
      name: "CHANGES_REQUESTED → changes-requested",
      evidence: {
        reviewDecision: "CHANGES_REQUESTED",
        protection: { kind: "protected", requiredApprovingReviewCount: 1 },
      },
      expect: { kind: "changes-requested" },
    },
  ];

  for (const c of cases) {
    const got = classifyReviewClearance(c.evidence);
    if (c.expectKind) {
      assert(got.kind === c.expectKind, `${c.name}: got ${JSON.stringify(got)}`);
    } else {
      assert(
        JSON.stringify(got) === JSON.stringify(c.expect),
        `${c.name}: got ${JSON.stringify(got)} want ${JSON.stringify(c.expect)}`,
      );
    }
    console.log(`ok  ${c.name}`);
  }

  assert(
    parseProtectionHttp(404, { message: "Branch not protected" }).kind ===
      "unprotected",
    "404 → unprotected",
  );
  console.log("ok  parseProtectionHttp 404 → unprotected");

  const prot = parseProtectionHttp(200, {
    required_pull_request_reviews: { required_approving_review_count: 2 },
  });
  assert(
    prot.kind === "protected" && prot.requiredApprovingReviewCount === 2,
    "2xx parse",
  );
  console.log("ok  parseProtectionHttp 2xx → protected count");

  const pretty = appendClearanceToPretty(
    "READY: ok\nreviewDecision=\nisDraft=false\n",
    { kind: "ci-only", reason: "unprotected-base" },
    { kind: "unprotected" },
  );
  assert(pretty.includes("--- hebmu clearance ---"), "pretty header");
  assert(pretty.includes("reviewClearance=ci-only"), "pretty clearance");
  assert(
    pretty.includes("reviewClearanceReason=unprotected-base"),
    "pretty reason",
  );
  console.log("ok  pretty append block");

  const sidecar = buildClearanceSidecar({
    pr: 31,
    clearance: { kind: "ci-only", reason: "unprotected-base" },
    protection: { kind: "unprotected" },
    reviewDecision: null,
    baseRefName: "main",
  });
  assert(sidecar.schema === "hebmu.clearance.v1", "sidecar schema");
  const jsonOut = appendSidecarToJsonStdout(
    '{"kind":"READY","exitCode":0}\n',
    0,
    sidecar,
  );
  const jsonLines = jsonOut.trim().split("\n");
  assert(jsonLines.length === 2, "json dual line");
  assert(JSON.parse(jsonLines[0]).kind === "READY", "upstream kind intact");
  assert(
    JSON.parse(jsonLines[1]).schema === "hebmu.clearance.v1",
    "sidecar line",
  );
  console.log("ok  JSON sidecar leaves upstream kind unchanged");

  console.log("\nself-test: all passed");
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

async function main(argv) {
  if (argv.includes("--self-test")) {
    runSelfTest();
    return 0;
  }

  let upstreamDir = process.env.HEBMU_WATCH_PR_UPSTREAM_DIR ?? "";
  /** @type {string[]} */
  const passthrough = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--upstream-dir") {
      upstreamDir = argv[++i] ?? "";
      continue;
    }
    if (argv[i] === "--") {
      passthrough.push(...argv.slice(i + 1));
      break;
    }
    passthrough.push(argv[i]);
  }

  if (!upstreamDir) {
    process.stderr.write(
      "watch-pr-clearance: missing --upstream-dir (or HEBMU_WATCH_PR_UPSTREAM_DIR)\n",
    );
    return 1;
  }

  return runEnrichedWatchPr({
    argv: passthrough,
    upstreamDir,
  });
}

const isDirect =
  process.argv[1] &&
  fileURLToPath(import.meta.url) === process.argv[1];

if (isDirect) {
  main(process.argv.slice(2))
    .then((code) => process.exit(code))
    .catch((err) => {
      process.stderr.write(
        (err instanceof Error ? err.stack || err.message : String(err)) + "\n",
      );
      process.exit(1);
    });
}
