# Ci-only clearance requires attestation on the merge assert path

Hebmu clearance classifies READY/STATUS as `ci-only` on unprotected `main`,
but the enricher used to return upstream `exitCode` unchanged. Exit-code
consumers that ignore the clearance sidecar treated CI-only green as merge
clearance (issue #40). Product policy is **require-human**: ci-only may merge
only after an intentional attestation (Shipping VERDICT PASS or an explicit
override). The machine outcome for a missing attestation is
`require-attestation` (exit 2), not a silent warn and not a permanent block.

The gate lives behind `--assert-merge`. The default observe path
(`./scripts/watch-pr` without that flag) still returns upstream exit so
babysit can settle on READY. Remapping READY on observe would break that stop
condition. Warn-only leaves exit 0 and fails #40. Hard-blocking ci-only with
no attestation breaks the author Shipping workflow on this unprotected main.

**Consequence**: Agents must land through `npm run land-pr` /
`node scripts/land-pr.mjs` (issue #46). That helper always runs
`./scripts/watch-pr --assert-merge` (and accepts `--shipping-verdict PASS`
when clearance is ci-only) and fails closed on disposition exit `2` / `3`
before `gh pr merge`. Do not call bare `gh pr merge` after observe READY.
READY exit 0 is never merge clearance. Policy lives in
`scripts/merge-policy.mjs`; land orchestration lives in
`scripts/land-pr.mjs`; see `docs/agents/babysit.md`.
