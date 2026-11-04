# Changelog

All notable changes to `slidev-theme-hebmu` are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
Pre-1.0, breaking changes bump the minor version. This package is not published
to npm — consumer decks install it via a `file:` path or git, so a release here
is the version bump plus these notes.

## [0.3.0] - 2026-11-04

First documented release. 0.2.1 shipped breaking changes without release notes;
this section covers everything since 0.2.0. Decisions were recorded in issues
#7, #8, and #11; the release is cut in #6.

### Changed

- **Breaking: Slidev 52 required.** `engines` and `peerDependencies` now
  require `@slidev/cli` `>=52.0.0 <53.0.0` (was `slidev >=0.48.0` with no peer
  range). The Node.js floor is unchanged (`>=20.12.0`).
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
  markers, it renders the all-equal overview. An explicit `active` prop always
  wins over inference (#7).
  *Migration:* none — this restores the 0.2.0-documented behavior. Known
  edge: `active: 0` is still open (#10).
- Theme-owned images resolve under `file:` installs. Theme `public/` assets
  are bundled as hashed URLs through a self-registering Vite glob, so
  `/hebmu-logo.png`, `/campus-cover.jpeg`, and `figureUrl` images no longer
  404 in consumer decks (#4).
