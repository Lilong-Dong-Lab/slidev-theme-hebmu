# Repository Guidelines

## Project Structure & Module Organization

This repository is a Slidev theme package named `slidev-theme-hebmu`; Slidev resolves it as `theme: hebmu`. Core files live at the repository root because Slidev auto-discovers them:

- `layouts/*.vue`: slide layouts, named to match `layout:` frontmatter such as `figure-side.vue`.
- `components/*.vue`: auto-registered Vue components, named in PascalCase for template use.
- `styles/index.ts` and `styles/*.css`: global entry point, layout styling, code styling, and Chinese typography.
- `setup/*.ts`: Slidev setup hooks for Mermaid and Shiki.
- `public/`: static assets available to slides.
- `example.md`: local preview and visual regression fixture.
- `docs/`: implementation notes and layout/component specs.

Generated output such as `dist/` and screenshots should not drive source changes unless updating visual references.

## Build, Test, and Development Commands

Use Bun for dependency management and scripts.

- `bun install`: install dependencies from `bun.lock`.
- `bun run dev`: run Slidev against `example.md` with hot reload and browser preview.
- `bun run build`: build the static Slidev output for `example.md`.
- `bun run export`: export the example deck to PDF.
- `bun run screenshot`: export the example deck as PNG slides for visual checks.

## Coding Style & Naming Conventions

Vue files use `<script setup lang="ts">`, two-space indentation, double quotes in TypeScript imports, and semicolons. Keep layout files in kebab-case and component files in PascalCase. CSS custom properties must use the `--hebmu-*` prefix and belong in `styles/layout.css` unless specific to code or Chinese typography. Prefer existing UnoCSS utilities and local components over new abstractions.

## Testing Guidelines

There is no automated unit test suite. Treat `example.md` as the primary integration fixture. Before handing off layout, component, or style changes, run `bun run build`; for visual changes, also run `bun run screenshot` and inspect representative cover, section, two-column, figure, code, and end slides.

## Commit & Pull Request Guidelines

Git history uses Conventional Commits, for example `feat: scaffold slidev-theme-hebmu project` and `fix: render named slots in two-col layout`. Keep commits focused and use `feat:`, `fix:`, or `docs:` where applicable.

Pull requests should include a short summary, commands run, and screenshots or exported PNGs for visual changes. Link related issues or course-material requests when available, and call out any changes to public layout props, component APIs, or `themeConfig` defaults.

## Agent-Specific Instructions

Do not bundle fonts; keep Chinese-first typography based on system font fallbacks. Preserve Slidev auto-registration conventions for `layouts/`, `components/`, `styles/index.ts`, `global-top.vue`, and `global-bottom.vue`.
