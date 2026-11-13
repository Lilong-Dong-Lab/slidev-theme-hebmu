# Changelog

All notable changes to `slidev-theme-hebmu` are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
Pre-1.0, breaking changes bump the minor version. This package is not published
to npm — consumer decks install it via a `file:` path or git, so a release here
is the version bump plus these notes.

## [0.6.2] - 2026-11-14

### Added

- **`check:styles` enforces the pd-diagram single-scale-knob contract (#80)**:
  `npm run check:styles` fails when any `.hebmu-pd-*` role other than
  `.hebmu-pd-frame` declares `font-size` (the arrow is exempt — decorative
  typography, not a scaled cell role), since a direct declaration would beat
  inheritance and silently revert deck-side dense overrides. Wired into CI
  next to `check:dist`. 

### Fixed

- **`tag`/`hint`/`group-label` scale with their frame**: the three roles
  re-declared `font-size` (20px/20px/17px), which beat frame inheritance and
  pinned dense tables' captions to the default size. The declarations are
  removed; the roles now inherit the frame's declaration like
  `idx`/`head`/`cell` (fixed in #78 for the cell roles). `check:styles`
  gates the contract in CI from now on.

## [0.6.1] - 2026-11-13

### Fixed

- **PdDiagram dense scales now reach the cells**: `idx`/`head`/`cell` no
  longer re-declare `font-size: 20px`, which beat deck-side frame-level
  overrides by inheritance rules, so dense tables rendered at default size
  and overflowed their columns. The frame keeps its 20px declaration, so
  the unclassed default look is unchanged and the frame is the single
  scale knob.

## [0.6.0] - 2026-11-12

### Added

- **`hebmu-pd-*` PdDiagram CSS component** (`styles/pd-diagram.css`): the
  pandas brick-diagram roles (pair container, column, tag, hint, arrow, frame,
  group label, idx/head/cell) move into the theme, so deck authors stop
  copy-pasting per-deck style blocks. Defaults follow the ch09 `pd-diagram`
  variant (2.9rem cells, 20px, 5px radius); dense decks override grid
  templates and sizes deck-side. Documented in `docs/specs.md` under
  `### PdDiagram`.

## [Unreleased]

### Added

- Three repo checks born from the 0.4.0 retro (see `docs/agents/verification.md`):
  `check:surface` (stale-reference sweep — run at removal-scope time and before
  review), `check:release` (package version must equal the newest CHANGELOG
  heading; wired into CI), and `check:specs` (specs↔props drift; wired into
  CI). `check:specs`'s first run caught five undocumented props
  (`endBackgroundUrl`, `imageUrl`, KeynoteShell's hide/`layoutClass` wiring,
  SlideTitle's `title`/`autoTitle`), now documented in `docs/specs.md`.

## [0.5.0] - 2026-11-06

### Changed

- **Breaking: `hideFrame` defaults to `true`.** The purple stage rectangle is
  off unless a slide sets `hideFrame: false`. Waves still mark the stage.
  *Migration:* add `hideFrame: false` on any slide that must keep the framed
  border. Decks that already set `hideFrame: true` need no change.
- Editorial Keynote chrome on the 1024×768 canvas: `--hebmu-fs-*` type scale,
  quieter footer/wave accents, softer optional frame
  (`--hebmu-frame-width` / `--hebmu-frame-color`), and framed insets that clear
  the wave ribbons while sitting closer to the left and right edges.
- Table zebra no longer uses `--hebmu-row-a`. Odd rows mix `--hebmu-row-b` with
  `--hebmu-bg`; `--hebmu-row-a` is removed.

### Fixed

- Muted SVG waves honor `--hebmu-header-bg` (inline gradient fill no longer
  overrides the CSS token).
- Compact-density default lists use `var(--hebmu-fs-body)` instead of a hard-coded
  `20px`.
- `CLAUDE.md` token and stage-padding numbers match `styles/layout.css`.

## [0.4.0] - 2026-11-04

### Removed

- **Breaking: `intro` layout and `SessionInfo` component.** Zero uses across
  all 8 production decks (323 slides); decks express sessions via the `cover`
  layout's `sessionNumber` prop instead.
  *Migration:* replace `layout: intro` with `layout: default`; drop any
  `<SessionInfo />` usage.
- **Breaking: `Footnotes` / `Footnote` components**, figure's
  `footnoteFlow` and `figureFootnoteNumber` props, and their CSS. Zero deck
  uses; example-only since the initial port from `slidev-theme-academic`.
  *Migration:* build footnotes from `default` + raw markup if ever needed.
- **Breaking: `footerMode: 'full'`** (author/email/WeChat contact row in the
  chrome footer). All 8 decks and the example use `compact`; `none` remains
  available. The `footerAuthor` / `footerEmail` / `footerWechat` / `footerTel`
  themeConfig keys stay — the `end` layout's contact block reads them.
  *Migration:* none needed for `compact` decks; `'full'` users get the compact
  footer. See ADR-0001 for the removal criteria.

### Added

- `hebmu-callout-success` (green, `--hebmu-success`) and
  `hebmu-callout-danger` (dark red, new token `--hebmu-danger: #c00000`)
  callout variants, matching the Office-family palette. They replace the
  hand-rolled `bg-green-50`/`bg-red-50` utility divs used in production decks.

### Fixed

- TOC: an out-of-range `active` (0, negative, non-integer, or past the last
  item) now logs a one-time dev-mode warning and renders as if unset, instead
  of a silent all-grey list with no highlight and no diagnostic (#10).
- Theme images ship once per consumer build: assets moved from `public/` to a
  non-public `assets/` dir, so Slidev's static-copy no longer duplicates the
  hashed bundled copies (was 2–4 copies per image, ~1.75 MB dead weight per
  deck build). Asset URLs (`/name.ext`) are unchanged (#13).

## [0.3.0] - 2026-11-04

First documented release. 0.2.1 shipped breaking changes without release notes;
this section covers everything since 0.2.0. Decisions were recorded in issues
#7, #8, and #11; the release is cut in #6.

### Changed

- **Breaking: Slidev 52 required.** `engines` (`slidev`) and
  `peerDependencies` (`@slidev/cli`) now require `>=52.0.0 <53.0.0` (was
  engines `slidev >=0.48.0` with no peer range). The Node.js floor is
  unchanged (`>=20.12.0`).
  *Migration:* in each deck, upgrade `@slidev/cli` to `^52` and re-run
  `npm install`. Decks still on Slidev 48–51 are out of contract.
- The `paginationPagesDisabled` default is `[1]`: the cover slide ships
  without a page number. A deck-level value replaces the theme default
  wholesale (no merging); pass `[]` to number every slide. The docs previously
  listed the default as `undefined` — the spec was corrected to match the
  shipped behavior, and the default was kept by decision (#8).
  *Migration:* none, unless your cover must show a page number — set
  `paginationPagesDisabled: []` in `themeConfig`.
- The table-of-contents `contentTitle` default is `目录 | Contents` (was
  `目录 | CONTENT`). The mixed-case string is the intended Keynote-style
  visual, kept by decision (#11).
  *Migration:* none; pass `contentTitle` to override the heading.

### Removed

- **Breaking: the `BilingualTitle` component.** It was documented public API
  at 0.2.0 and was deleted without a note.
  *Migration:* use the layouts' built-in bilingual titles — slide H1/H2, the
  `slideTitle` prop, or on `section` slides `sectionTitle` + `sectionTitleEn`.
  There is no separate component (see `docs/specs.md`, section layout).

### Fixed

- TOC section inference is restored. A bare `layout: table-of-contents` slide
  infers the active section again: it highlights the section containing the
  current page. Before the first section, or in a deck with no `section`
  markers, it renders the all-equal overview. An explicit in-range `active`
  prop always wins over inference (#7).
  *Migration:* none — this restores the 0.2.0-documented behavior. Known
  edge: `active: 0` is still open (#10).
- Theme-owned images resolve under `file:` installs. Theme `public/` assets
  are bundled as hashed URLs through a self-registering Vite glob, so
  `/hebmu-logo.png`, `/campus-cover.jpeg`, and `figureUrl` images no longer
  404 in consumer decks (#4).
