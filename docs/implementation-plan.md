# Implementation Plan

Detailed port/build instructions. Remove this file once all layouts, components, and styles are implemented.

## What to PORT from `slidev-theme-academic`

Source: `@/Users/hugodong/Documents/AcademicWorkplace/01_TEACHING_PORTFOLIO/Course_Development/BIOINFO_Bioinformatics/lectures/node_modules/slidev-theme-academic/`

- `components/Pagination.vue`, `Footnotes.vue`, `Footnote.vue`, `FigureWithOptionalCaption.vue`, `TextWithOptionalLink.vue`
- `layouts/cover.vue` (then add new props), `figure.vue`, `figure-side.vue`, `table-of-contents.vue`
- `global-top.vue`

## What to PORT from current project overrides

Source: `@/Users/hugodong/Documents/AcademicWorkplace/01_TEACHING_PORTFOLIO/Course_Development/BIOINFO_Bioinformatics/lectures/`

- `styles/index.css` → `styles/chinese.css` (CJK font stack, table styling, line-height)
- `setup/mermaid.ts` → `styles/mermaid.css` or `setup/mermaid.ts` (Mermaid theme: `primaryColor: '#dbeafe'`, `primaryBorderColor: '#1e40af'`, `lineColor: '#475569'`, `fontSize: '13px'`)

## What to BUILD NEW

`layouts/section.vue`, `break.vue`, `end.vue`, `quote.vue`, `two-col.vue`, `components/BilingualTitle.vue`, `SessionInfo.vue`, `styles/layout.css`, `styles/chinese.css`, `styles/code.css`, `uno.config.ts`, `setup/shiki.ts`

## Recommended implementation order

1. `styles/index.ts` + `styles/layout.css` (design system foundation)
2. `layouts/default.vue` + `layouts/center.vue` (simplest, most used)
3. `components/TextWithOptionalLink.vue` (dependency of cover)
4. `components/FigureWithOptionalCaption.vue` (dependency of figure layouts)
5. `layouts/cover.vue` (needs TextWithOptionalLink + layout-helper)
6. `layouts/section.vue` + `components/BilingualTitle.vue` (section system)
7. `layouts/figure.vue` + `layouts/figure-side.vue`
8. `layouts/table-of-contents.vue`
9. `components/Pagination.vue` + `global-top.vue` (pagination system)
10. `components/Footnotes.vue` + `components/Footnote.vue`
11. `layouts/two-col.vue` + `layouts/intro.vue` + `components/SessionInfo.vue`
12. `layouts/break.vue` + `layouts/end.vue` + `layouts/quote.vue`
13. `styles/chinese.css` + `styles/mermaid.css` + `styles/code.css`
14. `setup/shiki.ts` + `uno.config.ts`
15. `example.md` (full demo deck)

After step 6, the Ch10 deck should render correctly.
