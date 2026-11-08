/**
 * AttackContext factory + shared fixtures for #53 / #58 adversarial suite.
 */
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  forgeLegacyHmacWireForTest,
  generateSealKeyPairForTest,
  mintVerifierBoundAttestation,
} from "../attestation-crypto.mjs";
import { createVerifyingMemoryStore } from "../attestation-store.mjs";
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
  buildLastObserveReceipt,
  createMemoryLastObserveStore,
} from "../last-observe-store.mjs";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const DEFAULT_REPO_ROOT = join(SCRIPT_DIR, "..", "..");

/** Adversarial-suite Ed25519 pair — never production env. */
const ADVERSARIAL_KEYS = generateSealKeyPairForTest();
export const ADVERSARIAL_MINT_KEY = ADVERSARIAL_KEYS.mintKey;
export const ADVERSARIAL_VERIFY_KEY = ADVERSARIAL_KEYS.verifyKey;

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
 * }} AttackFixtures
 *
 * @typedef {{
 *   target: PrTarget;
 *   repoRoot: string;
 *   mintKey: import("../attestation-crypto.mjs").SealMintKey;
 *   verifyKey: import("../attestation-crypto.mjs").SealVerifyKey;
 *   freshStore: () => MemoryAttestationStore;
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
 *   ciOnlyGh: (headRefOid: string) => {
 *     api: () => { status: number; body: { message: string } };
 *     prView: () => {
 *       baseRefName: string;
 *       reviewDecision: null;
 *       headRefOid: string;
 *     };
 *   };
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
  };

  return {
    target,
    repoRoot,
    mintKey,
    verifyKey,
    freshStore: () => createVerifyingMemoryStore(verifyKey),
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
    ciOnlyGh(headRefOid) {
      return {
        api: () => ({
          status: 404,
          body: { message: "Branch not protected" },
        }),
        prView: () => ({
          baseRefName: "main",
          reviewDecision: null,
          headRefOid,
        }),
      };
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
      const store = createMemoryLastObserveStore();
      store.put(
        buildLastObserveReceipt({
          target,
          presence: {
            kind: "present",
            verdictKind: "READY",
          },
          upstreamExit: 0,
          headRefOid: LIVE_TIP_OID,
          observedAt: "2026-11-08T00:00:00.000Z",
        }),
      );
      return {
        readLastObserveReceipt: (t) => store.get(t),
        resolveHeadRefOid: async () => LIVE_TIP_OID,
      };
    },
  };
}
