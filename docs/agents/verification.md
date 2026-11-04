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
