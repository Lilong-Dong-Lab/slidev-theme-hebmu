# Ci-only clearance requires sealed attestation on the merge assert path

Hebmu clearance classifies READY/STATUS as `ci-only` on unprotected `main`,
but the enricher used to return upstream `exitCode` unchanged. Exit-code
consumers that ignore the clearance sidecar treated CI-only green as merge
clearance (issue #40). Product policy is **require-human**: ci-only may merge
only after a **sealed Shipping attestation** bound to the live PR
`headRefOid`, or an explicit emergency override. The machine outcome for a
missing or stale seal is `require-attestation` (exit 2), not a silent warn
and not a permanent block. A sealed `FAIL` is `attestation-rejected` (exit 3).

Honor-system `--shipping-verdict PASS` is removed (issue #47). Assert never
treats that flag as a valid attestation. Verifiers mint
`hebmu.sealed-shipping.v3` (required Ed25519 `sig` over tip-bound claims)
under `.git/hebmu/sealed-shipping/` via `npm run seal-shipping` with
`HEBMU_SEAL_MINT_KEY` (issue #58). Assert / land load **verify-only**
`HEBMU_SEAL_VERIFY_KEY`; mint material must not be present in the assert env
(`land-pr` scrubs it). Shared `HEBMU_SEAL_HMAC_KEY` (#52) is retired —
loaders reject it; a tip-matching v2 HMAC wire the lander alone could mint
is null at `store.get`. Unsigned, forged, or wrong-key wires yield null
(same as missing). Local JSON alone is not proof. Allow requires
verifier-bound PASS ∧ live `headRefOid` match (or `--merge-override`).
Stolen mint keys remain an accepted residual risk; remote check-run
identity is a named follow-up if mint must be forge-bound outside the
machine.

The gate lives behind `--assert-merge`. The default observe path
(`./scripts/watch-pr` without that flag) still returns upstream exit so
babysit can settle on READY. Remapping READY on observe would break that stop
condition. Warn-only leaves exit 0 and fails #40. Hard-blocking ci-only with
no attestation breaks the author Shipping workflow on this unprotected main.

**Consequence**: Agents must seal then land through `npm run land-pr` /
`node scripts/land-pr.mjs`. That helper always runs
`./scripts/watch-pr --assert-merge` and fails closed on disposition exit
`2` / `3` before `gh pr merge`. Do not pass `--shipping-verdict`. Do not call
bare `gh pr merge` after observe READY. READY exit 0 is never merge clearance.
Policy lives in `scripts/merge-policy.mjs`; seal write in
`scripts/seal-shipping.mjs`; store in `scripts/attestation-store.mjs`; land
orchestration in `scripts/land-pr.mjs`; see `docs/agents/babysit.md`.
