# Ci-only clearance requires check-run sealed attestation on assert

Hebmu clearance classifies READY/STATUS as `ci-only` on unprotected `main`,
but the enricher used to return upstream `exitCode` unchanged. Exit-code
consumers that ignore the clearance sidecar treated CI-only green as merge
clearance (issue #40). Product policy is **require-human**: ci-only may merge
only after a **check-run-bound Shipping attestation** for the live PR tip,
or an explicit emergency override. The machine outcome for a missing or
stale seal is `require-attestation` (exit 2). A sealed `FAIL`, a forged
provenance wire, or a demoted local mint is `attestation-rejected` (exit 3).

Honor-system `--shipping-verdict PASS` is removed (issue #47). Assert never
treats that flag as a valid attestation. Shared `HEBMU_SEAL_HMAC_KEY` (#52)
is retired. Issue #58 split mint/verify Ed25519 keys so land is verify-only,
but a stolen `HEBMU_SEAL_MINT_KEY` on the land host could still mint a
tip-matching local PASS that cleared ci-only. Issue #66 closes that residual.

**PASS seals** mint inside GitHub Actions (`seal-shipping` workflow,
`workflow_dispatch`). The job requests an Actions OIDC JWT (audience
`hebmu-seal`), writes `hebmu.sealed-shipping.v4` with
`mint: { kind: "check-run", jwt }`, creates check-run `hebmu-seal` on the
PR head SHA with `external_id = run_id`, and uploads the seal artifact.
The verifier CLI `npm run seal-shipping -- … --via-actions` dispatches,
downloads, self-verifies the JWT against GitHub JWKS, and places the wire
under `.git/hebmu/sealed-shipping/`. No host-held mint key is required for
the PASS allow path.

**Assert / land** load verify-only `HEBMU_SEAL_VERIFY_KEY` (still used for
legacy v3 decode) plus the Actions identity verifier. Allow on ci-only
requires `mint === "check-run"` ∧ live tip match ∧ live check-run evidence
(`hebmu-seal`, `external_id === runId`, `conclusion === success`,
`headSha === live tip`). Local Ed25519 v3 seals remain verifiable as
`mint: "local"` but policy demotes them — tip-matching local PASS is exit 3.
Unsigned, forged JWT, or wrong-key wires are null at `store.get`; provenance
`forged` maps to exit 3, undecodable/missing to exit 2.

**Residual (named honestly):** on this single-operator unprotected-main
repo, a compromised host that already holds the operator's full `gh` token
(which can `gh pr merge` today) can also `gh workflow run seal-shipping`.
That is the theoretical floor for merge power without a protected
environment on the seal workflow. Follow-ups: protected environment with
required reviewer on the seal workflow; local mint retirement once fixtures
no longer need the stolen-key positive control; optional JWKS fingerprint
pin.

The gate lives behind `--assert-merge`. The default observe path still
returns upstream exit so babysit can settle on READY. Observe never reads
seals. `--merge-override` is unchanged.

**Consequence**: Agents seal PASS with `--via-actions`, then land through
`npm run land-pr`. That helper always runs `./scripts/watch-pr --assert-merge`
and fails closed on disposition exit `2` / `3` before `gh pr merge`. Do not
pass `--shipping-verdict`. Do not call bare `gh pr merge` after observe READY.
Policy: `scripts/merge-policy.mjs`; identity: `scripts/check-run-crypto.mjs`;
seal CLI: `scripts/seal-shipping.mjs`; store: `scripts/attestation-store.mjs`;
land: `scripts/land-pr.mjs`; runbook: `docs/agents/babysit.md`.
