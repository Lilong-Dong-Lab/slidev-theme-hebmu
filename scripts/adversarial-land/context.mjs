/**
 * AttackContext factory + shared fixtures for #53 adversarial suite.
 */
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { signingKeyFromTestSecret } from "../attestation-mac.mjs";
import { mintVerifierBoundAttestation } from "../attestation-mac.mjs";
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

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const DEFAULT_REPO_ROOT = join(SCRIPT_DIR, "..", "..");

/** Adversarial-suite HMAC material — never production env. */
export const ADVERSARIAL_SEAL_KEY = signingKeyFromTestSecret(
  "hebmu-adversarial-land-self-test-key",
);

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
 *     kind: "unsigned" | "forged-mac",
 *   ) => void;
 * }} AttackFixtures
 *
 * @typedef {{
 *   target: PrTarget;
 *   repoRoot: string;
 *   sealKey: import("../attestation-mac.mjs").VerifierSigningKey;
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
  const sealKey = ADVERSARIAL_SEAL_KEY;

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
          sealKey,
        ),
      );
    },
    putForgedOrUnsigned(store, kind) {
      /** @type {Record<string, unknown>} */
      const raw = {
        schema: "hebmu.sealed-shipping.v2",
        owner: target.owner,
        repo: target.repo,
        pr: target.pr,
        headRefOid: LIVE_TIP_OID,
        verdict: "PASS",
        sealedAt: "2026-11-08T00:00:00.000Z",
      };
      if (kind === "forged-mac") {
        raw.mac = "00".repeat(32);
      }
      store.putRawForTest(raw);
    },
  };

  return {
    target,
    repoRoot,
    sealKey,
    freshStore: () => createVerifyingMemoryStore(sealKey),
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
  };
}
