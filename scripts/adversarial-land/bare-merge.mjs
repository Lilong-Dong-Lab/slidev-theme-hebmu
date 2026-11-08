/**
 * Bare-merge sub-probes for #53: permit coupling, sole caller, anti-recipe.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * Match land-pr's defaultRunMerge argv shape: consecutive string literals
 * for the gh subcommand pair (pr then merge). Built without embedding that
 * literal pair in this file's source (avoids self-hit).
 */
const PR_MERGE_ARGV_RE = new RegExp(
  String.raw`["']pr["']\s*,\s*["']` + "merge" + String.raw`["']`,
);

/** Shell-style merge invocation (recipe / script string). */
const GH_PR_MERGE_SHELL_RE = /\bgh\s+pr\s+merge\b/;

/**
 * Strip // and /* *\/ comments so forbid-phrase prose does not false-hit.
 * @param {string} text
 * @returns {string}
 */
function stripComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

/**
 * @param {string} dir
 * @param {(p: string) => boolean} want
 * @param {string[]} out
 */
function walkFiles(dir, want, out) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    const st = statSync(p);
    if (st.isDirectory()) {
      if (
        entry === "node_modules" ||
        entry === ".git" ||
        entry === "adversarial-land"
      ) {
        continue;
      }
      walkFiles(p, want, out);
    } else if (want(p)) {
      out.push(p);
    }
  }
}

/**
 * Static sole-caller: only scripts/land-pr.mjs may construct the gh
 * subcommand pair for merge under scripts/**. Docs mentioning the forbid
 * phrase are out of scope (scripts/** executable callers only). The
 * adversarial-land/ proof package is skipped (not a land path).
 *
 * @param {string} repoRoot
 * @returns {{
 *   ok: boolean;
 *   hits: readonly string[];
 *   detail: string;
 * }}
 */
export function probeSoleMergeCaller(repoRoot) {
  const scriptsRoot = join(repoRoot, "scripts");
  /** @type {string[]} */
  const files = [];
  walkFiles(
    scriptsRoot,
    (p) => /\.(mjs|js|cjs|sh)$/.test(p),
    files,
  );

  /** @type {string[]} */
  const hits = [];
  for (const file of files) {
    const rel = relative(repoRoot, file).replace(/\\/g, "/");
    // Skip this CLI entry if it only documents the gate (not a spawn).
    if (rel === "scripts/check-adversarial-land.mjs") continue;
    const code = stripComments(readFileSync(file, "utf8"));
    // Live spawn argv pair used by land-pr defaultRunMerge.
    if (PR_MERGE_ARGV_RE.test(code)) {
      hits.push(`${rel}:pr-merge-argv`);
    }
    if (GH_PR_MERGE_SHELL_RE.test(code)) {
      hits.push(`${rel}:shell-gh-pr-merge`);
    }
  }

  const allowedPrefix = "scripts/land-pr.mjs";
  const offenders = hits.filter((h) => !h.startsWith(allowedPrefix));
  if (offenders.length > 0) {
    return {
      ok: false,
      hits,
      detail: `extra merge callers under scripts/**: ${offenders.join("; ")}`,
    };
  }
  const landHits = hits.filter((h) => h.startsWith(allowedPrefix));
  if (landHits.length === 0) {
    return {
      ok: false,
      hits,
      detail: "land-pr.mjs no longer constructs pr/merge argv (fixture rot)",
    };
  }
  return {
    ok: true,
    hits,
    detail: `sole merge caller scripts/land-pr.mjs (${landHits.length} hit(s))`,
  };
}

/**
 * Permit coupling: deny / dry-run landPr paths never call runMerge;
 * allow path only reaches runMerge with branded LandPermit.
 *
 * @param {import("./context.mjs").AttackContext} ctx
 * @returns {Promise<{
 *   ok: boolean;
 *   mergeCalls: number;
 *   detail: string;
 * }>}
 */
export async function probePermitCoupling(ctx) {
  const { tip, target, fixtures, silentIo } = ctx;
  let mergeCalls = 0;
  /** @type {unknown} */
  let lastPermit = null;

  /**
   * @param {number} assertExit
   * @param {{ dryRun?: boolean; stdout?: string; expectMerge?: boolean }} opts
   */
  async function runCase(assertExit, opts = {}) {
    mergeCalls = 0;
    lastPermit = null;
    const exit = await tip.landPr(
      {
        target,
        passthrough: { argvTail: [] },
        dryRun: Boolean(opts.dryRun),
        mergeArgs: ["--squash"],
      },
      {
        io: silentIo,
        nowMs: () => 1_700_000_000_000,
        runAssert: async () => ({
          exitCode: assertExit,
          stdout: opts.stdout ?? fixtures.enrichedCiOnlyStdout(),
          stderr: "",
        }),
        runMerge: async (permit) => {
          mergeCalls += 1;
          lastPermit = permit;
          return { exitCode: 0, stdout: "", stderr: "" };
        },
      },
    );
    return exit;
  }

  const deny2 = await runCase(2);
  if (deny2 !== 2 || mergeCalls !== 0) {
    return {
      ok: false,
      mergeCalls,
      detail: `deny exit 2 still merged (exit=${deny2}, mergeCalls=${mergeCalls})`,
    };
  }

  const deny3 = await runCase(3);
  if (deny3 !== 3 || mergeCalls !== 0) {
    return {
      ok: false,
      mergeCalls,
      detail: `deny exit 3 still merged (exit=${deny3}, mergeCalls=${mergeCalls})`,
    };
  }

  const dry = await runCase(0, { dryRun: true });
  if (dry !== 0 || mergeCalls !== 0) {
    return {
      ok: false,
      mergeCalls,
      detail: `dry-run still merged (exit=${dry}, mergeCalls=${mergeCalls})`,
    };
  }

  const bare = await runCase(0, {
    stdout: fixtures.bareReadyUpstreamStdout(),
  });
  if (bare !== 4 || mergeCalls !== 0) {
    return {
      ok: false,
      mergeCalls,
      detail: `bare READY allow-without-permit (exit=${bare}, mergeCalls=${mergeCalls})`,
    };
  }

  const allow = await runCase(0);
  const branded =
    lastPermit &&
    typeof lastPermit === "object" &&
    /** @type {{ __brand?: string }} */ (lastPermit).__brand === "LandPermit";
  if (allow !== 0 || mergeCalls !== 1 || !branded) {
    return {
      ok: false,
      mergeCalls,
      detail: `allow path missing branded permit (exit=${allow}, mergeCalls=${mergeCalls}, branded=${Boolean(branded)})`,
    };
  }

  return {
    ok: true,
    mergeCalls: 1,
    detail: "deny/dry-run/bare skip merge; allow mints branded LandPermit",
  };
}

/**
 * Anti assert&&merge recipe: a fixture that merges on raw assert exit 0
 * without mintPermitFromAssertSession is classified would-allow (bad).
 * Tip path requires branded mint — that recipe scores denied.
 *
 * @param {import("./context.mjs").AttackContext} ctx
 * @returns {{
 *   ok: boolean;
 *   detail: string;
 * }}
 */
export function probeAntiAssertAndMergeRecipe(ctx) {
  const { tip, target, fixtures } = ctx;
  const enriched = fixtures.enrichedCiOnlyStdout();
  const bare = fixtures.bareReadyUpstreamStdout();

  /**
   * Forbidden recipe: assert exit 0 ⇒ merge (no clearance / permit mint).
   * @param {{ exitCode: number; stdout: string }} assertSession
   * @returns {"would-allow" | "denied"}
   */
  function forbiddenRecipe(assertSession) {
    if (assertSession.exitCode === 0) return "would-allow";
    return "denied";
  }

  /**
   * Tip blessed recipe: mintPermitFromAssertSession before merge.
   * @param {{ exitCode: number; stdout: string }} assertSession
   * @returns {"would-allow" | "denied"}
   */
  function tipRecipe(assertSession) {
    const gate = tip.mintPermitFromAssertSession({
      target,
      exitCode: assertSession.exitCode,
      stdout: assertSession.stdout,
      clock: { nowMs: () => 1 },
    });
    if (gate.kind === "allow" && gate.permit.__brand === "LandPermit") {
      return "would-allow"; // allow only with permit — not a bare recipe
    }
    return "denied";
  }

  // Bare READY exit 0: forbidden recipe would merge; tip must deny.
  const forbiddenOnBare = forbiddenRecipe({ exitCode: 0, stdout: bare });
  const tipOnBare = tipRecipe({ exitCode: 0, stdout: bare });
  if (forbiddenOnBare !== "would-allow") {
    return {
      ok: false,
      detail: "anti-recipe fixture no longer would-allow on bare READY (rot)",
    };
  }
  if (tipOnBare !== "denied") {
    return {
      ok: false,
      detail: "tip mint treated bare READY exit 0 as allow (regression)",
    };
  }

  // Enriched exit 0: tip may mint (that is the blessed path); forbidden
  // recipe also would-allow — suite requires tip went through mint brand.
  const tipOnEnriched = tip.mintPermitFromAssertSession({
    target,
    exitCode: 0,
    stdout: enriched,
    clock: { nowMs: () => 1 },
  });
  if (
    tipOnEnriched.kind !== "allow" ||
    tipOnEnriched.permit.__brand !== "LandPermit"
  ) {
    return {
      ok: false,
      detail: "tip mint failed to brand LandPermit on enriched allow",
    };
  }

  // Mechanical: merge deps require branded permit — defaultRunMerge source
  // reads permit.target; coupling probe already covers call gating.
  return {
    ok: true,
    detail:
      "assert&&merge recipe would-allow without mint; tip requires branded LandPermit",
  };
}

/**
 * Compose all bare-merge sub-probes into one observation payload.
 *
 * @param {import("./context.mjs").AttackContext} ctx
 * @returns {Promise<{
 *   outcome: "denied" | "allowed" | "error";
 *   detail: string;
 *   evidence: {
 *     mergeCalls?: number;
 *     staticHits?: readonly string[];
 *   };
 * }>}
 */
export async function runBareMergeProbes(ctx) {
  try {
    const coupling = await probePermitCoupling(ctx);
    const sole = probeSoleMergeCaller(ctx.repoRoot);
    const anti = probeAntiAssertAndMergeRecipe(ctx);

    const parts = [coupling.detail, sole.detail, anti.detail];
    const allOk = coupling.ok && sole.ok && anti.ok;
    return {
      outcome: allOk ? "denied" : "allowed",
      detail: parts.join("; "),
      evidence: {
        mergeCalls: coupling.mergeCalls,
        staticHits: sole.hits,
      },
    };
  } catch (err) {
    return {
      outcome: "error",
      detail: err instanceof Error ? err.message : String(err),
      evidence: {},
    };
  }
}
