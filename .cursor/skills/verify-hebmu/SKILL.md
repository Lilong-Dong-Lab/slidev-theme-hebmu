---
name: verify-hebmu
description: >-
  Drive the slidev-theme-hebmu example deck in a browser (Playwright) and prove
  Keynote chrome geometry, cover/TOC layouts, and build asset bundling. Use for
  Shipping verification of this theme, visual chrome/layout/CSS refactors,
  before declaring a visual change done, or whenever a verifier needs a
  scripted user-path proof — not only when a human names this skill.
---

# Verify HEBMU Slidev theme

Agent-facing. Cold-read this mid-task. The product under test is the theme
preview deck (`example.md`), not a consumer course deck.

## Surface

Primary surface is a **web Slidev deck** at 1024×768 (4:3) rendered in Chromium.
Users (lecturers) see layouts: cover, table-of-contents, default (Keynote chrome),
section, figure, break, end. Secondary surfaces are build artifacts under `dist/`
(`npm run build` + `npm run check:dist`) and PNG export (`npm run screenshot`).

## Launch

From the theme repo root (directory that contains `example.md` and `package.json`):

```bash
# one-time if node_modules is missing
npm install

RUN_ID="${RUN_ID:-$(date +%Y%m%d-%H%M%S)}"
export HEBMU_VERIFY_ROOT="$(pwd)"
export HEBMU_VERIFY_RUN_ID="$RUN_ID"
.cursor/skills/verify-hebmu/scripts/launch.sh
```

`launch.sh` picks a free TCP port, starts `npx slidev example.md --port <port>
--remote` detached (avoids package.json `dev --open`), writes run state under
`.cursor/skills/verify-hebmu/artifacts/runs/$RUN_ID/`, and waits until the page
title contains `slidev-theme-hebmu 主题演示`.

Ready means that title match, not merely HTTP 200 (another Slidev on another
port can also return 200).

Teardown:

```bash
.cursor/skills/verify-hebmu/scripts/cleanup.sh
```

Cleanup kills only the PID recorded for this `RUN_ID`. It does **not** delete
proof files under `.cursor/skills/verify-hebmu/artifacts/proof/`.

## Doctor

```bash
.cursor/skills/verify-hebmu/scripts/doctor.sh
```

Exit 0 only when all hold:

- Run state file exists for `HEBMU_VERIFY_RUN_ID` (or the latest run if unset)
- Recorded PID is alive
- Recorded port answers HTTP
- HTML `<title>` contains `slidev-theme-hebmu 主题演示`
- Recorded repo root still matches `pwd` of the theme (or `HEBMU_VERIFY_ROOT`)

Run doctor before any drive when anything looks off. Never drive a Slidev
instance this skill did not launch.

## Drive

Prefer the helpers. Do not click by coordinates.

Visible layout only. Slidev parks every slide's DOM; measure the layout whose
bounding box height is greater than 50:

```js
const layout = [...document.querySelectorAll(".slidev-layout")]
  .find((el) => el.getBoundingClientRect().height > 50);
```

Stable handles in this theme:

| Handle | Meaning |
|---|---|
| URL `/$n` | Slide index (1-based), same as `example.md` order |
| `.keynote-logo` | Chrome logo on KeynoteShell layouts |
| `.keynote-slide-title` | Chrome title band |
| `.keynote-stage` | Content stage (padding + optional frame) |
| `.keynote-cover` / `.cover-logo` | Cover layout (no `.keynote-stage`) |
| `.table-of-contents` / `.keynote-content-list` | TOC layout and numbered agenda list |

Geometry dump + optional PNG:

```bash
.cursor/skills/verify-hebmu/scripts/measure.sh 1 4 6
```

Writes JSON metrics and PNGs under
`.cursor/skills/verify-hebmu/artifacts/proof/$RUN_ID/`.

Build-path proof (no browser):

```bash
npm run build && npm run check:dist
```

Read the feature map under `features/` before claiming a layout is verified.
Drive the entry points listed there; do not substitute a different slide and
call it done.

## Evidence

Proof directory (survives cleanup):

`.cursor/skills/verify-hebmu/artifacts/proof/$RUN_ID/`

Minimum for a chrome/geometry claim:

- `metrics.json` from `measure.sh` (computed styles for stage padding, logo,
  title on the requested slides)
- PNG screenshots of those slides (`slide-$n.png`)
- Doctor stdout or exit 0 recorded in the agent reply

Minimum for a build/assets claim:

- `npm run build` exit 0
- `npm run check:dist` exit 0 and its stdout

Standards:

- Exercise the real deck path (`example.md` via `npm run dev` or `npm run build`)
- Capture action (which slide / which script) and resulting state (metrics or
  check output), not only a final screenshot
- Prove a CSS token by computed paint on the live element. Inline SVG
  `fill`/`stroke` that bypass `var(--token)` make the stylesheet token dead —
  treat that as a finding, not as proof the token is live
- Do not treat green CI alone as proof
- Benign console noise: `Failed to patch FloatingVue` from shiki twoslash is
  known and not a finding
- Exit 143 (SIGTERM) after intentional teardown of this run's recorded PID is
  success, not a failed proof

## Cleanup

```bash
.cursor/skills/verify-hebmu/scripts/cleanup.sh
```

Removes the run's process and may remove `artifacts/runs/$RUN_ID/`. Leaves
`artifacts/proof/` intact. When cleanup SIGTERMs the recorded PID, exit 143 is
expected success (see Evidence).

## Isolate

Two instances can run side by side when each uses its own `RUN_ID` and port
(`launch.sh` binds an ephemeral free port). Do not reuse another agent's port.
Do not kill by process name (`pkill slidev`); only the recorded PID.

## Helpers

All under `.cursor/skills/verify-hebmu/scripts/`:

| Script | Purpose |
|---|---|
| `launch.sh` | Start isolated `npm run dev`, write run state, wait for title |
| `doctor.sh` | Read-only health of the launched instance |
| `measure.sh <slide...>` | Playwright metrics + PNGs for slide indices |
| `cleanup.sh` | Stop the recorded PID; keep proof artifacts |

Invocation examples are in Launch / Doctor / Drive above.

## Feature map

Start at [features/README.md](features/README.md). Seeded features cover Keynote
chrome geometry, cover, table of contents, and build asset checks.
