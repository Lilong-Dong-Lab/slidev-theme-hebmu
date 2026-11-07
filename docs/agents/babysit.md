# Babysit: watch-pr without a global Bun

Agents babysitting PRs in this repo must not depend on a machine-wide `bun`
install. The pstack `watch-pr` entrypoint uses `#!/usr/bin/env bun`, so a bare
run fails when Bun is missing (`env: bun: No such file or directory`).

## Preferred invocation

From the theme repo root:

```bash
./scripts/watch-pr --owner Lilong-Dong-Lab --repo slidev-theme-hebmu --pr <n> --pretty
```

Or:

```bash
npm run watch-pr -- --owner Lilong-Dong-Lab --repo slidev-theme-hebmu --pr <n> --status-only --pretty
```

`scripts/watch-pr` resolves the poteto-mode watcher under `~/.cursor/skills/`
(or the pstack plugin cache) and runs it with `bun` when present, otherwise
`npx -y bun` (ephemeral, no global install).

Override the watcher directory with `HEBMU_WATCH_PR_DIR` if your skills live
elsewhere.

## Drive vs check

- One-shot status: add `--status-only`.
- Poll until a terminal verdict (`READY`, and so on): omit `--status-only`.
- Human-readable text: add `--pretty`.

When the wrapper cannot run, measure merge-ready from `gh` mergeable / checks /
unresolved threads, say the watcher was skipped, and do not treat a missing
Bun runtime as a blocker. See the poteto-mode Babysit playbook.

## Out of scope

Surfacing review or branch-protection detail inside READY output is a separate
backlog item (#31). This doc only covers how to launch the watcher.
