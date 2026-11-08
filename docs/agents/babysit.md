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

## Drive vs check

- One-shot status: add `--status-only` (emits STATUS; clearance still attaches).
- Poll until a terminal verdict (`READY`, and so on): omit `--status-only`.
- Human-readable text: add `--pretty`.

When the wrapper cannot run, measure merge-ready from `gh` mergeable / checks /
unresolved threads, say the watcher was skipped, and do not treat a missing
Bun runtime as a blocker. See the poteto-mode Babysit playbook.

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
reviewDecision=
isDraft=false
--- hebmu clearance ---
reviewClearance=ci-only
reviewClearanceReason=unprotected-base
protection=unprotected
```

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
