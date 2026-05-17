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

Prefix: `--hebmu-{name}`. Define in `:root`, override in `.dark`. Primary purple `#4E136C`, accent orange `#ED7D31`. Full color table in `@docs/specs.md`.

### Fonts

- **Sans**: `PingFang SC` → `Hiragino Sans GB` → `Microsoft YaHei` → `Noto Sans SC` → `system-ui` → `sans-serif`
- **Mono**: `Fira Code` → `SF Mono` → `Menlo` → `Monaco` → `monospace`
- Do NOT bundle font files — system fonts + fallback chain

### Chinese Typography (`styles/layout.css`)

- `line-height: 1.8` (CJK needs taller than Latin 1.5)
- `letter-spacing: 0.02em`
- Table `font-size: 0.82rem`, `border-collapse: collapse`

### Spacing

Slide padding: `px-14 py-10`. Section gaps: `gap-8`. Table cells: `py-2 px-3`.

## Layout & Component Specs

See `@docs/specs.md` for detailed prop tables, usage examples, and implementation notes for all 12 layouts and 10 components.

## Naming Conventions

- Layout files: kebab-case, matching layout name exactly (`figure-side.vue` → `layout: figure-side`)
- Component files: PascalCase (`BilingualTitle.vue` → `<BilingualTitle />`)
- CSS files: kebab-case (`layout.css`, `code.css`)
- CSS custom properties: `--hebmu-{name}` prefix
- Layout CSS classes: `.slidev-layout.{name}`

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

## User Context

The project author is a professor who also builds the tooling. They are a beginner with Slidev and Vue internals — when touching Vue components or Slidev layout mechanics, explain what's happening and why, and walk through the reasoning behind code changes.

## Conventions

See `@AGENTS.md` for coding style, commit conventions (Conventional Commits), PR guidelines, and testing practices.
