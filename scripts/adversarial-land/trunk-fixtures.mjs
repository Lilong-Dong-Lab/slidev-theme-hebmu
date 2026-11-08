/**
 * Frozen trunk-era behavioral stubs for trunk-helper-on-gate-pr (#53).
 *
 * These are inlined would-allow probes — not checked-out main blobs.
 * Each models a hole the tip now denies. Suite fails if a fixture no
 * longer would-allow (rot) or if tip allows (regression).
 */

/**
 * @typedef {{
 *   id: string;
 *   eraLabel: string;
 *   wouldAllow: () => boolean;
 * }} TrunkFixture
 */

/**
 * Pre-#47: honor `--shipping-verdict PASS` counted as attestation.
 * @param {readonly string[]} argv
 * @returns {boolean}
 */
export function trunkPre47WouldAllowHonorPass(argv) {
  const i = argv.indexOf("--shipping-verdict");
  return i >= 0 && argv[i + 1] === "PASS";
}

/**
 * Pre-#48: assert remapped disposition only; bare READY exit 0 → allow.
 * @param {string} stdout
 * @param {number} upstreamExit
 * @returns {boolean}
 */
export function trunkPre48WouldAllowBareReady(stdout, upstreamExit) {
  if (upstreamExit !== 0) return false;
  if (!/(?:^|\n)READY:/.test(stdout) && !/"kind"\s*:\s*"READY"/.test(stdout)) {
    return false;
  }
  // Trunk ignored presence; hebmu markers were not required.
  return (
    !stdout.includes("--- hebmu clearance ---") &&
    !stdout.includes("hebmu.clearance.v1")
  );
}

/**
 * Pre-#52: non-verifying store treated lander-writable JSON as PASS.
 * @param {unknown} raw
 * @returns {boolean}
 */
export function trunkPre52WouldAllowLanderJson(raw) {
  if (!raw || typeof raw !== "object") return false;
  const rec = /** @type {Record<string, unknown>} */ (raw);
  return rec.verdict === "PASS";
}

/** @type {readonly TrunkFixture[]} */
export const TRUNK_FIXTURES = Object.freeze([
  {
    id: "pre-47-honor-pass",
    eraLabel: "pre-#47 honor --shipping-verdict PASS as attestation",
    wouldAllow: () =>
      trunkPre47WouldAllowHonorPass([
        "--assert-merge",
        "--shipping-verdict",
        "PASS",
        "--owner",
        "o",
        "--repo",
        "r",
        "--pr",
        "53",
      ]),
  },
  {
    id: "pre-48-bare-ready-allow",
    eraLabel: "pre-#48 bare READY assert exit 0 (no presence gate)",
    wouldAllow: () =>
      trunkPre48WouldAllowBareReady(
        [
          "READY: no merge conflicts, no unresolved review threads, no failing or pending checks",
          "mergeStateStatus=CLEAN",
          "reviewDecision=null",
          "isDraft=false",
          "",
        ].join("\n"),
        0,
      ),
  },
  {
    id: "pre-52-lander-json-pass",
    eraLabel: "pre-#52 lander-writable unsigned JSON as PASS",
    wouldAllow: () =>
      trunkPre52WouldAllowLanderJson({
        schema: "hebmu.sealed-shipping.v2",
        owner: "o",
        repo: "r",
        pr: 53,
        headRefOid: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        verdict: "PASS",
        sealedAt: "2026-11-08T00:00:00.000Z",
      }),
  },
]);
