#!/usr/bin/env node
/**
 * Hebmu watch-pr enricher (#31 / #36).
 *
 * Runs upstream poteto-mode watch-pr unchanged, then on READY or STATUS
 * attaches review/protection clearance so babysit can tell CI-only green
 * from review clearance (including the documented --status-only path).
 * Does not gate READY on APPROVED. Does not vendor upstream.
 *
 * Usage (via scripts/watch-pr):
 *   ./scripts/watch-pr --owner … --repo … --pr <n> --status-only --pretty
 *
 * Self-check:
 *   node scripts/watch-pr-clearance.mjs --self-test
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  artifactToAttestation,
  evaluateMergeDisposition,
  formatDispositionPretty,
  isShippingVerdictRemovedError,
  parseAttestationFromArgv,
} from "./merge-policy.mjs";
import {
  forgeLegacyHmacWireForTest,
  generateSealKeyPairForTest,
  loadSealVerifyKeyFromEnv,
  mintVerifierBoundAttestation,
  refuseSealMintKeyInAssertEnv,
} from "./attestation-crypto.mjs";
import {
  createVerifyingFsStore,
  createVerifyingMemoryStore,
  defaultSealedShippingDir,
} from "./attestation-store.mjs";
import {
  createFetchCheckRun,
  createGhIdentityVerifier,
} from "./check-run-crypto.mjs";
import {
  CLEARANCE_PRETTY_HEADER,
  CLEARANCE_SCHEMA,
  advanceAssertPhase,
  mintClearedVerdict,
  parseClearancePresence,
  resolveAssertProcessExit,
  stdoutHasHebmuClearance,
} from "./clearance-presence.mjs";
import {
  generateObserveKeyPairForTest,
  loadObserveMintKeyFromEnv,
  mintObserveBoundReceipt,
} from "./observe-crypto.mjs";
import {
  buildLastObserveClaims,
  createVerifyingMemoryLastObserveStore,
  defaultLastObserveDir,
  putObserveBoundReceipt,
} from "./last-observe-store.mjs";

/** Self-test Ed25519 pair — not production secrets. */
const SELF_TEST_KEYS = generateSealKeyPairForTest();
const SELF_TEST_MINT_KEY = SELF_TEST_KEYS.mintKey;
const SELF_TEST_VERIFY_KEY = SELF_TEST_KEYS.verifyKey;

/** Self-test observe Ed25519 pair — not production secrets. */
const SELF_TEST_OBSERVE_KEYS = generateObserveKeyPairForTest();
const SELF_TEST_OBSERVE_MINT_KEY = SELF_TEST_OBSERVE_KEYS.mintKey;
const SELF_TEST_OBSERVE_VERIFY_KEY = SELF_TEST_OBSERVE_KEYS.verifyKey;

/**
 * @returns {import("./attestation-store.mjs").MemoryAttestationStore}
 */
function selfTestStore() {
  return createVerifyingMemoryStore(SELF_TEST_VERIFY_KEY);
}

/** Observe stub: no seal I/O, no key load. */
const OBSERVE_STORE_STUB = {
  put() {
    throw new Error("watch-pr-clearance: observe path must not write seals");
  },
  async get() {
    return null;
  },
  async classify() {
    throw new Error("watch-pr-clearance: observe path must not classify seals");
  },
};

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(SCRIPT_DIR, "..");

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
 *
 * @typedef {{
 *   kind: "READY" | "STATUS";
 *   owner: string;
 *   repo: string;
 *   pr: number;
 *   reviewDecision: string | null;
 *   baseRefName: string | null;
 *   mode: "json" | "pretty";
 *   lineIndex: number;
 * }} EnrichEvidence
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
  const lines = [CLEARANCE_PRETTY_HEADER, `reviewClearance=${clearance.kind}`];
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
 * Append clearance under a READY or STATUS pretty block once.
 *
 * @param {string} prettyStdout
 * @param {ReviewClearance} clearance
 * @param {ProtectionSummary} protection
 * @returns {string}
 */
export function appendClearanceToPretty(prettyStdout, clearance, protection) {
  if (stdoutHasHebmuClearance(prettyStdout)) {
    return prettyStdout;
  }
  const hasReady = /^READY:/m.test(prettyStdout);
  const hasStatusTable = /^\| PR \| CI \|/m.test(prettyStdout);
  if (!hasReady && !hasStatusTable) return prettyStdout;
  const base = prettyStdout.endsWith("\n") ? prettyStdout : prettyStdout + "\n";
  return base + formatClearancePretty(clearance, protection);
}

/**
 * Sidecar line for JSON mode. Upstream kind stays untouched.
 *
 * @param {{
 *   pr: number;
 *   verdictKind: "READY" | "STATUS";
 *   clearance: ReviewClearance;
 *   protection: ProtectionSummary;
 *   reviewDecision: string | null;
 *   baseRefName: string | null;
 * }} args
 * @returns {Record<string, unknown>}
 */
export function buildClearanceSidecar(args) {
  return {
    schema: CLEARANCE_SCHEMA,
    pr: args.pr,
    verdictKind: args.verdictKind,
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
 * @returns {boolean}
 */
export function wantsAssertMerge(argv) {
  return argv.includes("--assert-merge");
}

/**
 * Commander rejects unknown options, so --assert-merge must not leak.
 *
 * @param {readonly string[]} argv
 * @returns {string[]}
 */
export function stripHebmuMergeArgv(argv) {
  /** @type {string[]} */
  const out = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--assert-merge") continue;
    if (
      a === "--shipping-verdict" ||
      a === "--merge-override" ||
      a === "--merge-override-reason"
    ) {
      if (i + 1 < argv.length && !argv[i + 1].startsWith("--")) i++;
      continue;
    }
    out.push(a);
  }
  return out;
}

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
 * @param {unknown} value
 * @returns {string | null}
 */
function normalizeBaseRefName(value) {
  if (typeof value !== "string" || !value) return null;
  return value;
}

/**
 * @param {unknown} obj
 * @param {{ owner: string; repo: string; pr: number }} fallback
 * @returns {Omit<EnrichEvidence, "mode" | "lineIndex"> | null}
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
  };
}

/**
 * Pick the STATUS row for the argv PR, else the first row.
 *
 * @param {unknown} obj
 * @param {{ owner: string; repo: string; pr: number }} fallback
 * @returns {Omit<EnrichEvidence, "mode" | "lineIndex"> | null}
 */
function statusEvidenceFromJson(obj, fallback) {
  if (!obj || typeof obj !== "object") return null;
  const rec = /** @type {Record<string, unknown>} */ (obj);
  if (rec.kind !== "STATUS") return null;
  if (!Array.isArray(rec.rows) || rec.rows.length === 0) return null;

  /** @type {Record<string, unknown>[]} */
  const rows = rec.rows.filter((r) => r && typeof r === "object").map(
    (r) => /** @type {Record<string, unknown>} */ (r),
  );
  if (rows.length === 0) return null;

  const matched =
    rows.find((row) => {
      const ctx =
        row.context && typeof row.context === "object"
          ? /** @type {Record<string, unknown>} */ (row.context)
          : null;
      return typeof ctx?.number === "number" && ctx.number === fallback.pr;
    }) ?? rows[0];

  const ctx =
    matched.context && typeof matched.context === "object"
      ? /** @type {Record<string, unknown>} */ (matched.context)
      : null;
  const facts =
    matched.facts && typeof matched.facts === "object"
      ? /** @type {Record<string, unknown>} */ (matched.facts)
      : null;

  return {
    kind: "STATUS",
    owner: typeof ctx?.owner === "string" ? ctx.owner : fallback.owner,
    repo: typeof ctx?.repo === "string" ? ctx.repo : fallback.repo,
    pr: typeof ctx?.number === "number" ? ctx.number : fallback.pr,
    reviewDecision: normalizeReviewDecision(facts?.reviewDecision),
    baseRefName: normalizeBaseRefName(facts?.baseRefName),
  };
}

/**
 * Parse READY or STATUS enrich evidence from upstream stdout.
 * Prefers READY when both could match (should not happen in one verdict).
 *
 * @param {string} stdout
 * @param {{ owner: string; repo: string; pr: number }} fallback
 * @returns {EnrichEvidence | null}
 */
export function parseEnrichEvidenceFromStdout(stdout, fallback) {
  const trimmed = stdout.replace(/\s+$/, "");
  if (!trimmed) return null;

  // Pretty READY headline.
  if (/^READY:/m.test(trimmed) && !trimmed.trimStart().startsWith("{")) {
    const m = trimmed.match(/^reviewDecision=(.*)$/m);
    return {
      kind: "READY",
      owner: fallback.owner,
      repo: fallback.repo,
      pr: fallback.pr,
      reviewDecision: m ? normalizeReviewDecision(m[1]) : null,
      baseRefName: null,
      mode: "pretty",
      lineIndex: -1,
    };
  }

  // Pretty STATUS table (header from upstream renderStatusTable).
  if (
    /^\| PR \| CI \|/m.test(trimmed) &&
    !trimmed.trimStart().startsWith("{")
  ) {
    return {
      kind: "STATUS",
      owner: fallback.owner,
      repo: fallback.repo,
      pr: fallback.pr,
      reviewDecision: null,
      baseRefName: null,
      mode: "pretty",
      lineIndex: -1,
    };
  }

  // JSON / NDJSON: last READY or STATUS object wins (READY preferred if both).
  const lines = trimmed.split("\n");
  /** @type {EnrichEvidence | null} */
  let statusHit = null;
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (!line.startsWith("{")) continue;
    try {
      const obj = JSON.parse(line);
      const ready = readyEvidenceFromJson(obj, fallback);
      if (ready) {
        return { ...ready, mode: "json", lineIndex: i };
      }
      if (!statusHit) {
        const status = statusEvidenceFromJson(obj, fallback);
        if (status) {
          statusHit = { ...status, mode: "json", lineIndex: i };
        }
      }
    } catch {
      // keep scanning
    }
  }
  return statusHit;
}

/**
 * @param {string} stdout
 * @param {{ owner: string; repo: string; pr: number }} fallback
 * @returns {(EnrichEvidence & { readyLineIndex: number; rawJson: unknown | null }) | null}
 */
export function parseReadyEvidenceFromStdout(stdout, fallback) {
  const evidence = parseEnrichEvidenceFromStdout(stdout, fallback);
  if (!evidence || evidence.kind !== "READY") return null;
  return {
    ...evidence,
    readyLineIndex: evidence.lineIndex,
    rawJson: null,
  };
}

/**
 * Insert sidecar after the enrich JSON line; leave upstream line bytes intact.
 *
 * @param {string} stdout
 * @param {number} lineIndex
 * @param {Record<string, unknown>} sidecar
 * @returns {string}
 */
export function appendSidecarToJsonStdout(stdout, lineIndex, sidecar) {
  const endsWithNl = stdout.endsWith("\n");
  const lines = stdout.replace(/\n$/, "").split("\n");
  if (lineIndex < 0 || lineIndex >= lines.length) {
    return stdout + (endsWithNl || stdout === "" ? "" : "\n") + JSON.stringify(sidecar) + "\n";
  }
  lines.splice(lineIndex + 1, 0, JSON.stringify(sidecar));
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
 * Fetch baseRefName and/or reviewDecision in one gh pr view when either is missing.
 *
 * @param {{
 *   prView: (
 *     repo: { owner: string; repo: string },
 *     pr: number,
 *     fields: readonly string[],
 *   ) => Record<string, unknown>
 * }} gh
 * @param {{ owner: string; repo: string }} repo
 * @param {number} pr
 * @param {{ baseRefName: string | null; reviewDecision: string | null }} known
 * @returns {Promise<{ baseRefName: string; reviewDecision: string | null }>}
 */
export async function resolvePrSignals(gh, repo, pr, known) {
  const needBase = !known.baseRefName;
  const needReview =
    known.reviewDecision === null || known.reviewDecision === undefined;
  if (!needBase && !needReview) {
    return {
      baseRefName: /** @type {string} */ (known.baseRefName),
      reviewDecision: known.reviewDecision,
    };
  }

  /** @type {string[]} */
  const fields = [];
  if (needBase) fields.push("baseRefName");
  if (needReview) fields.push("reviewDecision");
  const view = gh.prView(repo, pr, fields);

  const baseRefName = needBase
    ? normalizeBaseRefName(view.baseRefName)
    : known.baseRefName;
  if (!baseRefName) {
    throw new Error("gh pr view did not return baseRefName");
  }

  const reviewDecision = needReview
    ? normalizeReviewDecision(view.reviewDecision)
    : known.reviewDecision;

  return { baseRefName, reviewDecision };
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
  const base = normalizeBaseRefName(view.baseRefName);
  if (!base) {
    throw new Error("gh pr view did not return baseRefName");
  }
  return base;
}

/**
 * @param {unknown} value
 * @returns {string | null}
 */
function normalizeHeadRefOid(value) {
  if (typeof value !== "string" || !value) return null;
  return value;
}

/**
 * Live tip OID for seal binding on --assert-merge.
 *
 * @param {{
 *   prView: (
 *     repo: { owner: string; repo: string },
 *     pr: number,
 *     fields: readonly string[],
 *   ) => Record<string, unknown>
 * }} gh
 * @param {{ owner: string; repo: string }} repo
 * @param {number} pr
 * @returns {string | null}
 */
export function resolveHeadRefOid(gh, repo, pr) {
  try {
    const view = gh.prView(repo, pr, ["headRefOid"]);
    return normalizeHeadRefOid(view.headRefOid);
  } catch {
    return null;
  }
}

/**
 * Argv override wins when present; otherwise load sealed artifact from store.
 * Bare --shipping-verdict is never a valid attestation (parse hard-throws).
 *
 * @param {{
 *   argv: readonly string[];
 *   store: import("./attestation-store.mjs").AttestationStore;
 *   owner: string;
 *   repo: string;
 *   pr: number;
 * }} args
 * @returns {Promise<{
 *   attestation: import("./merge-policy.mjs").MergeAttestation | null;
 *   attestationClass?: "missing" | "unusable" | "forged";
 * }>}
 */
export async function resolveMergeAttestation(args) {
  let argvAttestation = null;
  try {
    argvAttestation = parseAttestationFromArgv(args.argv);
  } catch (err) {
    if (isShippingVerdictRemovedError(err)) {
      argvAttestation = null;
    } else {
      throw err;
    }
  }
  if (argvAttestation) {
    return { attestation: argvAttestation };
  }
  const key = {
    owner: args.owner,
    repo: args.repo,
    pr: args.pr,
  };
  const artifact = await args.store.get(key);
  if (artifact) {
    return { attestation: artifactToAttestation(artifact) };
  }
  /** @type {"missing" | "unusable" | "forged"} */
  let attestationClass = "missing";
  if (typeof args.store.classify === "function") {
    attestationClass = await args.store.classify(key);
  }
  return { attestation: null, attestationClass };
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
 *   store?: import("./attestation-store.mjs").AttestationStore;
 *   lastObserveStore?: import("./last-observe-store.mjs").LastObserveStore;
 *   fetchCheckRun?: import("./check-run-crypto.mjs").FetchCheckRun;
 *   identity?: import("./check-run-crypto.mjs").SealIdentityVerifier;
 *   io?: { stdout: (s: string) => void; stderr: (s: string) => void };
 *   attachClearance?: boolean;
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
  // False only for self-tests that simulate enrich bypass / bare fed to assert.
  const attachClearance = args.attachClearance !== false;

  const upstreamArgv = stripHebmuMergeArgv(args.argv);
  const result = runUpstream(args.upstreamDir, upstreamArgv);
  if (result.stderr) io.stderr(result.stderr);

  let repoPr;
  try {
    repoPr = parseRepoPrFromArgv(args.argv);
  } catch (err) {
    // Upstream already ran; pass stdout through and keep its exit code.
    // No target → no last-observe receipt (argv parse failure).
    if (result.stdout) io.stdout(result.stdout);
    if (!result.stderr) {
      io.stderr(
        err instanceof Error ? err.message + "\n" : String(err) + "\n",
      );
    }
    return result.exitCode;
  }

  const evidence = parseEnrichEvidenceFromStdout(result.stdout, repoPr);
  const assertMerge = wantsAssertMerge(args.argv);
  // Observe never reads seals (ADR 0003). Load verify key only when store.get
  // runs so --merge-override works with no seal env.
  /** @type {import("./attestation-store.mjs").AttestationStore | undefined} */
  let cachedStore = args.store;
  /**
   * @returns {import("./attestation-store.mjs").AttestationStore}
   */
  function ensureStore() {
    if (cachedStore) return cachedStore;
    if (!assertMerge) {
      cachedStore = OBSERVE_STORE_STUB;
      return cachedStore;
    }
    refuseSealMintKeyInAssertEnv(process.env);
    cachedStore = createVerifyingFsStore(
      defaultSealedShippingDir(REPO_ROOT),
      loadSealVerifyKeyFromEnv(process.env),
      args.identity ?? createGhIdentityVerifier(),
    );
    return cachedStore;
  }
  const store = {
    put(artifact) {
      return ensureStore().put(artifact);
    },
    get(key) {
      return ensureStore().get(key);
    },
    classify(key) {
      return ensureStore().classify(key);
    },
  };
  // Assert path never writes last-observe.
  const lastObserveStore = args.lastObserveStore ?? null;
  /** @type {import("./observe-crypto.mjs").ObserveMintKey | null} */
  let cachedObserveMint = null;
  /**
   * @returns {import("./observe-crypto.mjs").ObserveMintKey}
   */
  function ensureObserveMint() {
    if (cachedObserveMint) return cachedObserveMint;
    cachedObserveMint = loadObserveMintKeyFromEnv(process.env);
    return cachedObserveMint;
  }

  /**
   * Never remaps exit (ADR 0003).
   * @param {string} stdoutForPresence
   * @param {number} upstreamExit
   */
  function putLastObserveReceipt(stdoutForPresence, upstreamExit) {
    if (assertMerge) return;
    try {
      const presence = parseClearancePresence(stdoutForPresence);
      const headRefOid = resolveHeadRefOid(
        gh,
        { owner: repoPr.owner, repo: repoPr.repo },
        repoPr.pr,
      );
      const claims = buildLastObserveClaims({
        target: { owner: repoPr.owner, repo: repoPr.repo, pr: repoPr.pr },
        presence,
        upstreamExit,
        headRefOid,
        observedAt: new Date().toISOString(),
      });
      const bound = mintObserveBoundReceipt(
        claims,
        lastObserveStore
          ? SELF_TEST_OBSERVE_MINT_KEY
          : ensureObserveMint(),
      );
      if (lastObserveStore) {
        lastObserveStore.put(bound);
      } else {
        putObserveBoundReceipt(defaultLastObserveDir(REPO_ROOT), bound);
      }
    } catch (err) {
      io.stderr(
        `hebmu: last-observe receipt write failed: ${
          err instanceof Error ? err.message : String(err)
        }\n`,
      );
    }
  }

  if (!evidence) {
    if (result.stdout) io.stdout(result.stdout);
    // Observe: always upstream exit (ADR 0003).
    // Assert + no-terminal: passthrough. Assert + terminal without
    // enrich evidence still hard-fails (bare READY/STATUS shaped output).
    if (assertMerge) {
      const presence = parseClearancePresence(result.stdout);
      if (
        presence.kind === "absent" &&
        presence.reason === "terminal-without-clearance"
      ) {
        io.stderr(
          "hebmu: missing-clearance (exit 4): READY/STATUS without hebmu clearance markers\n",
        );
        return 4;
      }
    } else {
      putLastObserveReceipt(result.stdout ?? "", result.exitCode);
    }
    return result.exitCode;
  }

  let protection;
  let baseRefName = evidence.baseRefName;
  let reviewDecision = evidence.reviewDecision;
  try {
    const signals = await resolvePrSignals(
      gh,
      { owner: evidence.owner, repo: evidence.repo },
      evidence.pr,
      {
        baseRefName: evidence.baseRefName,
        reviewDecision: evidence.reviewDecision,
      },
    );
    baseRefName = signals.baseRefName;
    reviewDecision = signals.reviewDecision;
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
    reviewDecision,
    protection,
  });

  /** @type {string} */
  let finalStdout = result.stdout;
  if (attachClearance) {
    if (evidence.mode === "pretty" || repoPr.pretty) {
      finalStdout = appendClearanceToPretty(
        result.stdout,
        clearance,
        protection,
      );
    } else {
      const sidecar = buildClearanceSidecar({
        pr: evidence.pr,
        verdictKind: evidence.kind,
        clearance,
        protection,
        reviewDecision,
        baseRefName,
      });
      finalStdout = appendSidecarToJsonStdout(
        result.stdout,
        evidence.lineIndex,
        sidecar,
      );
    }
  }
  io.stdout(finalStdout);

  if (!assertMerge) {
    putLastObserveReceipt(finalStdout, result.exitCode);
    return result.exitCode;
  }

  const headRefOid = resolveHeadRefOid(
    gh,
    { owner: evidence.owner, repo: evidence.repo },
    evidence.pr,
  );
  const resolved = await resolveMergeAttestation({
    argv: args.argv,
    store,
    owner: evidence.owner,
    repo: evidence.repo,
    pr: evidence.pr,
  });
  const attestation = resolved.attestation;
  const attestationClass = resolved.attestationClass;

  /** @type {import("./merge-policy.mjs").CheckRunEvidenceArg | null} */
  let checkRun = null;
  if (
    attestation &&
    attestation.kind === "verifier-bound-shipping" &&
    attestation.mint === "check-run"
  ) {
    const fetch = args.fetchCheckRun ?? createFetchCheckRun(gh);
    checkRun = await fetch(
      { owner: evidence.owner, repo: evidence.repo },
      headRefOid ?? "",
    );
  }

  const presence = parseClearancePresence(finalStdout);
  if (
    presence.kind === "absent" &&
    presence.reason === "no-terminal-verdict"
  ) {
    return result.exitCode;
  }

  const outcome = advanceAssertPhase({
    presence,
    clearance,
    attestation,
    headRefOid,
    attestationClass,
    checkRun,
  });
  if (outcome.kind === "missing-clearance") {
    io.stderr(
      `hebmu: missing-clearance (exit 4): ${outcome.detail}\n`,
    );
    return outcome.exitCode;
  }
  io.stderr(formatDispositionPretty(outcome.decision));
  return outcome.decision.exitCode;
}

/**
 * Thin alias over runEnrichedWatchPr for session-shaped call sites.
 *
 * @param {{
 *   mode?: "observe" | "assert";
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
 *   store?: import("./attestation-store.mjs").AttestationStore;
 *   io?: { stdout: (s: string) => void; stderr: (s: string) => void };
 * }} args
 * @returns {Promise<number>}
 */
export async function runWatchSession(args) {
  /** @type {string[]} */
  let argv = [...args.argv];
  if (args.mode === "assert" && !wantsAssertMerge(argv)) {
    argv = ["--assert-merge", ...argv];
  } else if (args.mode === "observe" && wantsAssertMerge(argv)) {
    argv = argv.filter((a) => a !== "--assert-merge");
  }
  return runEnrichedWatchPr({ ...args, argv });
}

// ---------------------------------------------------------------------------
// Self-test
// ---------------------------------------------------------------------------

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function runSelfTest() {
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

  // Live upstream READY interpolates JS null as the literal "null"
  // (render.ts: reviewDecision=${gate.reviewDecision}). gh returns "" for no
  // decision; upstream normalizes "" → null before pretty print.
  const liveReadyPretty =
    "READY: no merge conflicts, no unresolved review threads, no failing or pending checks\nmergeStateStatus=CLEAN\nreviewDecision=null\nisDraft=false\n";
  const pretty = appendClearanceToPretty(
    liveReadyPretty,
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

  const liveReadyParsed = parseEnrichEvidenceFromStdout(liveReadyPretty, {
    owner: "o",
    repo: "r",
    pr: 38,
  });
  assert(liveReadyParsed?.kind === "READY", "live READY kind");
  assert(
    liveReadyParsed?.reviewDecision === null,
    "live reviewDecision=null → null",
  );
  const emptyReadyParsed = parseEnrichEvidenceFromStdout(
    "READY: ok\nreviewDecision=\nisDraft=false\n",
    { owner: "o", repo: "r", pr: 38 },
  );
  assert(
    emptyReadyParsed?.reviewDecision === null,
    "empty reviewDecision= still → null",
  );
  console.log("ok  parse live reviewDecision=null READY fixture");

  const statusPretty = appendClearanceToPretty(
    "| PR | CI | Review | Merge |\n| --- | --- | --- | --- |\n| [#35](https://github.com/o/r/pull/35) | ✅ | ✅ | ✅ |\n",
    { kind: "ci-only", reason: "unprotected-base" },
    { kind: "unprotected" },
  );
  assert(
    statusPretty.includes("--- hebmu clearance ---"),
    "STATUS pretty header",
  );
  assert(
    statusPretty.includes("reviewClearance=ci-only"),
    "STATUS pretty clearance",
  );
  assert(
    appendClearanceToPretty(
      statusPretty,
      { kind: "approved" },
      { kind: "unprotected" },
    ) === statusPretty,
    "STATUS pretty idempotent",
  );
  console.log("ok  STATUS pretty append block");

  const statusParsed = parseEnrichEvidenceFromStdout(
    "| PR | CI | Review | Merge |\n| --- | --- | --- | --- |\n| [#35](https://github.com/o/r/pull/35) | ✅ | ✅ | ✅ |\n",
    { owner: "o", repo: "r", pr: 35 },
  );
  assert(statusParsed?.kind === "STATUS", "parse STATUS pretty kind");
  assert(statusParsed?.mode === "pretty", "parse STATUS pretty mode");
  assert(statusParsed?.reviewDecision === null, "STATUS pretty no reviewDecision");
  console.log("ok  parse STATUS pretty evidence");

  const statusJsonLine = JSON.stringify({
    kind: "STATUS",
    rows: [
      {
        kind: "merged",
        context: { owner: "o", repo: "r", number: 35 },
        facts: {
          reviewDecision: "APPROVED",
          baseRefName: "main",
        },
      },
    ],
  });
  const statusJsonParsed = parseEnrichEvidenceFromStdout(statusJsonLine + "\n", {
    owner: "o",
    repo: "r",
    pr: 35,
  });
  assert(statusJsonParsed?.kind === "STATUS", "parse STATUS json kind");
  assert(statusJsonParsed?.mode === "json", "parse STATUS json mode");
  assert(
    statusJsonParsed?.reviewDecision === "APPROVED",
    "STATUS json reviewDecision",
  );
  assert(statusJsonParsed?.baseRefName === "main", "STATUS json baseRefName");
  console.log("ok  parse STATUS JSON evidence");

  const sidecar = buildClearanceSidecar({
    pr: 31,
    verdictKind: "READY",
    clearance: { kind: "ci-only", reason: "unprotected-base" },
    protection: { kind: "unprotected" },
    reviewDecision: null,
    baseRefName: "main",
  });
  assert(sidecar.schema === "hebmu.clearance.v1", "sidecar schema");
  assert(sidecar.verdictKind === "READY", "sidecar READY verdictKind");
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

  const statusSidecar = buildClearanceSidecar({
    pr: 35,
    verdictKind: "STATUS",
    clearance: { kind: "ci-only", reason: "unprotected-base" },
    protection: { kind: "unprotected" },
    reviewDecision: null,
    baseRefName: "main",
  });
  assert(statusSidecar.verdictKind === "STATUS", "sidecar STATUS verdictKind");
  const statusJsonOut = appendSidecarToJsonStdout(
    statusJsonLine + "\n",
    0,
    statusSidecar,
  );
  const statusJsonLines = statusJsonOut.trim().split("\n");
  assert(statusJsonLines.length === 2, "STATUS json dual line");
  assert(JSON.parse(statusJsonLines[0]).kind === "STATUS", "STATUS upstream intact");
  assert(
    JSON.parse(statusJsonLines[1]).verdictKind === "STATUS",
    "STATUS sidecar verdictKind",
  );
  console.log("ok  STATUS JSON dual-line with verdictKind STATUS");

  await runDiscriminantHarness();
  await runMergeDispositionHarness();
  await runWrapperOnlyPresenceHarness();

  console.log("\nself-test: all passed");
}

/**
 * #48: bare READY/STATUS cannot assert-clear; missing clearance → exit 4.
 */
async function runWrapperOnlyPresenceHarness() {
  const tip = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
  const bareReady = [
    "READY: no merge conflicts, no unresolved review threads, no failing or pending checks",
    "mergeStateStatus=CLEAN",
    "reviewDecision=null",
    "isDraft=false",
    "",
  ].join("\n");

  const barePresence = parseClearancePresence(bareReady);
  assert(
    barePresence.kind === "absent" &&
      barePresence.reason === "terminal-without-clearance",
    "bare READY presence absent/terminal-without-clearance",
  );
  const bareOutcome = advanceAssertPhase({
    presence: barePresence,
    clearance: null,
    attestation: null,
    headRefOid: tip,
  });
  assert(
    bareOutcome.kind === "missing-clearance" && bareOutcome.exitCode === 4,
    `assert bare READY outcome ${JSON.stringify(bareOutcome)}`,
  );
  assert(
    resolveAssertProcessExit({
      stdout: bareReady,
      upstreamExit: 0,
      clearance: null,
      attestation: null,
      headRefOid: tip,
    }) === 4,
    "assert bare READY process exit 4",
  );
  const bareProcessExit = await runEnrichedWatchPr({
    argv: [
      "--assert-merge",
      "--owner",
      "o",
      "--repo",
      "r",
      "--pr",
      "48",
      "--pretty",
    ],
    upstreamDir: "/tmp",
    store: selfTestStore(),
    attachClearance: false,
    runUpstream: () => ({
      stdout: bareReady,
      stderr: "",
      exitCode: 0,
    }),
    gh: {
      api: () => ({
        status: 404,
        body: { message: "Branch not protected" },
      }),
      prView: () => ({
        baseRefName: "main",
        reviewDecision: null,
        headRefOid: tip,
      }),
    },
    io: { stdout: () => {}, stderr: () => {} },
  });
  assert(
    bareProcessExit === 4,
    `assert bare READY runEnrichedWatchPr exit ${bareProcessExit}`,
  );
  console.log("ok  assert bare READY (no hebmu markers) → exit 4");

  const bareReadyJson = JSON.stringify({
    kind: "READY",
    exitCode: 0,
    scope: {
      kind: "single",
      pr: {
        kind: "ready-pr",
        context: { owner: "o", repo: "r", number: 48 },
        proof: { gate: { reviewDecision: null } },
      },
    },
  });
  assert(
    resolveAssertProcessExit({
      stdout: bareReadyJson + "\n",
      upstreamExit: 0,
      attestation: null,
      headRefOid: tip,
    }) === 4,
    "assert bare READY JSON without sidecar → exit 4",
  );
  console.log("ok  assert bare READY JSON without sidecar → exit 4");

  const enrichedPretty = appendClearanceToPretty(
    bareReady,
    { kind: "ci-only", reason: "unprotected-base" },
    { kind: "unprotected" },
  );
  const enrichedPresence = parseClearancePresence(enrichedPretty);
  assert(enrichedPresence.kind === "present", "enriched pretty present");
  assert(
    parseClearancePresence(enrichedPretty).kind === "present",
    "parseClearancePresence idempotent on enriched pretty",
  );
  assert(enrichedPresence.kind === "present", "enriched presence for mint");
  const cleared = mintClearedVerdict({
    presence: enrichedPresence,
    upstreamExit: 0,
  });
  assert(cleared.__brand === "HebmuClearedVerdict", "cleared verdict brand");
  console.log("ok  parseClearancePresence present + mintClearedVerdict");

  assert(
    resolveAssertProcessExit({
      stdout: "waiting on checks…\n",
      upstreamExit: 7,
      attestation: null,
      headRefOid: tip,
    }) === 7,
    "assert no-terminal passthrough upstream exit",
  );
  console.log("ok  assert no-terminal-verdict passthrough upstream exit");

  // Wire-live: STATUS JSON with empty rows is terminal-shaped but not enrichable.
  const emptyStatusJson = JSON.stringify({ kind: "STATUS", rows: [] }) + "\n";
  const emptyStatusCode = await runEnrichedWatchPr({
    argv: [
      "--assert-merge",
      "--owner",
      "o",
      "--repo",
      "r",
      "--pr",
      "48",
    ],
    upstreamDir: "/tmp",
    store: selfTestStore(),
    runUpstream: () => ({
      stdout: emptyStatusJson,
      stderr: "",
      exitCode: 0,
    }),
    gh: {
      api: () => ({ status: 404, body: { message: "Not Found" } }),
      prView: () => ({
        baseRefName: "main",
        reviewDecision: null,
        headRefOid: tip,
      }),
    },
    io: { stdout: () => {}, stderr: () => {} },
  });
  assert(
    emptyStatusCode === 4,
    `assert terminal without enrich evidence exit ${emptyStatusCode}`,
  );
  console.log("ok  assert terminal-without-clearance via runEnrichedWatchPr → 4");

  /** @type {string[]} */
  const approvedOut = [];
  const approvedStore = selfTestStore();
  const approvedPretty = [
    "READY: no merge conflicts, no unresolved review threads, no failing or pending checks",
    "mergeStateStatus=CLEAN",
    "reviewDecision=APPROVED",
    "isDraft=false",
    "",
  ].join("\n");
  const approvedCode = await runEnrichedWatchPr({
    argv: [
      "--assert-merge",
      "--owner",
      "o",
      "--repo",
      "r",
      "--pr",
      "48",
      "--pretty",
    ],
    upstreamDir: "/tmp",
    store: approvedStore,
    runUpstream: () => ({
      stdout: approvedPretty,
      stderr: "",
      exitCode: 0,
    }),
    gh: {
      api: () => ({
        status: 200,
        body: {
          required_pull_request_reviews: {
            required_approving_review_count: 1,
          },
        },
      }),
      prView: () => ({
        baseRefName: "main",
        reviewDecision: "APPROVED",
        headRefOid: tip,
      }),
    },
    io: {
      stdout: (s) => approvedOut.push(s),
      stderr: () => {},
    },
  });
  assert(approvedCode === 0, `assert approved path exit ${approvedCode}`);
  assert(
    stdoutHasHebmuClearance(approvedOut.join("")),
    "assert approved stdout has clearance",
  );
  console.log("ok  assert enriched approved path → exit 0");

  const { readFileSync } = await import("node:fs");
  const landSrc = readFileSync(join(SCRIPT_DIR, "land-pr.mjs"), "utf8");
  const legacyMint = ["mintPermit", "FromAssertExit"].join("");
  assert(!landSrc.includes(legacyMint), "land-pr exit-only mint removed");
  console.log("ok  no remaining callers of exit-only assert mint");
}

async function runMergeDispositionHarness() {
  const tip = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
  const other = "cccccccccccccccccccccccccccccccccccccccc";
  const sealedPassLocal = /** @type {const} */ ({
    kind: "verifier-bound-shipping",
    verdict: "PASS",
    headRefOid: tip,
    sealedAt: "2026-11-08T00:00:00.000Z",
    mint: "local",
  });
  const sealedPassCheckRun = /** @type {const} */ ({
    kind: "verifier-bound-shipping",
    verdict: "PASS",
    headRefOid: tip,
    sealedAt: "2026-11-08T00:00:00.000Z",
    mint: "check-run",
    runId: 4242,
  });
  const sealedFail = /** @type {const} */ ({
    kind: "verifier-bound-shipping",
    verdict: "FAIL",
    headRefOid: tip,
    sealedAt: "2026-11-08T00:00:00.000Z",
    mint: "local",
  });
  /** @type {import("./merge-policy.mjs").CheckRunEvidenceArg} */
  const checkRunOk = {
    status: "ok",
    runId: 4242,
    conclusion: "success",
    headSha: tip,
  };

  /** @type {ReadonlyArray<{
   *   name: string;
   *   clearance: ReviewClearance;
   *   attestation: import("./merge-policy.mjs").MergeAttestation | null;
   *   headRefOid: string | null;
   *   checkRun?: import("./merge-policy.mjs").CheckRunEvidenceArg | null;
   *   attestationClass?: "missing" | "unusable" | "forged";
   *   wantDisposition: string;
   *   wantExit: number;
   *   wantReason?: string;
   *   wantMissing?: string;
   * }>} */
  const matrix = [
    {
      name: "approved + null → allow/0",
      clearance: { kind: "approved" },
      attestation: null,
      headRefOid: tip,
      wantDisposition: "allow",
      wantExit: 0,
    },
    {
      name: "ci-only + null → require-attestation/2",
      clearance: { kind: "ci-only", reason: "unprotected-base" },
      attestation: null,
      headRefOid: tip,
      wantDisposition: "require-attestation",
      wantExit: 2,
      wantMissing: "sealed-shipping-or-override",
    },
    {
      name: "ci-only + local PASS matching oid → block/3",
      clearance: { kind: "ci-only", reason: "unprotected-base" },
      attestation: sealedPassLocal,
      headRefOid: tip,
      wantDisposition: "block",
      wantExit: 3,
      wantReason: "attestation-rejected",
    },
    {
      name: "ci-only + check-run PASS + evidence ok → allow/0",
      clearance: { kind: "ci-only", reason: "unprotected-base" },
      attestation: sealedPassCheckRun,
      headRefOid: tip,
      checkRun: checkRunOk,
      wantDisposition: "allow",
      wantExit: 0,
    },
    {
      name: "ci-only + verifier-bound PASS mismatched oid → require-attestation/2",
      clearance: { kind: "ci-only", reason: "unprotected-base" },
      attestation: sealedPassLocal,
      headRefOid: other,
      wantDisposition: "require-attestation",
      wantExit: 2,
      wantMissing: "sealed-shipping-or-override",
    },
    {
      name: "ci-only + verifier-bound PASS + null headRefOid → require-attestation/2",
      clearance: { kind: "ci-only", reason: "unprotected-base" },
      attestation: sealedPassLocal,
      headRefOid: null,
      wantDisposition: "require-attestation",
      wantExit: 2,
      wantMissing: "sealed-shipping-or-override",
    },
    {
      name: "ci-only + verifier-bound FAIL matching oid → block/3",
      clearance: { kind: "ci-only", reason: "unprotected-base" },
      attestation: sealedFail,
      headRefOid: tip,
      wantDisposition: "block",
      wantExit: 3,
      wantReason: "attestation-rejected",
    },
    {
      name: "ci-only + explicit-override → allow/0",
      clearance: { kind: "ci-only", reason: "unprotected-base" },
      attestation: {
        kind: "explicit-override",
        by: "alice",
        reason: "emergency",
      },
      headRefOid: null,
      wantDisposition: "allow",
      wantExit: 0,
    },
    {
      name: "review-required + sealed matching PASS → block/3",
      clearance: { kind: "review-required" },
      attestation: sealedPassLocal,
      headRefOid: tip,
      wantDisposition: "block",
      wantExit: 3,
      wantReason: "review-required",
    },
    {
      name: "changes-requested + null → block/3",
      clearance: { kind: "changes-requested" },
      attestation: null,
      headRefOid: tip,
      wantDisposition: "block",
      wantExit: 3,
      wantReason: "changes-requested",
    },
    {
      name: "unknown + sealed PASS → block/3",
      clearance: { kind: "unknown", detail: "HTTP 403" },
      attestation: sealedPassLocal,
      headRefOid: tip,
      wantDisposition: "block",
      wantExit: 3,
      wantReason: "unknown",
    },
    {
      name: "ci-only + forged class null → block/3",
      clearance: { kind: "ci-only", reason: "unprotected-base" },
      attestation: null,
      headRefOid: tip,
      attestationClass: "forged",
      wantDisposition: "block",
      wantExit: 3,
      wantReason: "attestation-rejected",
    },
  ];

  for (const row of matrix) {
    const decision = evaluateMergeDisposition({
      clearance: row.clearance,
      attestation: row.attestation,
      checkRun: row.checkRun ?? null,
      attestationClass: row.attestationClass,
      headRefOid: row.headRefOid,
    });
    assert(
      decision.disposition === row.wantDisposition,
      `${row.name}: disposition ${decision.disposition}`,
    );
    assert(
      decision.exitCode === row.wantExit,
      `${row.name}: exit ${decision.exitCode}`,
    );
    if (row.wantReason) {
      assert(
        decision.disposition === "block" && decision.reason === row.wantReason,
        `${row.name}: reason ${decision.disposition === "block" ? decision.reason : "?"}`,
      );
    }
    if (row.wantMissing) {
      assert(
        decision.disposition === "require-attestation" &&
          decision.missing === row.wantMissing,
        `${row.name}: missing ${decision.disposition === "require-attestation" ? decision.missing : "?"}`,
      );
    }
    const again = evaluateMergeDisposition({
      clearance: row.clearance,
      attestation: row.attestation,
      headRefOid: row.headRefOid,
      checkRun: row.checkRun ?? null,
      attestationClass: row.attestationClass,
    });
    assert(
      JSON.stringify(again) === JSON.stringify(decision),
      `${row.name}: idempotent`,
    );
    console.log(`ok  disposition ${row.name}`);
  }

  let threwShipping = false;
  try {
    parseAttestationFromArgv(["--shipping-verdict", "PASS"]);
  } catch (err) {
    threwShipping = isShippingVerdictRemovedError(err);
  }
  assert(threwShipping, "parse --shipping-verdict PASS hard-throws");
  assert(
    parseAttestationFromArgv([]) === null,
    "parse no attestation → null",
  );
  const parsedOverride = parseAttestationFromArgv([
    "--merge-override",
    "alice",
    "--merge-override-reason",
    "ship",
  ]);
  assert(
    parsedOverride?.kind === "explicit-override",
    "parse override still works",
  );
  console.log("ok  parseAttestationFromArgv rejects shipping-verdict / accepts override");

  const prettyCiOnlyReady = [
    "READY: no merge conflicts, no unresolved review threads, no failing or pending checks",
    "mergeStateStatus=CLEAN",
    "reviewDecision=null",
    "isDraft=false",
    "",
  ].join("\n");

  /** @type {string[]} */
  const observeOut = [];
  /** @type {string[]} */
  const observeErr = [];
  const observeCode = await runEnrichedWatchPr({
    argv: ["--owner", "o", "--repo", "r", "--pr", "40", "--pretty"],
    upstreamDir: "/tmp",
    store: selfTestStore(),
    runUpstream: () => ({
      stdout: prettyCiOnlyReady,
      stderr: "",
      exitCode: 0,
    }),
    gh: {
      api: () => ({
        status: 404,
        body: { message: "Branch not protected" },
      }),
      prView: () => ({
        baseRefName: "main",
        reviewDecision: null,
        headRefOid: tip,
      }),
    },
    io: {
      stdout: (s) => observeOut.push(s),
      stderr: (s) => observeErr.push(s),
    },
  });
  assert(observeCode === 0, `observe ci-only READY exit ${observeCode}`);
  assert(
    observeOut.join("").includes("reviewClearance=ci-only"),
    "observe still enriches clearance",
  );
  assert(
    !observeErr.join("").includes("--- hebmu merge disposition ---"),
    "observe must not emit disposition",
  );
  console.log("ok  observe path keeps upstream exit 0 for ci-only READY");

  {
    const observeStore = createVerifyingMemoryLastObserveStore(
      SELF_TEST_OBSERVE_VERIFY_KEY,
    );
    /** @type {string[]} */
    const out = [];
    const code = await runEnrichedWatchPr({
      argv: ["--owner", "o", "--repo", "r", "--pr", "54", "--pretty"],
      upstreamDir: "/tmp",
      store: selfTestStore(),
      lastObserveStore: observeStore,
      runUpstream: () => ({
        stdout: prettyCiOnlyReady,
        stderr: "",
        exitCode: 0,
      }),
      gh: {
        api: () => ({
          status: 404,
          body: { message: "Branch not protected" },
        }),
        prView: () => ({
          baseRefName: "main",
          reviewDecision: null,
          headRefOid: tip,
        }),
      },
      io: {
        stdout: (s) => out.push(s),
        stderr: () => {},
      },
    });
    assert(code === 0, `observe enriched READY still exit ${code}`);
    const receipt = observeStore.get({ owner: "o", repo: "r", pr: 54 });
    assert(receipt !== null, "observe enriched writes last-observe receipt");
    assert(
      receipt.markersPresent === true,
      "observe enriched receipt markersPresent true",
    );
    assert(
      receipt.headRefOid === tip,
      "observe enriched receipt binds tip when gh resolves",
    );
    assert(
      typeof receipt.sig === "string" && receipt.sig.length > 0,
      "observe enriched receipt is observe-minted (sig)",
    );
    assert(
      out.join("").includes("reviewClearance=ci-only"),
      "observe enriched still prints clearance",
    );
    console.log("ok  observe enriched writes markersPresent:true receipt");

    const bareStore = createVerifyingMemoryLastObserveStore(
      SELF_TEST_OBSERVE_VERIFY_KEY,
    );
    const bareCode = await runEnrichedWatchPr({
      argv: ["--owner", "o", "--repo", "r", "--pr", "54", "--pretty"],
      upstreamDir: "/tmp",
      store: selfTestStore(),
      lastObserveStore: bareStore,
      attachClearance: false,
      runUpstream: () => ({
        stdout: prettyCiOnlyReady,
        stderr: "",
        exitCode: 0,
      }),
      gh: {
        api: () => ({
          status: 404,
          body: { message: "Branch not protected" },
        }),
        prView: () => ({
          baseRefName: "main",
          reviewDecision: null,
          headRefOid: tip,
        }),
      },
      io: {
        stdout: () => {},
        stderr: () => {},
      },
    });
    assert(bareCode === 0, `observe attachClearance:false still exit ${bareCode}`);
    const bareReceipt = bareStore.get({ owner: "o", repo: "r", pr: 54 });
    assert(bareReceipt !== null, "observe bare still writes negative receipt");
    assert(
      bareReceipt.markersPresent === false,
      "observe bare receipt markersPresent false",
    );
    assert(
      typeof bareReceipt.sig === "string" && bareReceipt.sig.length > 0,
      "observe bare receipt is observe-minted (sig)",
    );
    console.log("ok  observe bare writes markersPresent:false receipt; exit 0");
  }

  /** @type {string[]} */
  const assertErr = [];
  const emptyStore = selfTestStore();
  const assertNoAttest = await runEnrichedWatchPr({
    argv: [
      "--assert-merge",
      "--owner",
      "o",
      "--repo",
      "r",
      "--pr",
      "40",
      "--pretty",
    ],
    upstreamDir: "/tmp",
    store: emptyStore,
    runUpstream: () => ({
      stdout: prettyCiOnlyReady,
      stderr: "",
      exitCode: 0,
    }),
    gh: {
      api: () => ({
        status: 404,
        body: { message: "Branch not protected" },
      }),
      prView: () => ({
        baseRefName: "main",
        reviewDecision: null,
        headRefOid: tip,
      }),
    },
    io: {
      stdout: () => {},
      stderr: (s) => assertErr.push(s),
    },
  });
  assert(
    assertNoAttest === 2,
    `assert ci-only empty store exit ${assertNoAttest}`,
  );
  assert(
    assertErr.join("").includes("disposition=require-attestation"),
    "assert emits require-attestation",
  );
  assert(
    assertErr.join("").includes("missing=sealed-shipping-or-override"),
    "assert missing sealed-shipping-or-override",
  );
  console.log("ok  --assert-merge ci-only empty store → exit 2");

  // Lander-mintable unsigned / forged JSON must not clear ci-only (#52).
  const landerUnsignedStore = selfTestStore();
  landerUnsignedStore.putRawForTest({
    schema: "hebmu.sealed-shipping.v2",
    owner: "o",
    repo: "r",
    pr: 40,
    headRefOid: tip,
    verdict: "PASS",
    sealedAt: "2026-11-08T00:00:00.000Z",
  });
  assert(
    (await landerUnsignedStore.get({ owner: "o", repo: "r", pr: 40 })) === null,
    "lander-mintable unsigned JSON → null attestation at store.get",
  );
  /** @type {string[]} */
  const landerUnsignedErr = [];
  const assertLanderUnsigned = await runEnrichedWatchPr({
    argv: [
      "--assert-merge",
      "--owner",
      "o",
      "--repo",
      "r",
      "--pr",
      "40",
      "--pretty",
    ],
    upstreamDir: "/tmp",
    store: landerUnsignedStore,
    runUpstream: () => ({
      stdout: prettyCiOnlyReady,
      stderr: "",
      exitCode: 0,
    }),
    gh: {
      api: () => ({
        status: 404,
        body: { message: "Branch not protected" },
      }),
      prView: () => ({
        baseRefName: "main",
        reviewDecision: null,
        headRefOid: tip,
      }),
    },
    io: {
      stdout: () => {},
      stderr: (s) => landerUnsignedErr.push(s),
    },
  });
  assert(
    assertLanderUnsigned === 2,
    `lander-mintable unsigned JSON → require-attestation exit ${assertLanderUnsigned}`,
  );
  assert(
    landerUnsignedErr.join("").includes("missing=sealed-shipping-or-override"),
    "lander-mintable unsigned → missing sealed-shipping-or-override",
  );
  console.log(
    "ok  lander-mintable unsigned JSON → reject (require-attestation/2)",
  );

  const landerForgedStore = selfTestStore();
  landerForgedStore.putRawForTest({
    schema: "hebmu.sealed-shipping.v2",
    owner: "o",
    repo: "r",
    pr: 40,
    headRefOid: tip,
    verdict: "PASS",
    sealedAt: "2026-11-08T00:00:00.000Z",
    mac: "00".repeat(32),
  });
  assert(
    (await landerForgedStore.get({ owner: "o", repo: "r", pr: 40 })) === null,
    "lander-mintable forged mac → null attestation at store.get",
  );
  const assertLanderForged = await runEnrichedWatchPr({
    argv: [
      "--assert-merge",
      "--owner",
      "o",
      "--repo",
      "r",
      "--pr",
      "40",
      "--pretty",
    ],
    upstreamDir: "/tmp",
    store: landerForgedStore,
    runUpstream: () => ({
      stdout: prettyCiOnlyReady,
      stderr: "",
      exitCode: 0,
    }),
    gh: {
      api: () => ({
        status: 404,
        body: { message: "Branch not protected" },
      }),
      prView: () => ({
        baseRefName: "main",
        reviewDecision: null,
        headRefOid: tip,
      }),
    },
    io: {
      stdout: () => {},
      stderr: () => {},
    },
  });
  assert(
    assertLanderForged === 2,
    `lander-mintable forged mac → require-attestation exit ${assertLanderForged}`,
  );
  console.log(
    "ok  lander-mintable forged JSON → reject (require-attestation/2)",
  );

  // #58: tip-matching PASS minted with shared HMAC only → require-attestation/2
  const landerSharedKeyStore = selfTestStore();
  landerSharedKeyStore.putRawForTest(
    forgeLegacyHmacWireForTest(
      {
        owner: "o",
        repo: "r",
        pr: 40,
        headRefOid: tip,
        verdict: "PASS",
        sealedAt: "2026-11-08T00:00:00.000Z",
      },
      "lander-also-holds-this-shared-hmac",
    ),
  );
  assert(
    (await landerSharedKeyStore.get({ owner: "o", repo: "r", pr: 40 })) === null,
    "#58 lander-with-shared-key → null at store.get",
  );
  const assertLanderSharedKey = await runEnrichedWatchPr({
    argv: [
      "--assert-merge",
      "--owner",
      "o",
      "--repo",
      "r",
      "--pr",
      "40",
      "--pretty",
    ],
    upstreamDir: "/tmp",
    store: landerSharedKeyStore,
    runUpstream: () => ({
      stdout: prettyCiOnlyReady,
      stderr: "",
      exitCode: 0,
    }),
    gh: {
      api: () => ({
        status: 404,
        body: { message: "Branch not protected" },
      }),
      prView: () => ({
        baseRefName: "main",
        reviewDecision: null,
        headRefOid: tip,
      }),
    },
    io: {
      stdout: () => {},
      stderr: () => {},
    },
  });
  assert(
    assertLanderSharedKey === 2,
    `#58 lander-with-shared-key → require-attestation exit ${assertLanderSharedKey}`,
  );
  console.log(
    "ok  #58 lander-with-shared-key → reject (require-attestation/2)",
  );

  const matchStore = selfTestStore();
  matchStore.put(
    mintVerifierBoundAttestation(
      {
        owner: "o",
        repo: "r",
        pr: 40,
        headRefOid: tip,
        verdict: "PASS",
        sealedAt: "2026-11-08T00:00:00.000Z",
      },
      SELF_TEST_MINT_KEY,
    ),
  );
  const assertMatchLocal = await runEnrichedWatchPr({
    argv: [
      "--assert-merge",
      "--owner",
      "o",
      "--repo",
      "r",
      "--pr",
      "40",
      "--pretty",
    ],
    upstreamDir: "/tmp",
    store: matchStore,
    runUpstream: () => ({
      stdout: prettyCiOnlyReady,
      stderr: "",
      exitCode: 0,
    }),
    gh: {
      api: () => ({
        status: 404,
        body: { message: "Branch not protected" },
      }),
      prView: () => ({
        baseRefName: "main",
        reviewDecision: null,
        headRefOid: tip,
      }),
    },
    io: {
      stdout: () => {},
      stderr: () => {},
    },
  });
  assert(
    assertMatchLocal === 3,
    `assert local matching seal exit ${assertMatchLocal}`,
  );
  console.log("ok  #66 local tip-matching PASS → attestation-rejected/3");

  const {
    forgeCheckRunJwtForTest,
    mintCheckRunSealWire,
    verifyCheckRunSealWire,
    SEALED_SHIPPING_SCHEMA_V4: V4,
  } = await import("./check-run-crypto.mjs");
  const { generateKeyPairSync } = await import("node:crypto");
  const oidcKeys = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicExponent: 0x10001,
  });
  const oidcKid = "watch-pr-self-test-kid";
  const oidcJwk = {
    ...oidcKeys.publicKey.export({ format: "jwk" }),
    kid: oidcKid,
    use: "sig",
    alg: "RS256",
  };
  const oidcNow = 1_783_627_200;
  const oidcJwt = forgeCheckRunJwtForTest(
    oidcKeys.privateKey,
    {
      iss: "https://token.actions.githubusercontent.com",
      aud: "hebmu-seal",
      repository: "o/r",
      event_name: "workflow_dispatch",
      workflow: "seal-shipping",
      run_id: "4242",
      run_attempt: "1",
      actor: "self-test",
      exp: oidcNow + 3600,
      iat: oidcNow,
    },
    oidcKid,
  );
  const checkRunIdentity = createGhIdentityVerifier({
    fetchJwks: async () => ({ keys: [oidcJwk] }),
    nowSec: () => oidcNow,
  });
  const checkRunStore = createVerifyingMemoryStore(
    SELF_TEST_VERIFY_KEY,
    checkRunIdentity,
  );
  const v4Wire = mintCheckRunSealWire(
    {
      owner: "o",
      repo: "r",
      pr: 40,
      headRefOid: tip,
      verdict: "PASS",
      sealedAt: "2026-11-08T00:00:00.000Z",
    },
    oidcJwt,
  );
  assert(v4Wire.schema === V4, "self-test v4 wire schema");
  const verifiedV4 = await verifyCheckRunSealWire(v4Wire, {
    identity: checkRunIdentity,
  });
  assert(verifiedV4.status === "verified", "self-test v4 verify");
  if (verifiedV4.status !== "verified") {
    throw new Error("unreachable");
  }
  checkRunStore.put(verifiedV4.attestation);
  const assertMatchCheckRun = await runEnrichedWatchPr({
    argv: [
      "--assert-merge",
      "--owner",
      "o",
      "--repo",
      "r",
      "--pr",
      "40",
      "--pretty",
    ],
    upstreamDir: "/tmp",
    store: checkRunStore,
    fetchCheckRun: async () => ({
      status: "ok",
      runId: 4242,
      conclusion: "success",
      headSha: tip,
    }),
    runUpstream: () => ({
      stdout: prettyCiOnlyReady,
      stderr: "",
      exitCode: 0,
    }),
    gh: {
      api: () => ({
        status: 404,
        body: { message: "Branch not protected" },
      }),
      prView: () => ({
        baseRefName: "main",
        reviewDecision: null,
        headRefOid: tip,
      }),
    },
    io: {
      stdout: () => {},
      stderr: () => {},
    },
  });
  assert(
    assertMatchCheckRun === 0,
    `assert check-run matching seal exit ${assertMatchCheckRun}`,
  );
  console.log("ok  #66 check-run tip-matching PASS + evidence → allow/0");

  const staleStore = selfTestStore();
  staleStore.put(
    mintVerifierBoundAttestation(
      {
        owner: "o",
        repo: "r",
        pr: 40,
        headRefOid: tip,
        verdict: "PASS",
        sealedAt: "2026-11-08T00:00:00.000Z",
      },
      SELF_TEST_MINT_KEY,
    ),
  );
  const assertStale = await runEnrichedWatchPr({
    argv: [
      "--assert-merge",
      "--owner",
      "o",
      "--repo",
      "r",
      "--pr",
      "40",
      "--pretty",
    ],
    upstreamDir: "/tmp",
    store: staleStore,
    runUpstream: () => ({
      stdout: prettyCiOnlyReady,
      stderr: "",
      exitCode: 0,
    }),
    gh: {
      api: () => ({
        status: 404,
        body: { message: "Branch not protected" },
      }),
      prView: () => ({
        baseRefName: "main",
        reviewDecision: null,
        headRefOid: other,
      }),
    },
    io: {
      stdout: () => {},
      stderr: () => {},
    },
  });
  assert(assertStale === 2, `assert stale oid exit ${assertStale}`);
  console.log("ok  --assert-merge ci-only + stale sealed PASS → exit 2");

  const barePass = await runEnrichedWatchPr({
    argv: [
      "--assert-merge",
      "--shipping-verdict",
      "PASS",
      "--owner",
      "o",
      "--repo",
      "r",
      "--pr",
      "40",
      "--pretty",
    ],
    upstreamDir: "/tmp",
    store: selfTestStore(),
    runUpstream: () => ({
      stdout: prettyCiOnlyReady,
      stderr: "",
      exitCode: 0,
    }),
    gh: {
      api: () => ({
        status: 404,
        body: { message: "Branch not protected" },
      }),
      prView: () => ({
        baseRefName: "main",
        reviewDecision: null,
        headRefOid: tip,
      }),
    },
    io: {
      stdout: () => {},
      stderr: () => {},
    },
  });
  assert(barePass === 2, `assert bare --shipping-verdict PASS exit ${barePass}`);
  console.log(
    "ok  --assert-merge ci-only + bare --shipping-verdict PASS → exit 2",
  );

  const assertOverride = await runEnrichedWatchPr({
    argv: [
      "--assert-merge",
      "--merge-override",
      "alice",
      "--merge-override-reason",
      "emergency",
      "--owner",
      "o",
      "--repo",
      "r",
      "--pr",
      "40",
      "--pretty",
    ],
    upstreamDir: "/tmp",
    store: selfTestStore(),
    runUpstream: () => ({
      stdout: prettyCiOnlyReady,
      stderr: "",
      exitCode: 0,
    }),
    gh: {
      api: () => ({
        status: 404,
        body: { message: "Branch not protected" },
      }),
      prView: () => ({
        baseRefName: "main",
        reviewDecision: null,
        headRefOid: tip,
      }),
    },
    io: {
      stdout: () => {},
      stderr: () => {},
    },
  });
  assert(assertOverride === 0, `assert override exit ${assertOverride}`);
  console.log("ok  --assert-merge ci-only + override → exit 0 without store");

  {
    const savedMint = process.env.HEBMU_SEAL_MINT_KEY;
    const savedVerify = process.env.HEBMU_SEAL_VERIFY_KEY;
    const savedHmac = process.env.HEBMU_SEAL_HMAC_KEY;
    delete process.env.HEBMU_SEAL_MINT_KEY;
    delete process.env.HEBMU_SEAL_VERIFY_KEY;
    delete process.env.HEBMU_SEAL_HMAC_KEY;
    try {
      const overrideNoSealEnv = await runEnrichedWatchPr({
        argv: [
          "--assert-merge",
          "--merge-override",
          "alice",
          "--merge-override-reason",
          "emergency",
          "--owner",
          "o",
          "--repo",
          "r",
          "--pr",
          "40",
          "--pretty",
        ],
        upstreamDir: "/tmp",
        // no store inject — prod lazy path
        runUpstream: () => ({
          stdout: prettyCiOnlyReady,
          stderr: "",
          exitCode: 0,
        }),
        gh: {
          api: () => ({
            status: 404,
            body: { message: "Branch not protected" },
          }),
          prView: () => ({
            baseRefName: "main",
            reviewDecision: null,
            headRefOid: tip,
          }),
        },
        io: {
          stdout: () => {},
          stderr: () => {},
        },
      });
      assert(
        overrideNoSealEnv === 0,
        `#58 override without seal env exit ${overrideNoSealEnv}`,
      );
      console.log(
        "ok  #58 --merge-override works with no seal env (lazy verify-key)",
      );
    } finally {
      if (savedMint === undefined) delete process.env.HEBMU_SEAL_MINT_KEY;
      else process.env.HEBMU_SEAL_MINT_KEY = savedMint;
      if (savedVerify === undefined) delete process.env.HEBMU_SEAL_VERIFY_KEY;
      else process.env.HEBMU_SEAL_VERIFY_KEY = savedVerify;
      if (savedHmac === undefined) delete process.env.HEBMU_SEAL_HMAC_KEY;
      else process.env.HEBMU_SEAL_HMAC_KEY = savedHmac;
    }
  }

  // #58: assert refuses when mint key still present (direct watch-pr --assert-merge)
  {
    const savedMint = process.env.HEBMU_SEAL_MINT_KEY;
    const savedVerify = process.env.HEBMU_SEAL_VERIFY_KEY;
    process.env.HEBMU_SEAL_MINT_KEY = "should-refuse";
    delete process.env.HEBMU_SEAL_VERIFY_KEY;
    let mintRefuseThrew = false;
    try {
      await runEnrichedWatchPr({
        argv: [
          "--assert-merge",
          "--owner",
          "o",
          "--repo",
          "r",
          "--pr",
          "40",
          "--pretty",
        ],
        upstreamDir: "/tmp",
        runUpstream: () => ({
          stdout: prettyCiOnlyReady,
          stderr: "",
          exitCode: 0,
        }),
        gh: {
          api: () => ({
            status: 404,
            body: { message: "Branch not protected" },
          }),
          prView: () => ({
            baseRefName: "main",
            reviewDecision: null,
            headRefOid: tip,
          }),
        },
        io: {
          stdout: () => {},
          stderr: () => {},
        },
      });
    } catch (err) {
      mintRefuseThrew =
        err instanceof Error &&
        err.message.includes("HEBMU_SEAL_MINT_KEY must not be set");
    } finally {
      if (savedMint === undefined) delete process.env.HEBMU_SEAL_MINT_KEY;
      else process.env.HEBMU_SEAL_MINT_KEY = savedMint;
      if (savedVerify === undefined) delete process.env.HEBMU_SEAL_VERIFY_KEY;
      else process.env.HEBMU_SEAL_VERIFY_KEY = savedVerify;
    }
    assert(mintRefuseThrew, "#58 assert refuses mint key in env");
    console.log("ok  #58 assert refuses HEBMU_SEAL_MINT_KEY in env");
  }

  const reviewRequiredPretty = [
    "READY: no merge conflicts, no unresolved review threads, no failing or pending checks",
    "mergeStateStatus=CLEAN",
    "reviewDecision=REVIEW_REQUIRED",
    "isDraft=false",
    "",
  ].join("\n");
  const reviewStore = selfTestStore();
  reviewStore.put(
    mintVerifierBoundAttestation(
      {
        owner: "o",
        repo: "r",
        pr: 40,
        headRefOid: tip,
        verdict: "PASS",
        sealedAt: "2026-11-08T00:00:00.000Z",
      },
      SELF_TEST_MINT_KEY,
    ),
  );
  const assertBlocked = await runEnrichedWatchPr({
    argv: [
      "--assert-merge",
      "--owner",
      "o",
      "--repo",
      "r",
      "--pr",
      "40",
      "--pretty",
    ],
    upstreamDir: "/tmp",
    store: reviewStore,
    runUpstream: () => ({
      stdout: reviewRequiredPretty,
      stderr: "",
      exitCode: 0,
    }),
    gh: {
      api: () => ({
        status: 200,
        body: {
          required_pull_request_reviews: {
            required_approving_review_count: 1,
          },
        },
      }),
      prView: () => ({
        baseRefName: "main",
        reviewDecision: "REVIEW_REQUIRED",
        headRefOid: tip,
      }),
    },
    io: {
      stdout: () => {},
      stderr: () => {},
    },
  });
  assert(
    assertBlocked === 3,
    `assert review-required + sealed PASS exit ${assertBlocked}`,
  );
  console.log(
    "ok  --assert-merge review-required + matching sealed PASS → exit 3",
  );

  const stripped = stripHebmuMergeArgv([
    "--assert-merge",
    "--shipping-verdict",
    "PASS",
    "--merge-override",
    "alice",
    "--merge-override-reason",
    "ship",
    "--owner",
    "o",
    "--repo",
    "r",
    "--pr",
    "40",
    "--pretty",
  ]);
  assert(
    !stripped.includes("--assert-merge") &&
      !stripped.includes("--shipping-verdict") &&
      !stripped.includes("PASS") &&
      !stripped.includes("--merge-override") &&
      !stripped.includes("alice") &&
      !stripped.includes("--merge-override-reason") &&
      !stripped.includes("ship") &&
      stripped.includes("--owner") &&
      stripped.includes("--pretty"),
    `stripHebmuMergeArgv kept hebmu flags: ${stripped.join(" ")}`,
  );

  /** @type {string[] | null} */
  let capturedUpstreamArgv = null;
  await runEnrichedWatchPr({
    argv: [
      "--assert-merge",
      "--shipping-verdict",
      "PASS",
      "--owner",
      "o",
      "--repo",
      "r",
      "--pr",
      "40",
      "--pretty",
    ],
    upstreamDir: "/tmp",
    store: selfTestStore(),
    runUpstream: (_dir, argv) => {
      capturedUpstreamArgv = [...argv];
      return {
        stdout: prettyCiOnlyReady,
        stderr: "",
        exitCode: 0,
      };
    },
    gh: {
      api: () => ({ status: 404, body: { message: "Not Found" } }),
      prView: () => ({
        baseRefName: "main",
        reviewDecision: null,
        headRefOid: tip,
      }),
    },
    io: {
      stdout: () => {},
      stderr: () => {},
    },
  });
  assert(capturedUpstreamArgv !== null, "upstream argv not captured");
  assert(
    !capturedUpstreamArgv.includes("--assert-merge") &&
      !capturedUpstreamArgv.includes("--shipping-verdict") &&
      !capturedUpstreamArgv.includes("PASS"),
    `upstream saw hebmu flags: ${capturedUpstreamArgv.join(" ")}`,
  );
  console.log("ok  hebmu merge flags stripped before upstream");
}

/**
 * Forge-backed multi-class harness (#39).
 * Ambient live prove on unprotected main only hits ci-only/unprotected-base.
 * Each advertised reviewClearance kind is exercised through runEnrichedWatchPr
 * with recorded upstream READY + mocked gh protection/reviewDecision.
 */
async function runDiscriminantHarness() {
  /** @type {ReadonlyArray<{
   *   name: string;
   *   reviewDecisionLine: string;
   *   protectionHttp: { status: number; body: unknown };
   *   wantClearance: string;
   *   wantExtra?: string;
   *   wantProtection: string;
   * }>} */
  const matrix = [
    {
      name: "approved",
      reviewDecisionLine: "reviewDecision=APPROVED",
      protectionHttp: {
        status: 200,
        body: {
          required_pull_request_reviews: {
            required_approving_review_count: 1,
          },
        },
      },
      wantClearance: "reviewClearance=approved",
      wantProtection: "protection=protected",
    },
    {
      name: "review-required",
      reviewDecisionLine: "reviewDecision=REVIEW_REQUIRED",
      protectionHttp: {
        status: 200,
        body: {
          required_pull_request_reviews: {
            required_approving_review_count: 1,
          },
        },
      },
      wantClearance: "reviewClearance=review-required",
      wantProtection: "protection=protected",
    },
    {
      name: "changes-requested",
      reviewDecisionLine: "reviewDecision=CHANGES_REQUESTED",
      protectionHttp: {
        status: 200,
        body: {
          required_pull_request_reviews: {
            required_approving_review_count: 1,
          },
        },
      },
      wantClearance: "reviewClearance=changes-requested",
      wantProtection: "protection=protected",
    },
    {
      name: "ci-only/unprotected-base",
      reviewDecisionLine: "reviewDecision=null",
      protectionHttp: { status: 404, body: { message: "Branch not protected" } },
      wantClearance: "reviewClearance=ci-only",
      wantExtra: "reviewClearanceReason=unprotected-base",
      wantProtection: "protection=unprotected",
    },
    {
      name: "ci-only/no-required-reviews",
      reviewDecisionLine: "reviewDecision=null",
      protectionHttp: {
        status: 200,
        body: {
          required_pull_request_reviews: {
            required_approving_review_count: 0,
          },
        },
      },
      wantClearance: "reviewClearance=ci-only",
      wantExtra: "reviewClearanceReason=no-required-reviews",
      wantProtection: "protection=protected",
    },
    {
      name: "unknown/missing-decision-on-protected",
      reviewDecisionLine: "reviewDecision=null",
      protectionHttp: {
        status: 200,
        body: {
          required_pull_request_reviews: {
            required_approving_review_count: 2,
          },
        },
      },
      wantClearance: "reviewClearance=unknown",
      wantExtra:
        "reviewClearanceDetail=reviewDecision missing while requiredApprovingReviewCount > 0",
      wantProtection: "protection=protected",
    },
    {
      name: "unknown/protection-unavailable",
      reviewDecisionLine: "reviewDecision=null",
      protectionHttp: { status: 403, body: { message: "HTTP 403" } },
      wantClearance: "reviewClearance=unknown",
      wantExtra: "reviewClearanceDetail=HTTP 403",
      wantProtection: "protection=unavailable",
    },
  ];

  const kinds = new Set(
    matrix.map((row) => row.wantClearance.replace("reviewClearance=", "")),
  );
  for (const required of [
    "approved",
    "review-required",
    "changes-requested",
    "ci-only",
    "unknown",
  ]) {
    assert(kinds.has(required), `matrix missing kind ${required}`);
  }

  for (const row of matrix) {
    const prettyIn = [
      "READY: no merge conflicts, no unresolved review threads, no failing or pending checks",
      "mergeStateStatus=CLEAN",
      row.reviewDecisionLine,
      "isDraft=false",
      "",
    ].join("\n");

    /** @type {string[]} */
    const out = [];
    const code = await runEnrichedWatchPr({
      argv: ["--owner", "o", "--repo", "r", "--pr", "39", "--pretty"],
      upstreamDir: "/tmp",
      runUpstream: () => ({ stdout: prettyIn, stderr: "", exitCode: 0 }),
      gh: {
        api: () => row.protectionHttp,
        prView: () => ({
          baseRefName: "main",
          reviewDecision: null,
        }),
      },
      io: {
        stdout: (s) => out.push(s),
        stderr: () => {},
      },
    });
    assert(code === 0, `${row.name}: exit ${code}`);
    const text = out.join("");
    assert(
      text.includes("--- hebmu clearance ---"),
      `${row.name}: missing clearance header`,
    );
    assert(text.includes(row.wantClearance), `${row.name}: ${row.wantClearance}`);
    if (row.wantExtra) {
      assert(text.includes(row.wantExtra), `${row.name}: ${row.wantExtra}`);
    }
    assert(
      text.includes(row.wantProtection),
      `${row.name}: ${row.wantProtection}`,
    );

    // Pretty format unit for the same classified pair (no forge).
    const decisionRaw = row.reviewDecisionLine.split("=")[1];
    const clearance = classifyReviewClearance({
      reviewDecision: normalizeReviewDecision(decisionRaw),
      protection: parseProtectionHttp(
        row.protectionHttp.status,
        row.protectionHttp.body,
      ),
    });
    const prettyBlock = formatClearancePretty(
      clearance,
      parseProtectionHttp(row.protectionHttp.status, row.protectionHttp.body),
    );
    assert(
      prettyBlock.includes(row.wantClearance),
      `${row.name}: formatClearancePretty`,
    );

    console.log(`ok  discriminant harness ${row.name}`);
  }
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

async function main(argv) {
  if (argv.includes("--self-test")) {
    await runSelfTest();
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
