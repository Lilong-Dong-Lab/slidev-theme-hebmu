# HEBMU theme verification map

This directory is the maintained source for verifying user-facing behavior of
`slidev-theme-hebmu` via the `example.md` preview deck. Read this index before
driving the app, then use the matching feature file as the recipe.

## Baseline preconditions

- Work from the theme repo root (`example.md` + `package.json` present).
- `npm install` has completed; `playwright-chromium` is available.
- Launch with `.cursor/skills/verify-hebmu/scripts/launch.sh` and keep
  `HEBMU_VERIFY_RUN_ID` / `HEBMU_VERIFY_ROOT` exported (or rely on the latest
  run pointer written by launch).
- Run `.cursor/skills/verify-hebmu/scripts/doctor.sh` and require exit 0.
- Never drive a Slidev instance this skill did not launch.
- Slide indices below refer to `example.md` on the current tip. Re-map if the
  deck order changes (see Gotchas on each feature).

## Driving conventions

- Start every recipe from a healthy doctor state unless preconditions say more.
- Prefer route paths (`/$n`) and CSS class handles listed in the skill over
  coordinates.
- Measure only the visible `.slidev-layout` (`getBoundingClientRect().height > 50`).
- Treat helper invocations as literal.
- Keep proof under `.cursor/skills/verify-hebmu/artifacts/proof/$RUN_ID/`.
- Cleanup stops the process; it must not delete that proof directory.

## Proof and skip reporting

- Capture the slide index (or build command) and the resulting metrics/check
  output, not only a final PNG.
- Geometry proof includes `metrics.json` fields and matching PNGs.
- Build proof includes exit codes and `check:dist` stdout.
- Report an unreachable path with the attempted slide and unmet precondition.
- Do not report a skipped entry point as verified through a different slide.

## Feature entry contract

Each feature file starts with an H1 and one paragraph. It then uses exactly four
H2 sections in this order: `Sub-features`, `How to get to it (user POV)`,
`Driving it with verify-hebmu`, `Gotchas`.

## Features

- [Keynote chrome geometry](./keynote-chrome.md) covers default and compact
  stage padding plus logo/title band alignment.
- [Cover layout](./cover.md) covers the opening branded cover slide.
- [Table of contents](./table-of-contents.md) covers overview and progress TOC.
- [Build asset bundling](./build-assets.md) covers `npm run build` + `check:dist`.
