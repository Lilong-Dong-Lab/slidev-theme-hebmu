# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Slidev presentation theme for Hebei Medical University (河北医科大学) academic teaching. Chinese-first with bilingual (中/EN) support. Local course repos install it with a `file:` path dependency (see Consumer Usage). Theme authors preview with `theme: ./` or a symlink under `node_modules/slidev-theme-hebmu`. CI may instead install from git.

- **Package**: `slidev-theme-hebmu` (Slidev resolves `theme: hebmu`)
- **Slidev**: >=52.0.0 <53.0.0 (`peerDependencies.@slidev/cli`), `colorSchema: "light"`, 4:3 aspect ratio, 1024px canvas width
- **Package manager**: npm (lockfile: package-lock.json; bun removed 2026-09-20)
- **No tests**: Visual testing via `example.md` only — follow `docs/agents/verification.md` when verifying changes against a running deck or checking build artifacts

## Commands

```bash
npm install          # Install deps
npm run dev          # Preview with example.md (hot-reload, theme: ./)
npm run build        # Build
npm run export       # Export to PDF
npm run screenshot   # Export to PNG
```

## Design System

### Colors (CSS custom properties in `styles/layout.css`)

Prefix: `--hebmu-{name}`. All defined in `:root` in `styles/layout.css`. **Light-only — dark mode (`.dark`) is NOT implemented in this release.**

| Variable | Value | Purpose |
|---|---|---|
| `--hebmu-primary` | `#4e136c` | Dark purple — headings, chrome, table headers, frame |
| `--hebmu-primary-light` | `#621887` | Table headers, footer text, TOC accents |
| `--hebmu-purple-soft` | `#8f55ad` | SVG wave accent ribbons |
| `--hebmu-accent` | `#ed7d31` | Orange — blockquote bar, highlights |
| `--hebmu-info` | `#0563c1` | Blue — links |
| `--hebmu-success` | `#70ad47` | Green |
| `--hebmu-warning` | `#ffc000` | Gold |
| `--hebmu-danger` | `#c00000` | Dark red — danger callout variant (added 0.4.0) |
| `--hebmu-bg` | `#ffffff` | Slide background |
| `--hebmu-header-bg` | `#f2f2f2` | Header band / muted wave fill |
| `--hebmu-row-a` / `--hebmu-row-b` | `#ebe7ef` / `#f5f3f7` | Table zebra rows |
| `--hebmu-text` | `#202020` | Body text |
| `--hebmu-text-muted` | `#666666` | Secondary/caption text |
| `--hebmu-border` | `#621887` | Framed-stage border (purple, 2px) |

Colors extracted from the Keynote lecture slides' PPTX theme XML; the source file is gone, so treat the palette as complete as of 0.4.0 — new tokens must match the Office-family accents (`#ed7d31` orange, `#ffc000` gold, `#70ad47` green, `#0563c1` blue, `#c00000` red). `accent1` = `#621887` purple primary.

### Fonts

- **Sans**: `PingFang SC` → `Noto Sans SC` → `Microsoft YaHei` → `Hiragino Sans GB` → `Arial` → `system-ui` → `sans-serif`
- **Mono**: `Fira Code` → `SF Mono` → `Menlo` → `Monaco` → `monospace`
- Weights: `h1`/`h2`/`h3` = 700, body = 400
- Do NOT bundle font files — system fonts + fallback chain

### Chinese Typography (`styles/layout.css`)

- Base body `line-height: 1.5`, `letter-spacing: 0` (on `.slidev-layout`)
- Table `font-size: 0.875em`, `border-collapse: collapse`; all text uses `text-wrap: balance` + `overflow-wrap: anywhere` (CJK-safe)

### Spacing

- Keynote stage padding: `178px 56px 100px` (compact density: `166px 50px 92px`)
- Block vertical rhythm: `margin-top: 16px` (compact: `10px`)
- Table cells: `0.5em 1em` (compact: `0.35em 0.75em`)
- Theme CSS is hand-written (`styles/layout.css`), not UnoCSS utilities. Add styles here, not as utility classes in markdown.

## Keynote Frame Architecture

The theme's look is a "Keynote"-style chrome rendered inside each layout — **not** via global injection. `global-top.vue` / `global-bottom.vue` are empty.

- **`KeynoteShell`** — internal wrapper every framed layout uses. Renders `.slidev-layout.keynote-layout` + `KeynoteChrome` + a framed `<main class="keynote-stage">` slot. Carries `density: 'normal'|'compact'` and the `hide*` props.
- **`KeynoteChrome`** — persistent per-slide UI: inline SVG wave header, logo, footer (`compact`/`none`), `<Pagination />`. Reads everything from `$slidev.themeConfigs`.
- **`.keynote-stage`** — content pane whose `::before` pseudo-element draws the 2px purple rounded frame; `.is-unframed` removes it.
- **`SlideTitle`** — hoists the slide's first `<h1>` text into the chrome title and hides that H1 from the stage. An explicit `slideTitle` prop overrides; `autoSlideTitle: false` disables.
- **`layout-helper.ts`** — two asset resolvers backed by one self-registering `import.meta.glob` of `assets/**/*` (`?url` bundles every theme image, so `file:` installs never hit `/theme/...` paths; the dir is non-public on purpose — a `public/` dir makes Slidev's static-copy duplicate every image). `resolveAssetUrl()` is for theme-owned assets; `resolveUrl()` is for user-supplied figures. Either resolves both kinds (bundled map first, deck `public/` root second).

Shiki theme: `one-dark-pro` (dark) / `vitesse-light` (light). Mermaid look (box color, type, gray arrows) is in `setup/mermaid.ts`, including the `.hebmuRoot` / `.hebmuPill` / `.hebmuNote` hooks. Mermaid layout questions — curve, spacing, or where an arrow meets a node — go to @docs/specs.md (Mermaid). `setup/unocss.ts` is the theme-side UnoCSS escape hatch — its default-export **function** returns a config (presetWind3 + attributify + icons) that Slidev auto-merges, so consumer decks get utility classes for one-off custom slides.

## Layout & Component Specs

See @docs/specs.md for detailed prop tables, usage examples, and implementation notes for every layout and component.

## Naming Conventions

- Layout files: kebab-case, matching layout name exactly (`figure.vue` → `layout: figure`)
- Component files: PascalCase (`Pagination.vue` → `<Pagination />`)
- CSS files: kebab-case (`layout.css`, `code.css`)
- CSS custom properties: `--hebmu-{name}` prefix
- Layout CSS classes: `.slidev-layout.{name}`

## Status

Implemented. Run `npm run dev` to preview `example.md`. Code highlighting lives in `setup/shiki.ts`, Mermaid in `setup/mermaid.ts`, the UnoCSS escape hatch in `setup/unocss.ts`. `docs/specs.md` is the spec-of-record for layout/component props and stage classes.

## Slidev Theme Authoring Gotchas

1. **Theme name resolution**: Package named `slidev-theme-{name}`. Frontmatter uses `theme: {name}` (no prefix). Local preview: `theme: ./` in `example.md`.
2. **Auto-registration**: `layouts/` and `components/` are auto-registered. No manual imports. Filenames = layout/component names.
3. **`styles/index.ts`**: Must exist exactly as `index.ts`. Slidev auto-imports it. Import `@slidev/client/styles/layouts-base.css` first.
4. **`global-top.vue` / `global-bottom.vue`**: Injected into every slide. Keep logic minimal.
5. **`themeConfig`**: Arbitrary frontmatter keys → `$slidev.themeConfigs` in Vue.
6. **Props in markdown**: Passed via frontmatter, defined in layout's `defineProps<T>()`.
7. **Default merging**: `package.json` `slidev.defaults` merges with user frontmatter. User values win.
8. **Local path deps**: Consuming projects may need `npm install` after theme changes. HMR works during dev without reinstall.
9. **Chinese fonts**: System fonts only. Do NOT bundle font files.
10. **No `prebuild.js`**: Not published to npm, no distribution build needed.
11. **CSS approach**: The theme's look is hand-written plain CSS in `styles/layout.css`/`code.css`. A `setup/unocss.ts` escape hatch (default-export **function**) auto-provides utility classes (grid/flex/gap) to consumer decks for one-off custom slides — there is no `uno.config.ts` at theme root. Don't use `@apply` inside the theme.
12. **Dark mode**: Light-only. `:root` tokens only; `.dark` overrides are not implemented. Do not assume dark variants.

## Consumer Usage

Course projects reference via `file:` path dependency:

```json
{ "dependencies": { "slidev-theme-hebmu": "file:../../../Teaching_Resources/Template_Lectures/slidev-theme-hebmu" } }
```

Frontmatter:
```yaml
theme: hebmu
fonts:
  sans: 'PingFang SC'
  mono: 'Fira Code'
themeConfig:
  paginationX: 'r'
  paginationY: 'b'
  paginationPagesDisabled: [1]
defaults:
  layout: default
htmlAttrs:
  lang: zh-CN
```

## Agent skills

### Issue tracker

Issues live in this repo's GitHub Issues (Lilong-Dong-Lab/slidev-theme-hebmu), managed with the gh CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default five-role vocabulary: needs-triage, needs-info, ready-for-agent, ready-for-human, wontfix. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: GLOSSARY.md at the repo root, ADRs in docs/adr/. See `docs/agents/domain.md`.
