# Hebmu watch-pr clearance stays in the theme wrapper

Upstream poteto-mode `watch-pr` treats READY as CI-clean and thread-clean. It
does not report review or branch-protection clearance. On this repo `main` is
unprotected, so READY and STATUS often look merge-ready while
`reviewClearance` would be `ci-only`. Issues #31 and #36 closed that gap for
hebmu babysit by wrapping upstream in `scripts/watch-pr` →
`scripts/watch-pr-clearance.mjs`.

Issue #37 asks whether clearance should move into personal or plugin
`watch-pr` so non-hebmu runs get the same signal. This package cannot land that
change. The enricher is theme-owned, path-installed with the course decks, and
proven on READY and STATUS. Patching `~/.cursor/skills/` or the pstack plugin
cache from a theme PR would be an invisible personal patch, not a reviewable
artifact for this repo.

**Considered options**: port clearance into upstream poteto-mode / personal
`watch-pr` (rejected here); invent a shared pstack clearance hook (rejected
here); document the hebmu-wrapper boundary and name the remaining blast radius
(chosen). Rejection reason for the first two: they live outside this package's
ship boundary, and Laziness Protocol prefers a landable stopgap that names
what stays unfixed.

**Consequence**: Agents babysitting this repo must call `./scripts/watch-pr` or
`npm run watch-pr`. Bare personal or plugin `watch-pr`, and any babysit path
that skips the wrapper, still lack hebmu clearance. Upstream clearance remains
a separate follow-up outside this theme. See `docs/agents/babysit.md`.
