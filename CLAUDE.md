# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Slidev presentation theme for Hebei Medical University (河北医科大学) academic teaching. Chinese-first with bilingual (中/EN) support. Consumed by course projects via local path dependency in `package.json`.

- **Package**: `slidev-theme-hebmu` (Slidev resolves `theme: hebmu`)
- **Slidev**: >=0.48.0, `colorSchema: "light"`, 4:3 aspect ratio, 1024px canvas width
- **Package manager**: bun
- **No tests**: Visual testing via `example.md` only

## Commands

```bash
bun install          # Install deps
bun run dev          # Preview with example.md (hot-reload, theme: ./)
bun run build        # Build
bun run export       # Export to PDF
bun run screenshot   # Export to PNG
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
| `--hebmu-bg` | `#ffffff` | Slide background |
| `--hebmu-header-bg` | `#f2f2f2` | Header band / muted wave fill |
| `--hebmu-row-a` / `--hebmu-row-b` | `#ebe7ef` / `#f5f3f7` | Table zebra rows |
| `--hebmu-text` | `#202020` | Body text |
| `--hebmu-text-muted` | `#666666` | Secondary/caption text |
| `--hebmu-border` | `#621887` | Framed-stage border (purple, 2px) |

Colors extracted from Keynote lecture slides (PPTX theme XML). `accent1` = `#621887` purple primary.

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
- **`KeynoteChrome`** — persistent per-slide UI: inline SVG wave header, logo, footer (`compact`/`full`/`none`), `<Pagination />`. Reads everything from `$slidev.themeConfigs`.
- **`.keynote-stage`** — content pane whose `::before` pseudo-element draws the 2px purple rounded frame; `.is-unframed` removes it.
- **`SlideTitle`** — hoists the slide's first `<h1>` text into the chrome title and hides that H1 from the stage. An explicit `slideTitle` prop overrides; `autoSlideTitle: false` disables.
- **`layout-helper.ts`** — two asset resolvers: `resolveAssetUrl()` adds a `/theme/` prefix (for the theme's own `public/` assets — Slidev-52 static-copy fix); `resolveUrl()` does not (for user-supplied figures). Pick the right one.

Shiki theme: `one-dark-pro` (dark) / `vitesse-light` (light). Mermaid is deeply themed in `setup/mermaid.ts` (purple nodes, `themeCSS` with `.hebmuRoot`/`.hebmuPill`/`.hebmuNote` class hooks). `setup/unocss.ts` is the theme-side UnoCSS escape hatch — its default-export **function** returns a config (presetWind3 + attributify + icons) that Slidev auto-merges, so consumer decks get utility classes for one-off custom slides.

## Layout & Component Specs

See @docs/specs.md for detailed prop tables, usage examples, and implementation notes for all 8 layouts and 10 components.

## Naming Conventions

- Layout files: kebab-case, matching layout name exactly (`figure.vue` → `layout: figure`)
- Component files: PascalCase (`BilingualTitle.vue` → `<BilingualTitle />`)
- CSS files: kebab-case (`layout.css`, `code.css`)
- CSS custom properties: `--hebmu-{name}` prefix
- Layout CSS classes: `.slidev-layout.{name}`

## Implementation Plan

**Status**: Implemented — 8 layouts, 10 components, styles and setup files complete. Code highlighting in `setup/shiki.ts`, Mermaid in `setup/mermaid.ts`, UnoCSS escape hatch in `setup/unocss.ts`. See @docs/specs.md for layout/component specs.

All layouts, components, and styles have been ported or built. Run `bun run dev` to preview.

## Slidev Theme Authoring Gotchas

1. **Theme name resolution**: Package named `slidev-theme-{name}`. Frontmatter uses `theme: {name}` (no prefix). Local preview: `theme: ./` in `example.md`.
2. **Auto-registration**: `layouts/` and `components/` are auto-registered. No manual imports. Filenames = layout/component names.
3. **`styles/index.ts`**: Must exist exactly as `index.ts`. Slidev auto-imports it. Import `@slidev/client/styles/layouts-base.css` first.
4. **`global-top.vue` / `global-bottom.vue`**: Injected into every slide. Keep logic minimal.
5. **`themeConfig`**: Arbitrary frontmatter keys → `$slidev.themeConfigs` in Vue.
6. **Props in markdown**: Passed via frontmatter, defined in layout's `defineProps<T>()`.
7. **Default merging**: `package.json` `slidev.defaults` merges with user frontmatter. User values win.
8. **Local path deps**: Consuming projects may need `bun install` after theme changes. HMR works during dev without reinstall.
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
