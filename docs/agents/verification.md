# Visual verification playbook

No test suite exists. This playbook is the seam that replaces one: layout,
asset, and build changes are verified against a running deck and the build
artifacts, never by reading code alone. Run the sections in order after
implementing.

## Dev server

Start it detached with output to a file. Never pipe through `head` — the
pipe SIGPIPEs and kills the server while a stale port still answers 200.

```bash
npm run dev > /tmp/dev.log 2>&1 &
```

Read the port from the log; never assume 3030 — another deck's server may
already hold it (Slidev increments). Never probe a port blind: a 200 can
come from a different deck.

Completion criterion: the page title at your measurement URL names this
deck — `slidev-theme-hebmu 主题演示`. Wrong title = wrong server; stop and
re-read the log.

Kill it when done: `lsof -ti:<port> | xargs kill`.

## Live DOM checks

Measure computed styles and element boxes in the browser, scoped to the
visible layout — Slidev parks every slide's DOM in hidden layers:

```js
const layout = [...document.querySelectorAll(".slidev-layout")]
  .find((el) => el.getBoundingClientRect().height > 50);
```

Two disciplines:

- **Before/after**: capture the baseline before editing — same page, same
  selectors — and compare after. Identical dumps are the evidence; differing
  dumps are the diff to explain.
- **Whole-DOM sweep**: for image or presence checks, query the parked DOM
  once. Every `<img>` must report `naturalWidth > 0`.

**pd-diagram scale contract**: the dense font scale is declared on
`.hebmu-pd-frame` and reaches inner roles by inheritance. Never re-declare
`font-size` on inner roles (`.hebmu-pd-idx/-head/-cell/-tag/-hint/-group-label`);
a direct declaration beats inheritance and silently reverts deck-side dense
overrides to the default. When verifying any pd-diagram change, assert that
the computed font-size of **every** role a slide uses (tag, hint, and
group-label included) equals what its frame's declaration produces — not just
frame/head/cell.

For scale-dependent geometry (the TOC bow), convert with the layout's own
factor: `layoutRect.height / layout.offsetHeight`.

## Build-artifact sanity

`npm run build` exiting 0 proves nothing by itself — a broken
`import.meta.glob` (any pattern Vite cannot statically analyze, e.g. a
template literal) silently matches nothing and the build still passes.
After any build:

```bash
npm run check:dist
```

`scripts/check-dist.mjs` owns the expected manifest (one hashed copy per
theme image under `dist/assets/`, no root-level copies). A red check is a
finding; fix the bundling, not the check.

After touching `styles/pd-diagram.css`, run `npm run check:styles`. It
structurally enforces the single-scale-knob contract from the Live DOM
checks section: `font-size` may be declared only on `.hebmu-pd-frame` (the
decorative arrow is exempt). It is currently red on
`tag`/`hint`/`group-label` by design, until the follow-up scale fix removes
those declarations.

**Release gate before push**: a version bump is not a release until its
CHANGELOG entry exists. Run `npm run check:release` locally **before**
pushing — the repo's CI enforces it, and a red CI is the most expensive way
to learn the check exists.

**Style-contract gate**: after touching `styles/pd-diagram.css`, run
`npm run check:styles`. It enforces the single-scale-knob contract from the
Live DOM checks section (font-size only on `.hebmu-pd-frame`, plus the
decorative-arrow exemption) and fails with the offending selectors.

Run `npm run setup:hooks` once per clone to install the pre-push release
gate. It fires `check:release` only when the `package.json` version differs
from what `origin/main` (or, failing that, the newest tag) carries; pushes
at the pushed version are silent. Bypass with `git push --no-verify` — CI
still runs `check:release`, so bypassing never skips the enforcement, only
its timing.

## Surface sweep

Run when removing or renaming anything user-facing — at **scope time** (the
hits are the sync checklist: every file you must touch) and again **before
review** (every remaining hit must be intentional):

```bash
npm run check:surface -- <term> [term...]
```

Report-only by design: CHANGELOG entries and ADRs mention removed terms on
purpose, so the reviewer judges the hits. Catches what the 0.4.0 audit
missed — `end.vue` reading the footer keys, `README.md`, and
`styles/refinements.css` were each found only by a late ad-hoc grep.

## Known-benign console noise

`Failed to patch FloatingVue` comes from the shiki twoslash plugin inside
Slidev's own dev dependencies. It is pre-existing and unrelated to theme
changes. Any other console error is a finding until proven otherwise.
