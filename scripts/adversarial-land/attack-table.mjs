/**
 * ATTACKS registry — sole owner of #53 hole-class oracles.
 */
import { HOLE_IDS } from "./holes.mjs";
import { runBareMergeProbes } from "./bare-merge.mjs";
import { TRUNK_FIXTURES } from "./trunk-fixtures.mjs";

/**
 * @typedef {import("./holes.mjs").HoleId} HoleId
 * @typedef {import("./context.mjs").AttackContext} AttackContext
 *
 * @typedef {"denied" | "allowed" | "error"} AttackOutcome
 *
 * @typedef {{
 *   id: HoleId;
 *   outcome: AttackOutcome;
 *   detail: string;
 *   evidence?: {
 *     exitCode?: number;
 *     mergeCalls?: number;
 *     threw?: string;
 *     staticHits?: readonly string[];
 *     trunkWouldAllow?: boolean;
 *     tipDenied?: boolean;
 *   };
 * }} AttackObservation
 *
 * @typedef {{
 *   id: HoleId;
 *   title: string;
 *   run: (ctx: AttackContext) => Promise<AttackObservation>;
 * }} Attack
 */

/**
 * Fail fast if ATTACKS ⊄ HOLE_IDS or missing/duplicate ids.
 * @param {readonly Attack[]} [attacks]
 */
export function assertAttackTableComplete(attacks = ATTACKS) {
  const expected = new Set(HOLE_IDS);
  const seen = new Set();
  /** @type {string[]} */
  const dupes = [];
  /** @type {string[]} */
  const extra = [];
  for (const a of attacks) {
    if (seen.has(a.id)) dupes.push(a.id);
    seen.add(a.id);
    if (!expected.has(a.id)) extra.push(a.id);
  }
  /** @type {string[]} */
  const missing = [];
  for (const id of expected) {
    if (!seen.has(id)) missing.push(id);
  }
  if (dupes.length || extra.length || missing.length) {
    throw new Error(
      `adversarial-land: ATTACKS incomplete` +
        (missing.length ? `; missing=${missing.join(",")}` : "") +
        (extra.length ? `; extra=${extra.join(",")}` : "") +
        (dupes.length ? `; dupes=${dupes.join(",")}` : ""),
    );
  }
}

/**
 * @param {AttackContext} ctx
 * @param {string} upstreamStdout
 * @param {string} headRefOid
 * @param {import("../attestation-store.mjs").AttestationStore} store
 * @param {readonly string[]} [extraArgv]
 * @param {{ attachClearance?: boolean }} [opts]
 */
async function assertWithUpstream(
  ctx,
  upstreamStdout,
  headRefOid,
  store,
  extraArgv = [],
  opts = {},
) {
  return ctx.tip.runEnrichedWatchPr({
    argv: ctx.assertArgv(extraArgv),
    upstreamDir: "/tmp",
    store,
    attachClearance: opts.attachClearance,
    runUpstream: () => ({
      stdout: upstreamStdout,
      stderr: "",
      exitCode: 0,
    }),
    gh: ctx.ciOnlyGh(headRefOid),
    io: ctx.silentIo,
  });
}

/** @type {readonly Attack[]} */
export const ATTACKS = Object.freeze([
  {
    id: "bare-pass",
    title: "bare --shipping-verdict PASS must not attest or parse in land-pr",
    async run(ctx) {
      /** @type {string | undefined} */
      let threw;
      try {
        ctx.tip.parseLandArgv([
          "--owner",
          ctx.target.owner,
          "--repo",
          ctx.target.repo,
          "--pr",
          String(ctx.target.pr),
          "--shipping-verdict",
          "PASS",
        ]);
      } catch (err) {
        threw = err instanceof Error ? err.message : String(err);
      }
      const parseDenied =
        threw === ctx.tip.LAND_SHIPPING_VERDICT_REMOVED;

      // Enrich path: bare flag soft-fails → ci-only require-attestation/2.
      // Feed enriched-looking upstream; clearance attaches; empty store +
      // bare PASS argv → exit 2 (never honor PASS).
      const exitCode = await assertWithUpstream(
        ctx,
        ctx.fixtures.bareReadyUpstreamStdout(),
        ctx.fixtures.liveTipOid,
        ctx.freshStore(),
        ["--shipping-verdict", "PASS"],
      );

      const denied = parseDenied && exitCode === 2;
      return {
        id: "bare-pass",
        outcome: denied ? "denied" : "allowed",
        detail: denied
          ? "assert exit 2; land parse throws"
          : `parseDenied=${parseDenied} assertExit=${exitCode}`,
        evidence: { exitCode, threw },
      };
    },
  },

  {
    id: "bare-ready",
    title: "bare READY without hebmu markers → assert 4; land skips merge",
    async run(ctx) {
      const bare = ctx.fixtures.bareReadyUpstreamStdout();
      const assertExit = await assertWithUpstream(
        ctx,
        bare,
        ctx.fixtures.liveTipOid,
        ctx.freshStore(),
        [],
        { attachClearance: false },
      );

      let mergeCalls = 0;
      const landExit = await ctx.tip.landPr(
        {
          target: ctx.target,
          passthrough: { argvTail: [] },
          dryRun: false,
          mergeArgs: [],
        },
        {
          io: ctx.silentIo,
          nowMs: () => 1_700_000_000_000,
          // Cleared observe receipt so preflight allows; assert-session bare
          // still denies (#48). soft-lure-observe covers missing/bare observe.
          ...ctx.clearedLastObserveDeps(),
          runAssert: async () => ({
            exitCode: 0,
            stdout: bare,
            stderr: "",
          }),
          runMerge: async () => {
            mergeCalls += 1;
            return { exitCode: 0, stdout: "", stderr: "" };
          },
        },
      );

      const denied =
        assertExit === 4 && landExit === 4 && mergeCalls === 0;
      return {
        id: "bare-ready",
        outcome: denied ? "denied" : "allowed",
        detail: denied
          ? "assert exit 4; land mergeCalls=0"
          : `assertExit=${assertExit} landExit=${landExit} mergeCalls=${mergeCalls}`,
        evidence: { exitCode: landExit, mergeCalls },
      };
    },
  },

  {
    id: "stale-tip",
    title: "PASS sealed to OID A must not clear live tip OID B",
    async run(ctx) {
      const store = ctx.freshStore();
      ctx.fixtures.putValidPass(store, ctx.fixtures.staleOid);
      const exitCode = await assertWithUpstream(
        ctx,
        ctx.fixtures.bareReadyUpstreamStdout(),
        ctx.fixtures.liveTipOid,
        store,
      );
      const denied = exitCode === 2;
      return {
        id: "stale-tip",
        outcome: denied ? "denied" : "allowed",
        detail: denied ? "assert exit 2" : `assertExit=${exitCode}`,
        evidence: { exitCode },
      };
    },
  },

  {
    id: "forged-seal",
    title: "unsigned/forged lander JSON must not clear ci-only",
    async run(ctx) {
      /** @type {number[]} */
      const exits = [];
      for (const kind of /** @type {const} */ (["unsigned", "forged-mac"])) {
        const store = ctx.freshStore();
        ctx.fixtures.putForgedOrUnsigned(store, kind);
        const got = store.get({
          owner: ctx.target.owner,
          repo: ctx.target.repo,
          pr: ctx.target.pr,
        });
        if (got !== null) {
          return {
            id: "forged-seal",
            outcome: "allowed",
            detail: `store.get non-null for ${kind}`,
            evidence: {},
          };
        }
        const exitCode = await assertWithUpstream(
          ctx,
          ctx.fixtures.bareReadyUpstreamStdout(),
          ctx.fixtures.liveTipOid,
          store,
        );
        exits.push(exitCode);
        if (exitCode !== 2) {
          return {
            id: "forged-seal",
            outcome: "allowed",
            detail: `${kind} assertExit=${exitCode}`,
            evidence: { exitCode },
          };
        }
      }
      return {
        id: "forged-seal",
        outcome: "denied",
        detail: "assert exit 2 (unsigned + forged-mac; store get null)",
        evidence: { exitCode: exits[0] },
      };
    },
  },

  {
    id: "bare-merge",
    title: "permit coupling + sole merge caller + anti assert&&merge",
    async run(ctx) {
      const probe = await runBareMergeProbes(ctx);
      return {
        id: "bare-merge",
        outcome: probe.outcome,
        detail: probe.detail,
        evidence: probe.evidence,
      };
    },
  },

  {
    id: "soft-lure-observe",
    title:
      "bare/missing last-observe receipt → land exit 4 before runAssert (#54)",
    async run(ctx) {
      /** @type {string[]} */
      const parts = [];
      let denied = true;

      // Missing receipt (ADR 0002 bare personal/plugin never writes).
      let assertCalls = 0;
      const missingExit = await ctx.tip.landPr(
        {
          target: ctx.target,
          passthrough: { argvTail: [] },
          dryRun: false,
          mergeArgs: [],
        },
        {
          io: ctx.silentIo,
          nowMs: () => 1_700_000_000_000,
          readLastObserveReceipt: () => null,
          resolveHeadRefOid: async () => ctx.fixtures.liveTipOid,
          runAssert: async () => {
            assertCalls += 1;
            return {
              exitCode: 0,
              stdout: ctx.fixtures.enrichedCiOnlyStdout(),
              stderr: "",
            };
          },
          runMerge: async () => ({ exitCode: 0, stdout: "", stderr: "" }),
        },
      );
      if (missingExit !== 4 || assertCalls !== 0) {
        denied = false;
        parts.push(
          `missing exit=${missingExit} assertCalls=${assertCalls}`,
        );
      } else {
        parts.push("missing→4 assertSkipped");
      }

      // Negative receipt (wrapper observe with attachClearance false).
      const {
        buildLastObserveReceipt,
        createMemoryLastObserveStore,
      } = await import("../last-observe-store.mjs");
      const bareStore = createMemoryLastObserveStore();
      bareStore.put(
        buildLastObserveReceipt({
          target: ctx.target,
          presence: { kind: "absent" },
          upstreamExit: 0,
          headRefOid: ctx.fixtures.liveTipOid,
          observedAt: "2026-11-08T00:00:00.000Z",
          verdictKind: "READY",
        }),
      );
      let bareAssertCalls = 0;
      const bareExit = await ctx.tip.landPr(
        {
          target: ctx.target,
          passthrough: { argvTail: [] },
          dryRun: false,
          mergeArgs: [],
        },
        {
          io: ctx.silentIo,
          nowMs: () => 1_700_000_000_000,
          readLastObserveReceipt: (t) => bareStore.get(t),
          resolveHeadRefOid: async () => ctx.fixtures.liveTipOid,
          runAssert: async () => {
            bareAssertCalls += 1;
            return {
              exitCode: 0,
              stdout: ctx.fixtures.enrichedCiOnlyStdout(),
              stderr: "",
            };
          },
          runMerge: async () => ({ exitCode: 0, stdout: "", stderr: "" }),
        },
      );
      if (bareExit !== 4 || bareAssertCalls !== 0) {
        denied = false;
        parts.push(
          `bare-receipt exit=${bareExit} assertCalls=${bareAssertCalls}`,
        );
      } else {
        parts.push("bare-receipt→4 assertSkipped");
      }

      return {
        id: "soft-lure-observe",
        outcome: denied ? "denied" : "allowed",
        detail: denied
          ? "missing+bare last-observe → exit 4; assert skipped"
          : parts.join("; "),
        evidence: { exitCode: missingExit, mergeCalls: 0 },
      };
    },
  },

  {
    id: "trunk-helper-on-gate-pr",
    title: "trunk fixtures would-allow; tip helpers deny same scenarios",
    async run(ctx) {
      /** @type {string[]} */
      const parts = [];
      let trunkWouldAllow = true;
      let tipDenied = true;

      // --- pre-#47 honor PASS ---
      const f47 = TRUNK_FIXTURES.find((f) => f.id === "pre-47-honor-pass");
      if (!f47 || !f47.wouldAllow()) {
        return {
          id: "trunk-helper-on-gate-pr",
          outcome: "allowed",
          detail: "trunk pre-47 fixture no longer would-allow (rot)",
          evidence: { trunkWouldAllow: false, tipDenied: false },
        };
      }
      const tip47 = await assertWithUpstream(
        ctx,
        ctx.fixtures.bareReadyUpstreamStdout(),
        ctx.fixtures.liveTipOid,
        ctx.freshStore(),
        ["--shipping-verdict", "PASS"],
      );
      let parseThrew = false;
      try {
        ctx.tip.parseLandArgv([
          "--owner",
          ctx.target.owner,
          "--repo",
          ctx.target.repo,
          "--pr",
          String(ctx.target.pr),
          "--shipping-verdict",
          "PASS",
        ]);
      } catch {
        parseThrew = true;
      }
      if (tip47 !== 2 || !parseThrew) {
        tipDenied = false;
        parts.push(`pre-47 tip allow (assert=${tip47}, parseThrew=${parseThrew})`);
      } else {
        parts.push("pre-47 tip denies");
      }

      // --- pre-#48 bare READY ---
      const f48 = TRUNK_FIXTURES.find((f) => f.id === "pre-48-bare-ready-allow");
      if (!f48 || !f48.wouldAllow()) {
        return {
          id: "trunk-helper-on-gate-pr",
          outcome: "allowed",
          detail: "trunk pre-48 fixture no longer would-allow (rot)",
          evidence: { trunkWouldAllow: false, tipDenied: false },
        };
      }
      const tip48 = await assertWithUpstream(
        ctx,
        ctx.fixtures.bareReadyUpstreamStdout(),
        ctx.fixtures.liveTipOid,
        ctx.freshStore(),
        [],
        { attachClearance: false },
      );
      if (tip48 !== 4) {
        tipDenied = false;
        parts.push(`pre-48 tip allow (assert=${tip48})`);
      } else {
        parts.push("pre-48 tip denies");
      }

      // --- pre-#52 lander JSON ---
      const f52 = TRUNK_FIXTURES.find((f) => f.id === "pre-52-lander-json-pass");
      if (!f52 || !f52.wouldAllow()) {
        return {
          id: "trunk-helper-on-gate-pr",
          outcome: "allowed",
          detail: "trunk pre-52 fixture no longer would-allow (rot)",
          evidence: { trunkWouldAllow: false, tipDenied: false },
        };
      }
      const forgedStore = ctx.freshStore();
      ctx.fixtures.putForgedOrUnsigned(forgedStore, "unsigned");
      const tip52 = await assertWithUpstream(
        ctx,
        ctx.fixtures.bareReadyUpstreamStdout(),
        ctx.fixtures.liveTipOid,
        forgedStore,
      );
      if (tip52 !== 2) {
        tipDenied = false;
        parts.push(`pre-52 tip allow (assert=${tip52})`);
      } else {
        parts.push("pre-52 tip denies");
      }

      const denied = tipDenied && trunkWouldAllow;
      return {
        id: "trunk-helper-on-gate-pr",
        outcome: denied ? "denied" : "allowed",
        detail: denied
          ? "tip denies; trunk fixtures would-allow"
          : parts.join("; "),
        evidence: { trunkWouldAllow, tipDenied },
      };
    },
  },
]);
