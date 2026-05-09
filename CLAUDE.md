# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Slidev presentation theme for Hebei Medical University (河北医科大学) academic teaching. Chinese-first with bilingual (中/EN) support. Consumed by course projects via local path dependency in `package.json`.

- **Package**: `slidev-theme-hebmu` (Slidev resolves `theme: hebmu`)
- **Slidev**: >=0.48.0, `colorSchema: "both"` (light + dark)
- **Package manager**: bun
- **No tests**: Visual testing via `example.md` only

## Commands

```bash
bun install          # Install deps
bun run dev          # Preview with example.md (hot-reload, theme: ./)
bun run build        # Build
bun run export       # Export to PDF
```

## Design System

### Colors (CSS custom properties in `styles/layout.css`)

Prefix: `--hebmu-{name}`. Define in `:root`, override in `.dark`.

| Variable | Light | Dark | Purpose |
|---|---|---|---|
| `--hebmu-primary` | `#4E136C` | `#4E136C` | Dark purple — headers, table headers, emphasis |
| `--hebmu-primary-light` | `#621887` | `#621887` | Purple — accents, decorative elements |
| `--hebmu-accent` | `#ED7D31` | `#ED7D31` | Orange — callouts, highlights |
| `--hebmu-info` | `#4472C4` | `#4472C4` | Blue — links, info boxes |
| `--hebmu-success` | `#70AD47` | `#70AD47` | Green — success indicators |
| `--hebmu-warning` | `#FFC000` | `#FFC000` | Gold — warnings, badges |
| `--hebmu-bg` | `#ffffff` | `#121212` | Slide background |
| `--hebmu-text` | `#1a1a2e` | `#e5e7eb` | Body text |
| `--hebmu-text-muted` | `#535353` | `#9ca3af` | Secondary/caption text |
| `--hebmu-border` | `#DDDDDD` | `#374151` | Borders, dividers |

Colors extracted from Keynote lecture slides (PPTX theme XML). `accent1` = `#621887` purple primary.

### Fonts

- **Sans**: `PingFang SC` → `Hiragino Sans GB` → `Microsoft YaHei` → `Noto Sans SC` → `system-ui` → `sans-serif`
- **Mono**: `Fira Code` → `SF Mono` → `Menlo` → `Monaco` → `monospace`
- Weights: `h1` = 700, `h2` = 600, body = 400
- Do NOT bundle font files — system fonts + fallback chain

### Chinese Typography (`styles/layout.css`)

- `line-height: 1.8` (CJK needs taller than Latin 1.5)
- `letter-spacing: 0.02em`
- Table `font-size: 0.82rem`, `border-collapse: collapse`
- Port from: `@/Users/hugodong/Documents/AcademicWorkplace/01_TEACHING_PORTFOLIO/Course_Development/BIOINFO_Bioinformatics/lectures/styles/index.css`

### Spacing

- Slide padding: `px-14 py-10`
- Section gaps: `gap-8`
- Content blocks: `mt-4` to `mt-8`
- Table cells: `py-2 px-3`

## Layout & Component Specs

See @docs/specs.md for detailed prop tables, usage examples, and implementation notes for all 12 layouts and 7 components.

## Naming Conventions

- Layout files: kebab-case, matching layout name exactly (`figure-side.vue` → `layout: figure-side`)
- Component files: PascalCase (`BilingualTitle.vue` → `<BilingualTitle />`)
- CSS files: kebab-case (`layout.css`, `code.css`)
- CSS custom properties: `--hebmu-{name}` prefix
- Layout CSS classes: `.slidev-layout.{name}`

## Implementation Plan

**Status**: Implemented — 12 layouts, 7 components, styles and setup files complete. See @docs/specs.md for layout/component specs.

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
11. **CSS `@apply`**: Slidev uses UnoCSS (not Tailwind). `@apply` works with UnoCSS utilities.
12. **Dark mode**: `:root` for light, `.dark` selector for dark overrides.

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
