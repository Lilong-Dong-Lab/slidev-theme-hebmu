# Babysit: watch-pr without a global Bun

Agents babysitting PRs in this repo must not depend on a machine-wide `bun`
install. The pstack `watch-pr` entrypoint uses `#!/usr/bin/env bun`, so a bare
run fails when Bun is missing (`env: bun: No such file or directory`).

## Preferred invocation

From the theme repo root:

```bash
./scripts/watch-pr --owner Lilong-Dong-Lab --repo slidev-theme-hebmu --pr <n> --status-only --pretty
```

Or:

```bash
npm run watch-pr -- --owner Lilong-Dong-Lab --repo slidev-theme-hebmu --pr <n> --status-only --pretty
```

`scripts/watch-pr` resolves the poteto-mode watcher under `~/.cursor/skills/`
(or the pstack plugin cache) and runs it through `scripts/watch-pr-clearance.mjs`.
The enricher prefers `bun` when present, otherwise `npx -y bun` (ephemeral, no
global install). On READY **and** STATUS (`--status-only`) it attaches hebmu
review/protection clearance.

Override the watcher directory with `HEBMU_WATCH_PR_DIR` if your skills live
elsewhere.

## Wrapper boundary (blast radius)

Clearance is **hebmu-wrapper-only**. Upstream poteto-mode `watch-pr` does not
emit `reviewClearance` or `protection`. This theme does not vendor or patch
that upstream from the package.

| Path | Clearance |
| --- | --- |
| `./scripts/watch-pr` or `npm run watch-pr` from this repo | Attached on READY and STATUS |
| Personal `~/.cursor/skills/poteto-mode/scripts/watch-pr` (bare) | None |
| pstack plugin-cache `watch-pr` (bare) | None |
| Cursor built-in babysit skill that invokes upstream without this wrapper | None |

For this repo, treat a bare upstream READY/STATUS as CI-thread green only.
Read the hebmu clearance block (or `hebmu.clearance.v1` sidecar) before calling
a PR review-cleared. Decision record: `docs/adr/0002-hebmu-watch-pr-clearance-boundary.md`.

## Drive vs check

- One-shot status: add `--status-only` (emits STATUS; clearance still attaches).
- Poll until a terminal verdict (`READY`, and so on): omit `--status-only`.
- Human-readable text: add `--pretty`.

When the wrapper cannot run, measure merge-ready from `gh` mergeable / checks /
unresolved threads, say the watcher was skipped, and do not treat a missing
Bun runtime as a blocker. See the poteto-mode Babysit playbook.

## Land through `land-pr` (not bare `gh pr merge`)

Babysit observe (`./scripts/watch-pr` without `--assert-merge`) attaches
clearance and keeps the upstream exit. That exit is **not** merge clearance.
The wrapper also side-writes a local last-observe receipt under
`.git/hebmu/last-observe/` (`markersPresent` + tip when resolvable). Observe
exit stays upstream (READY → `0`) even when markers are absent. `land-pr`
refuses **before** assert when that receipt is missing, lacked clearance
markers, or the tip does not match — bare personal/plugin observe never
writes a receipt, so land fails closed on that soft lure. Shipping land is
seal-then-land: the verifier mints a tip-bound, HMAC-signed seal
(`HEBMU_SEAL_HMAC_KEY`), then the fail-closed helper always injects
`--assert-merge` and only then may call `gh pr merge`. Local JSON under
`.git/hebmu/sealed-shipping/` is a receipt on disk — it is not merge proof
unless the MAC verifies with the verifier key:

```bash
export HEBMU_SEAL_HMAC_KEY='…verifier-only material…'

npm run seal-shipping -- \
  --owner Lilong-Dong-Lab --repo slidev-theme-hebmu --pr <n> \
  --verdict PASS

npm run land-pr -- \
  --owner Lilong-Dong-Lab --repo slidev-theme-hebmu --pr <n>
```

Or:

```bash
export HEBMU_SEAL_HMAC_KEY='…verifier-only material…'
node scripts/seal-shipping.mjs --owner Lilong-Dong-Lab --repo slidev-theme-hebmu --pr <n> --verdict PASS
node scripts/land-pr.mjs --owner Lilong-Dong-Lab --repo slidev-theme-hebmu --pr <n>
```

Do not run bare `gh pr merge` after observe READY/STATUS. Do not treat
`./scripts/watch-pr --assert-merge && gh pr merge` as the land path either.
`land-pr` owns that sequence so disposition `2` / `3` cannot reach merge.
Do not pass `--shipping-verdict` (removed; land-pr rejects it).

On `ci-only`, assert (inside `land-pr`) exits `2` (`require-attestation`) until
a sealed PASS matches the live `headRefOid` (or you use emergency
`--merge-override`). Stale tip after new commits also exits `2` — re-seal.
Dry-run checks allow without merging:

```bash
npm run land-pr -- --owner Lilong-Dong-Lab --repo slidev-theme-hebmu --pr <n> \
  --dry-run
```

Disposition exits: `0` allow, `2` need attestation, `3` block
(`review-required` / `changes-requested` / `unknown` / rejected attestation).
Assert/land hard-fail with exit `4` (`missing-clearance`) when READY/STATUS
lacks hebmu clearance markers — bare personal/plugin READY cannot mint a
permit. Land also exits `4` with `hebmu-last-observe-*` details when the
last wrapper observe lacked markers or tip binding (assert skipped). A
sealed PASS does not clear `review-required`. Policy record:
`docs/adr/0003-ci-only-merge-policy.md`.

Proof without live `gh`:

```bash
# CI / land adversarial gate (#53) — sole PR-gate land-path check
npm run check:adversarial-land

# Unit tools for focused local debug (not the CI adversarial suite)
node scripts/watch-pr-clearance.mjs --self-test
npm run seal-shipping:self-test
npm run land-pr:self-test
```

## READY / STATUS is not review clearance

Upstream `READY` means CI-clean, no unresolved review threads, no merge
conflicts, and not `CHANGES_REQUESTED`. It does **not** require `APPROVED`.
`--status-only` emits `STATUS` (never READY), so agents that only copy the
documented check recipe never see a READY line.

On this repo `main` is unprotected (`gh …/protection` → 404), so verdicts are
often **CI-only green**. Babysit must read the hebmu clearance fields before
treating a PR as review-cleared.

### Pretty STATUS (hebmu-enriched, `--status-only`)

Upstream STATUS table stays. Clearance is appended under a namespaced header:

```text
| PR | CI | Review | Merge |
| --- | --- | --- | --- |
| [#35](https://github.com/Lilong-Dong-Lab/slidev-theme-hebmu/pull/35) | ✅ | ✅ | ✅ merged |
--- hebmu clearance ---
reviewClearance=ci-only
reviewClearanceReason=unprotected-base
protection=unprotected
```

### Pretty READY (hebmu-enriched)

Upstream READY lines stay. Clearance is appended the same way:

```text
READY: no merge conflicts, no unresolved review threads, no failing or pending checks
mergeStateStatus=CLEAN
reviewDecision=null
isDraft=false
--- hebmu clearance ---
reviewClearance=ci-only
reviewClearanceReason=unprotected-base
protection=unprotected
```

Upstream prints `reviewDecision=null` when GitHub has no decision (`gh` returns
`""`, normalized to null). Empty `reviewDecision=` is legacy; the enricher
treats both as null.

When approvals exist and GitHub reports `APPROVED`:

```text
--- hebmu clearance ---
reviewClearance=approved
protection=protected
protectionRequiredApprovals=1
```

`reviewClearance` values: `approved` | `review-required` | `changes-requested` |
`ci-only` (with `reviewClearanceReason` of `unprotected-base` or
`no-required-reviews`) | `unknown` (with `reviewClearanceDetail`).

On this repo's unprotected `main`, a live READY/STATUS prove usually hits only
`ci-only` / `unprotected-base`. The other discriminants are proven by the
recorded multi-class harness inside `--self-test` (mocked `gh` protection and
`reviewDecision`), not by ambient forge state.

### JSON READY / STATUS (sidecar)

Without `--pretty`, the upstream READY or STATUS JSON line is left unchanged.
A second NDJSON sidecar follows (`verdictKind` mirrors the upstream kind):

```json
{"schema":"hebmu.clearance.v1","pr":42,"verdictKind":"STATUS","clearance":{"kind":"ci-only","reason":"unprotected-base"},"protection":{"kind":"unprotected"},"signals":{"reviewDecision":null,"baseRefName":"main"}}
```

Parsers that only read line 1 keep working. Agents that need clearance read the
`hebmu.clearance.v1` line. Upstream `kind` / exit code are never rewritten.

### Self-check

```bash
node scripts/watch-pr-clearance.mjs --self-test
```

Self-test covers classify cases, STATUS/READY parse fixtures, the discriminant
harness (`approved`, `review-required`, `changes-requested`, both `ci-only`
reasons, and both `unknown` shapes), and the merge disposition matrix
(observe exit passthrough vs `--assert-merge` exits `0` / `2` / `3`).
