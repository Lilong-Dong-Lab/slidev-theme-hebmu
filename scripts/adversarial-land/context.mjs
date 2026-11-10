import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  forgeLegacyHmacWireForTest,
  generateSealKeyPairForTest,
  mintVerifierBoundAttestation,
} from "../attestation-crypto.mjs";
import { createVerifyingMemoryStore } from "../attestation-store.mjs";
import {
  generateObserveKeyPairForTest,
  mintObserveBoundReceipt,
} from "../observe-crypto.mjs";
import {
  landPr,
  parseLandArgv,
  mintPermitFromAssertSession,
  LAND_SHIPPING_VERDICT_REMOVED,
} from "../land-pr.mjs";
import { runEnrichedWatchPr } from "../watch-pr-clearance.mjs";
import { evaluateMergeDisposition } from "../merge-policy.mjs";
import { stdoutHasHebmuClearance } from "../clearance-presence.mjs";
import {
  buildLastObserveClaims,
  createVerifyingMemoryLastObserveStore,
} from "../last-observe-store.mjs";
import {
  HEBMU_SEAL_CHECK_RUN_NAME,
  SUITE_JWKS,
  SUITE_NOW_SEC,
  SUITE_RUN_ID,
  assembleCheckRunSealWire,
  forgeForeignCheckRunJwt,
  forgeSuiteCheckRunJwt,
  stubCheckRunEvidence,
  stubCheckRunsApiResponse,
} from "./check-run-fixtures.mjs";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const DEFAULT_REPO_ROOT = join(SCRIPT_DIR, "..", "..");

/** Adversarial-suite Ed25519 seal pair — never production env. */
const ADVERSARIAL_KEYS = generateSealKeyPairForTest();
export const ADVERSARIAL_MINT_KEY = ADVERSARIAL_KEYS.mintKey;
export const ADVERSARIAL_VERIFY_KEY = ADVERSARIAL_KEYS.verifyKey;

/** Adversarial-suite Ed25519 observe pair — never production env. */
const ADVERSARIAL_OBSERVE_KEYS = generateObserveKeyPairForTest();
export const ADVERSARIAL_OBSERVE_MINT_KEY = ADVERSARIAL_OBSERVE_KEYS.mintKey;
export const ADVERSARIAL_OBSERVE_VERIFY_KEY = ADVERSARIAL_OBSERVE_KEYS.verifyKey;

export const LIVE_TIP_OID = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
export const STALE_OID = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

/**
 * @typedef {import("./holes.mjs").HoleId} HoleId
 *
 * @typedef {{
 *   owner: string;
 *   repo: string;
 *   pr: number;
 * }} PrTarget
 *
 * @typedef {import("../attestation-store.mjs").MemoryAttestationStore} MemoryAttestationStore
 * @typedef {import("../last-observe-store.mjs").MemoryLastObserveStore} MemoryLastObserveStore
 *
 * @typedef {import("./check-run-fixtures.mjs").CheckRunEvidence} CheckRunEvidence
 *
 * @typedef {{
 *   bareReadyUpstreamStdout: () => string;
 *   enrichedCiOnlyStdout: () => string;
 *   liveTipOid: string;
 *   staleOid: string;
 *   putValidPass: (store: MemoryAttestationStore, oid: string) => void;
 *   putForgedOrUnsigned: (
 *     store: MemoryAttestationStore,
 *     kind: "unsigned" | "forged-mac" | "legacy-hmac",
 *   ) => void;
 *   putLegacyHmacPass: (store: MemoryAttestationStore, oid: string) => void;
 *   putCheckRunPass: (
 *     store: MemoryAttestationStore,
 *     opts?: {
 *       headRefOid?: string;
 *       runId?: number;
 *       repository?: string;
 *       jwt?: string;
 *     },
 *   ) => { runId: number; jwt: string };
 *   putForgedCheckRun: (
 *     store: MemoryAttestationStore,
 *     kind:
 *       | "forged-jwt-sig"
 *       | "jwt-wrong-repository"
 *       | "sha-chain-mismatch"
 *       | "pat-check-run-only"
 *       | "absent-check-run"
 *       | "check-run-api-unavailable",
 *   ) => {
 *     runId: number;
 *     evidence: CheckRunEvidence;
 *   };
 * }} AttackFixtures
 *
 * @typedef {{
 *   target: PrTarget;
 *   repoRoot: string;
 *   mintKey: import("../attestation-crypto.mjs").SealMintKey;
 *   verifyKey: import("../attestation-crypto.mjs").SealVerifyKey;
 *   observeMintKey: import("../observe-crypto.mjs").ObserveMintKey;
 *   observeVerifyKey: import("../observe-crypto.mjs").ObserveVerifyKey;
 *   freshStore: () => MemoryAttestationStore;
 *   freshObserveStore: () => MemoryLastObserveStore;
 *   suiteJwks: typeof SUITE_JWKS;
 *   suiteNowSec: number;
 *   tip: {
 *     landPr: typeof landPr;
 *     parseLandArgv: typeof parseLandArgv;
 *     mintPermitFromAssertSession: typeof mintPermitFromAssertSession;
 *     LAND_SHIPPING_VERDICT_REMOVED: string;
 *     runEnrichedWatchPr: typeof runEnrichedWatchPr;
 *     evaluateMergeDisposition: typeof evaluateMergeDisposition;
 *     mintVerifierBoundAttestation: typeof mintVerifierBoundAttestation;
 *     stdoutHasHebmuClearance: typeof stdoutHasHebmuClearance;
 *   };
 *   fixtures: AttackFixtures;
 *   silentIo: { stdout: (s: string) => void; stderr: (s: string) => void };
 *   ciOnlyGh: (
 *     headRefOid: string,
 *     checkRuns?: ReturnType<typeof stubCheckRunsApiResponse>,
 *   ) => {
 *     api: (path: string) => { status: number; body: unknown };
 *     prView: () => {
 *       baseRefName: string;
 *       reviewDecision: null;
 *       headRefOid: string;
 *     };
 *   };
 *   fetchCheckRunFromEvidence: (
 *     evidence: CheckRunEvidence,
 *   ) => (
 *     target: { owner: string; repo: string },
 *     headRefOid: string,
 *   ) => Promise<CheckRunEvidence>;
 *   assertArgv: (extra?: readonly string[]) => string[];
 *   clearedLastObserveDeps: () => {
 *     readLastObserveReceipt: (
 *       target: PrTarget,
 *     ) => import("../last-observe-store.mjs").LastObserveReceipt | null;
 *     resolveHeadRefOid: (target: PrTarget) => Promise<string | null>;
 *   };
 * }} AttackContext
 */

/**
 * @param {{
 *   repoRoot?: string;
 *   target?: PrTarget;
 * }} [opts]
 * @returns {AttackContext}
 */
export function createAttackContext(opts = {}) {
  const repoRoot = opts.repoRoot ?? DEFAULT_REPO_ROOT;
  const target = opts.target ?? {
    owner: "Lilong-Dong-Lab",
    repo: "slidev-theme-hebmu",
    pr: 53,
  };
  const mintKey = ADVERSARIAL_MINT_KEY;
  const verifyKey = ADVERSARIAL_VERIFY_KEY;
  const observeMintKey = ADVERSARIAL_OBSERVE_MINT_KEY;
  const observeVerifyKey = ADVERSARIAL_OBSERVE_VERIFY_KEY;

  /** @type {AttackFixtures} */
  const fixtures = {
    bareReadyUpstreamStdout: () =>
      [
        "READY: no merge conflicts, no unresolved review threads, no failing or pending checks",
        "mergeStateStatus=CLEAN",
        "reviewDecision=null",
        "isDraft=false",
        "",
      ].join("\n"),
    enrichedCiOnlyStdout: () =>
      [
        "READY: no merge conflicts, no unresolved review threads, no failing or pending checks",
        "mergeStateStatus=CLEAN",
        "reviewDecision=null",
        "isDraft=false",
        "--- hebmu clearance ---",
        "reviewClearance=ci-only",
        "reviewClearanceReason=unprotected-base",
        "protection=unprotected",
        "",
      ].join("\n"),
    liveTipOid: LIVE_TIP_OID,
    staleOid: STALE_OID,
    putValidPass(store, oid) {
      store.put(
        mintVerifierBoundAttestation(
          {
            owner: target.owner,
            repo: target.repo,
            pr: target.pr,
            headRefOid: oid,
            verdict: "PASS",
            sealedAt: "2026-11-08T00:00:00.000Z",
          },
          mintKey,
        ),
      );
    },
    putLegacyHmacPass(store, oid) {
      store.putRawForTest(
        forgeLegacyHmacWireForTest(
          {
            owner: target.owner,
            repo: target.repo,
            pr: target.pr,
            headRefOid: oid,
            verdict: "PASS",
            sealedAt: "2026-11-08T00:00:00.000Z",
          },
          "hebmu-adversarial-legacy-hmac-secret",
        ),
      );
    },
    putForgedOrUnsigned(store, kind) {
      if (kind === "legacy-hmac") {
        fixtures.putLegacyHmacPass(store, LIVE_TIP_OID);
        return;
      }
      /** @type {Record<string, unknown>} */
      const raw = {
        schema: "hebmu.sealed-shipping.v3",
        owner: target.owner,
        repo: target.repo,
        pr: target.pr,
        headRefOid: LIVE_TIP_OID,
        verdict: "PASS",
        sealedAt: "2026-11-08T00:00:00.000Z",
      };
      if (kind === "forged-mac") {
        raw.sig = "00".repeat(64);
      }
      store.putRawForTest(raw);
    },
    putCheckRunPass(store, opts = {}) {
      const headRefOid = opts.headRefOid ?? LIVE_TIP_OID;
      const runId = opts.runId ?? SUITE_RUN_ID;
      const repository =
        opts.repository ?? `${target.owner}/${target.repo}`;
      const jwt =
        opts.jwt ??
        forgeSuiteCheckRunJwt({
          repository,
          run_id: runId,
        });
      store.putRawForTest(
        assembleCheckRunSealWire({
          owner: target.owner,
          repo: target.repo,
          pr: target.pr,
          headRefOid,
          jwt,
        }),
      );
      return { runId, jwt };
    },
    putForgedCheckRun(store, kind) {
      const repository = `${target.owner}/${target.repo}`;
      if (kind === "forged-jwt-sig") {
        const jwt = forgeForeignCheckRunJwt({ repository });
        store.putRawForTest(
          assembleCheckRunSealWire({
            owner: target.owner,
            repo: target.repo,
            pr: target.pr,
            headRefOid: LIVE_TIP_OID,
            jwt,
          }),
        );
        return {
          runId: SUITE_RUN_ID,
          evidence: stubCheckRunEvidence({
            headSha: LIVE_TIP_OID,
          }),
        };
      }
      if (kind === "jwt-wrong-repository") {
        const jwt = forgeSuiteCheckRunJwt({
          repository: "Evil-Org/not-hebmu",
        });
        store.putRawForTest(
          assembleCheckRunSealWire({
            owner: target.owner,
            repo: target.repo,
            pr: target.pr,
            headRefOid: LIVE_TIP_OID,
            jwt,
          }),
        );
        return {
          runId: SUITE_RUN_ID,
          evidence: stubCheckRunEvidence({
            headSha: LIVE_TIP_OID,
          }),
        };
      }
      if (kind === "sha-chain-mismatch") {
        // Tip-matching claims + JWT, but live check-run headSha ≠ tip.
        const { runId } = fixtures.putCheckRunPass(store);
        return {
          runId,
          evidence: stubCheckRunEvidence({
            runId,
            headSha: STALE_OID,
          }),
        };
      }
      if (kind === "pat-check-run-only") {
        const { runId } = fixtures.putCheckRunPass(store);
        return {
          runId,
          evidence: stubCheckRunEvidence({
            runId: runId + 777,
            headSha: LIVE_TIP_OID,
          }),
        };
      }
      if (kind === "absent-check-run") {
        const { runId } = fixtures.putCheckRunPass(store);
        return {
          runId,
          evidence: stubCheckRunEvidence({ kind: "absent" }),
        };
      }
      // check-run-api-unavailable
      const { runId } = fixtures.putCheckRunPass(store);
      return {
        runId,
        evidence: stubCheckRunEvidence({ kind: "unavailable" }),
      };
    },
  };

  return {
    target,
    repoRoot,
    mintKey,
    verifyKey,
    observeMintKey,
    observeVerifyKey,
    // Product close injects SealIdentityVerifier as 2nd arg; tip ignores it.
    freshStore: () => createVerifyingMemoryStore(verifyKey),
    freshObserveStore: () =>
      createVerifyingMemoryLastObserveStore(observeVerifyKey),
    suiteJwks: SUITE_JWKS,
    suiteNowSec: SUITE_NOW_SEC,
    tip: {
      landPr,
      parseLandArgv,
      mintPermitFromAssertSession,
      LAND_SHIPPING_VERDICT_REMOVED,
      runEnrichedWatchPr,
      evaluateMergeDisposition,
      mintVerifierBoundAttestation,
      stdoutHasHebmuClearance,
    },
    fixtures,
    silentIo: { stdout: () => {}, stderr: () => {} },
    ciOnlyGh(headRefOid, checkRuns) {
      return {
        api(path) {
          if (typeof path === "string" && path.includes("/check-runs")) {
            return (
              checkRuns ??
              stubCheckRunsApiResponse({
                name: HEBMU_SEAL_CHECK_RUN_NAME,
                headSha: headRefOid,
              })
            );
          }
          return {
            status: 404,
            body: { message: "Branch not protected" },
          };
        },
        prView: () => ({
          baseRefName: "main",
          reviewDecision: null,
          headRefOid,
        }),
      };
    },
    fetchCheckRunFromEvidence(evidence) {
      return async () => evidence;
    },
    assertArgv(extra = []) {
      return [
        "--assert-merge",
        "--owner",
        target.owner,
        "--repo",
        target.repo,
        "--pr",
        String(target.pr),
        "--pretty",
        ...extra,
      ];
    },
    clearedLastObserveDeps() {
      const store = createVerifyingMemoryLastObserveStore(observeVerifyKey);
      store.put(
        mintObserveBoundReceipt(
          buildLastObserveClaims({
            target,
            presence: {
              kind: "present",
              verdictKind: "READY",
            },
            upstreamExit: 0,
            headRefOid: LIVE_TIP_OID,
            observedAt: "2026-11-08T00:00:00.000Z",
          }),
          observeMintKey,
        ),
      );
      return {
        readLastObserveReceipt: (t) => store.get(t),
        resolveHeadRefOid: async () => LIVE_TIP_OID,
      };
    },
  };
}
