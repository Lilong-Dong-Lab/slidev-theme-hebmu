# CLAUDE.md — slidev-theme-hebmu

Handoff document for agents building this Slidev theme. Read this file in full before making any changes.

## 1. Project Identity

- **Name**: `slidev-theme-hebmu`
- **Purpose**: A Slidev presentation theme for Hebei Medical University (河北医科大学) academic teaching. Optimized for Chinese-first content with bilingual (中/EN) support.
- **Consumer pattern**: Course projects reference this theme via local path dependency in `package.json`
- **Slidev version**: >=0.48.0
- **Color schema**: both (light + dark)
- **Status**: v0.1.0 — scaffold phase. Layouts, components, and styles need implementation.

## 2. Directory Structure

```
slidev-theme-hebmu/
├── CLAUDE.md                 # This file — agent handoff guidelines
├── README.md                 # Human-facing theme documentation
├── LICENSE                   # MIT
├── package.json              # Theme identity + Slidev metadata
├── layout-helper.ts          # Utility: resolveAssetUrl(), handleBackground()
├── global-top.vue            # Global: renders Pagination on every slide
├── uno.config.ts             # UnoCSS shortcuts (to be created)
├── example.md                # Demo deck exercising all layouts/components
├── .gitignore
│
├── layouts/                  # Slide layouts — auto-registered by Slidev
│   ├── cover.vue             # Title slide with university branding
│   ├── section.vue           # Section divider (第X节)
│   ├── default.vue           # Standard content slide
│   ├── center.vue            # Centered emphasis content
│   ├── intro.vue             # Overview / course intro
│   ├── two-col.vue           # Two-column comparison
│   ├── figure.vue            # Full-slide figure + caption
│   ├── figure-side.vue       # Content + figure side-by-side
│   ├── table-of-contents.vue # Auto-generated TOC
│   ├── break.vue             # 10-minute break divider
│   ├── end.vue               # Thank you / Q&A
│   └── quote.vue             # Key definition / principle blockquote
│
├── components/               # Vue components — auto-registered by Slidev
│   ├── Pagination.vue        # Page numbering (current/total)
│   ├── Footnotes.vue         # Footnote container (parent)
│   ├── Footnote.vue          # Single footnote item (child)
│   ├── BilingualTitle.vue    # Chinese title + English subtitle pair
│   ├── SessionInfo.vue       # 学时 number + session progress
│   ├── FigureWithOptionalCaption.vue  # Reusable figure rendering
│   └── TextWithOptionalLink.vue       # Text with optional hyperlink
│
├── styles/
│   ├── index.ts              # Entry point — imports base CSS + custom files
│   ├── layout.css            # Core layout styles + CSS custom properties
│   ├── chinese.css           # CJK typography overrides
│   ├── mermaid.css           # Mermaid diagram theming
│   └── code.css              # Code block styling
│
├── setup/
│   └── shiki.ts              # Shiki syntax highlighting config
│
└── public/
    ├── logo-placeholder.svg  # University logo placeholder
    └── favicon.svg           # Favicon placeholder
```

### File naming rules
- Layout files: kebab-case, matching the layout name exactly (`figure-side.vue` → `layout: figure-side`)
- Component files: PascalCase (`BilingualTitle.vue` → `<BilingualTitle />`)
- CSS files: kebab-case (`chinese.css`, `mermaid.css`)
- CSS custom properties: `--hebmu-{name}` prefix
- Layout CSS classes: `.slidev-layout.{name}`

## 3. Design System

### 3.1 Colors (CSS Custom Properties)

Define in `styles/layout.css` as `:root` variables with `.dark` overrides:

| Variable | Light | Dark | Purpose |
|---|---|---|---|
| `--hebmu-primary` | `#1e40af` | `#1e40af` | Headers, accents, table headers |
| `--hebmu-primary-light` | `#3b82f6` | `#3b82f6` | Secondary accents, links, Mermaid nodes |
| `--hebmu-accent` | `#f59e0b` | `#f59e0b` | Callouts, highlights, emphasis |
| `--hebmu-bg` | `#ffffff` | `#121212` | Slide background |
| `--hebmu-text` | `#1a1a2e` | `#e5e7eb` | Body text |
| `--hebmu-muted` | `#6b7280` | `#9ca3af` | Secondary/caption text |
| `--hebmu-border` | `#e5e7eb` | `#374151` | Borders, dividers |

All colors are placeholders. When real university branding assets arrive, swap the hex values in `:root` only.

### 3.2 Fonts

- **Sans**: `PingFang SC` with fallbacks: `Hiragino Sans GB`, `Microsoft YaHei`, `Noto Sans SC`, `system-ui`, `sans-serif`
- **Mono**: `Fira Code` with fallbacks: `SF Mono`, `Menlo`, `Monaco`, `monospace`
- **Font weights**: `h1` = 700, `h2` = 600, body = 400
- Do not bundle font files — PingFang SC is a system font on macOS; on other platforms the fallback chain handles it.

### 3.3 Spacing

- Slide padding: `px-14 py-10` (standard Slidev)
- Section gaps: `gap-8`
- Content blocks: `mt-4` to `mt-8`
- Table cells: `py-2 px-3`

### 3.4 Chinese Typography Rules

Define in `styles/chinese.css`:

- `line-height: 1.8` (CJK needs taller line-height than Latin's 1.5)
- `letter-spacing: 0.02em`
- Table `font-size: 0.82rem` with `border-collapse: collapse`
- Font family cascade for CJK compatibility (see 3.2)

Port from the current course project override at:
`/Users/hugodong/Documents/AcademicWorkplace/01_TEACHING_PORTFOLIO/Course_Development/BIOINFO_Bioinformatics/lectures/styles/index.css`

### 3.5 Mermaid Diagram Theming

Define in `styles/mermaid.css` with CSS variable overrides:

Port from the current project's Mermaid setup at:
`/Users/hugodong/Documents/AcademicWorkplace/01_TEACHING_PORTFOLIO/Course_Development/BIOINFO_Bioinformatics/lectures/setup/mermaid.ts`

Key variables:
- `primaryColor: '#dbeafe'`
- `primaryBorderColor: '#1e40af'`
- `lineColor: '#475569'`
- `fontSize: '13px'`

### 3.6 Code Block Styling

Define in `styles/code.css`:
- Font: `Fira Code`, monospace
- Font size: `0.85rem`
- Border radius: `0.5rem`

## 4. Layout Specifications

Each layout is a Vue SFC in `layouts/`. Layouts are auto-registered — the filename (minus `.vue`) becomes the layout name used in markdown frontmatter (`layout: cover`).

Every layout must wrap content in `<div class="slidev-layout {layout-name}">` and use `<slot />` for markdown content.

### 4.1 cover

**Purpose**: Title slide with university branding, course info, and author.

**Props**:
| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `coverAuthor` | `string \| string[]` | `undefined` | Author name(s) |
| `coverAuthorUrl` | `string \| string[]` | `undefined` | Author link(s) |
| `coverBackgroundUrl` | `string` | `undefined` | Background image URL |
| `coverBackgroundSource` | `string` | `undefined` | Background image attribution text |
| `coverBackgroundSourceUrl` | `string` | `undefined` | Background image attribution link |
| `coverDate` | `string` | Auto | Date string |
| `courseName` | `string` | `undefined` | Course name in Chinese |
| `courseNameEn` | `string` | `undefined` | Course name in English |
| `sessionNumber` | `number` | `undefined` | 学时 number |

**Slot**: Title and subtitle content.

**Usage**:
```markdown
---
layout: cover
coverAuthor: '河北医科大学 · 生物信息学专业'
coverDate: '2026年春季学期'
courseName: '生物信息学'
sessionNumber: 18
---

# 第十章 生物分子网络分析
## Biomolecular Network Analysis
```

**Implementation notes**:
- Port from `slidev-theme-academic` `cover.vue`, adding `courseName`, `courseNameEn`, `sessionNumber` props
- Include a placeholder `<img>` for the university logo (top-right or bottom-left)
- Use `handleBackground` from `layout-helper.ts` for background images
- Supports multiple authors (array) with "and" joining

### 4.2 section

**Purpose**: Section divider with bilingual title and section numbering (第X节).

**Props**:
| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `sectionNumber` | `number` | `undefined` | Section number (renders "第X节") |
| `sectionTitle` | `string` | `undefined` | Chinese section title |
| `sectionTitleEn` | `string` | `undefined` | English section title |

**Slot**: Additional content below the title (optional).

**Usage**:
```markdown
---
layout: section
sectionNumber: 1
sectionTitle: 蛋白质-蛋白质相互作用
sectionTitleEn: Protein-Protein Interactions
---
```

**Implementation notes**:
- This is a NEW layout — no academic equivalent exists. The academic theme uses `intro` for section dividers.
- Large centered section number, bilingual title below
- Use `BilingualTitle` component for the title pair
- Thin horizontal accent line between number and title

### 4.3 default

**Purpose**: Standard content slide. The most-used layout (~31% of slides in production).

**Props**: None.

**Slot**: Full slide content.

**Usage**:
```markdown
---
layout: default
---

# 标题

正文内容...
```

**Implementation**: Minimal — `<div class="slidev-layout default"><slot /></div>`

### 4.4 center

**Purpose**: Vertically centered content for emphasis, key takeaways, or single statements.

**Props**: None.

**Slot**: Centered content.

**Usage**:
```markdown
---
layout: center
---

# 关键概念

无标度网络是生物分子网络的核心特征
```

**Implementation**: `<div class="slidev-layout center"><div class="my-auto"><slot /></div></div>`

### 4.5 intro

**Purpose**: Course/session overview slide. Displays course title and session information.

**Props**:
| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `courseTitle` | `string` | `undefined` | Course title |
| `sessionNumber` | `number` | `undefined` | Current session (学时) number |

**Slot**: Overview content (bullets, summary).

**Usage**:
```markdown
---
layout: intro
courseTitle: '生物信息学'
sessionNumber: 18
---

## 本节内容概览

- 蛋白质相互作用网络
- PPI 数据库
- 网络拓扑分析
```

**Implementation notes**:
- Port from academic `intro.vue`, adding `courseTitle` and `sessionNumber`
- Include `SessionInfo` component
- Centered content area with slightly larger fonts

### 4.6 two-col

**Purpose**: Two-column comparison layout. Common for comparing methods, tools, or before/after.

**Props**:
| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `cols` | `string` | `"2"` | CSS grid columns (e.g. `"2"`, `"3"`) |
| `gap` | `string` | `"8"` | Gap between columns (Tailwind units) |

**Slot**: Content with `<div>` separators for columns.

**Usage**:
```markdown
---
layout: two-col
---

# 有向网络 vs 无向网络

::left::
**有向网络 (Directed)**
- 边有方向性
- A→B ≠ B→A

::right::
**无向网络 (Undirected)**
- 边无方向性
- A—B = B—A
```

**Implementation notes**:
- This is a NEW layout. Use Slidev's built-in `::left::` / `::right::` slot syntax or CSS grid.
- `<div class="slidev-layout two-col"><div class="grid grid-cols-[var(--cols)] gap-[var(--gap)]"><slot /></div></div>`
- Alternatively, use named slots (`<slot name="left" />` / `<slot name="right" />`)

### 4.7 figure

**Purpose**: Full-slide image with optional caption and footnote.

**Props**:
| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `figureUrl` | `string` | required | Image URL |
| `figureCaption` | `string` | `undefined` | Caption text |
| `figureFootnoteNumber` | `number` | `undefined` | Footnote reference number |

**Usage**:
```markdown
---
layout: figure
figureUrl: /images/ppi-network.png
figureCaption: '蛋白质相互作用网络示例'
---
```

**Implementation**: Port directly from `slidev-theme-academic` `figure.vue`. Uses `FigureWithOptionalCaption` component.

### 4.8 figure-side

**Purpose**: Content + figure side-by-side.

**Props**:
| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `figureUrl` | `string` | required | Image URL |
| `figureCaption` | `string` | `undefined` | Caption text |
| `figureFootnoteNumber` | `number` | `undefined` | Footnote reference number |
| `figureX` | `'l' \| 'r'` | `'r'` | Figure position (left or right) |

**Usage**:
```markdown
---
layout: figure-side
figureUrl: /images/string-db.png
figureCaption: 'STRING 数据库界面'
figureX: r
---

## STRING 数据库

- 已知和预测的PPI
- 多种证据来源
```

**Implementation**: Port directly from `slidev-theme-academic` `figure-side.vue`.

### 4.9 table-of-contents

**Purpose**: Auto-generated table of contents from slide sections.

**Props**: None.

**Slot**: Custom heading content above the TOC (defaults to `<h1>目录 Table of Contents</h1>`).

**Usage**:
```markdown
---
layout: table-of-contents
---

## 本节内容
```

**Implementation**: Port from `slidev-theme-academic` `table-of-contents.vue`. Uses Slidev's built-in `<Toc />` component.

### 4.10 break

**Purpose**: Break divider between lecture halves (10-minute break). Reflects the session format: 40min lecture → 10min break → 40min lecture = 2 学时.

**Props**:
| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `breakMinutes` | `number` | `10` | Break duration in minutes |
| `showTimer` | `boolean` | `false` | Show countdown timer (stretch goal) |

**Usage**:
```markdown
---
layout: break
breakMinutes: 10
---
```

**Implementation notes**:
- This is a NEW layout.
- Large centered text: "休息 / Break" with duration below
- Optional timer component (stretch goal — can be a simple `<div>` initially)
- Subtle background pattern or color to visually separate from content slides

### 4.11 end

**Purpose**: Closing slide — thank you message and/or Q&A.

**Props**:
| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `endMessage` | `string` | `"谢谢！"` | Closing message in Chinese |
| `endMessageEn` | `string` | `"Thank You!"` | Closing message in English |

**Slot**: Additional content (contact info, QR code, etc.).

**Usage**:
```markdown
---
layout: end
endMessage: '谢谢！'
endMessageEn: 'Thank You!'
---
```

**Implementation notes**:
- This is a NEW layout.
- Large centered bilingual message
- University logo placeholder at bottom
- Optional slot for contact/QR

### 4.12 quote

**Purpose**: Key definition or principle in blockquote style. Used frequently in bioinformatics for definitions (e.g., scale-free networks, WGCNA).

**Props**:
| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `quoteSource` | `string` | `undefined` | Source attribution |
| `quoteAuthor` | `string` | `undefined` | Author attribution |

**Slot**: Quote content (markdown supported).

**Usage**:
```markdown
---
layout: quote
quoteAuthor: 'Barabási & Albert'
quoteSource: 'Science, 1999'
---

> **无标度网络 (Scale-free Network)**: 网络中度分布服从幂律分布 P(k) ~ k^(-γ)
```

**Implementation notes**:
- This is a NEW layout.
- Left border accent in `--hebmu-primary`
- Italic attribution text
- Larger font for the quote body

## 5. Component Specifications

Components are auto-registered — filenames become tag names in markdown. `Pagination.vue` → `<Pagination />`.

### 5.1 Pagination

**Purpose**: Page numbering (current / total) on every slide.

**Props**:
| Prop | Type | Values | Default | Description |
|------|------|--------|---------|-------------|
| `x` | `string` | `'l'`, `'r'` | `'r'` | Horizontal position |
| `y` | `string` | `'b'`, `'t'` | `'b'` | Vertical position |
| `classNames` | `string \| string[]` | — | `undefined` | Additional CSS classes |

**Behavior**: Uses Slidev's built-in `<SlideCurrentNo />` and `<SlidesTotal />`. Renders "X / Y" in a fixed position.

**ThemeConfig integration**:
- Global position set via `themeConfig.paginationX` and `themeConfig.paginationY` in frontmatter
- Disable per-page via `themeConfig.paginationPagesDisabled: [1, 5]`
- Disable globally by setting both paginationX and paginationY to `undefined`

**Source**: Port directly from `slidev-theme-academic` `Pagination.vue`.

### 5.2 Footnotes

**Purpose**: Container for multiple `Footnote` children.

**Props**:
| Prop | Type | Values | Default | Description |
|------|------|--------|---------|-------------|
| `filled` | `boolean` | — | `false` | Background fill |
| `separator` | `boolean` | — | `false` | Show separator line |
| `x` | `string` | `'l'`, `'r'` | `'r'` | Horizontal position |
| `y` | `string` | `'col'`, `'row'` | `'row'` | Layout direction |

**Source**: Port directly from `slidev-theme-academic` `Footnotes.vue`.

### 5.3 Footnote

**Purpose**: Individual footnote item. Must be a child of `Footnotes`.

**Props**:
| Prop | Type | Description |
|------|------|-------------|
| `number` | `number` | Footnote number (superscript) |

**Source**: Port directly from `slidev-theme-academic` `Footnote.vue`.

### 5.4 BilingualTitle

**Purpose**: Render a Chinese title + English subtitle pair. Used by `section` and `intro` layouts.

**Props**:
| Prop | Type | Description |
|------|------|-------------|
| `titleZh` | `string` | Chinese title (rendered as `<h2>`) |
| `titleEn` | `string` | English title (rendered as `<h3 class="opacity-60">`) |

**Implementation**: This is a NEW component.
```vue
<template>
  <div class="bilingual-title">
    <h2>{{ titleZh }}</h2>
    <h3 v-if="titleEn" class="opacity-60 text-sm mt-1">{{ titleEn }}</h3>
  </div>
</template>
```

### 5.5 SessionInfo

**Purpose**: Display current 学时 (session) number. Reflects the format: 1 session = 2×40min + 10min break = 2 学时.

**Props**:
| Prop | Type | Description |
|------|------|-------------|
| `sessionNumber` | `number` | Current session number |
| `totalSessions` | `number` | `undefined` | Total sessions (optional, for progress bar) |

**Implementation**: This is a NEW component.
```vue
<template>
  <div class="session-info text-xs opacity-50">
    <span>第 {{ sessionNumber }} 学时</span>
    <span v-if="totalSessions"> / {{ totalSessions }}</span>
  </div>
</template>
```

### 5.6 FigureWithOptionalCaption

**Purpose**: Reusable figure rendering with optional caption and footnote number.

**Props**:
| Prop | Type | Description |
|------|------|-------------|
| `figureUrl` | `string` | Image URL (resolved via `resolveAssetUrl`) |
| `figureCaption` | `string` | Optional caption |
| `figureFootnoteNumber` | `number` | Optional footnote reference |

**Source**: Port directly from `slidev-theme-academic` `FigureWithOptionalCaption.vue`.

### 5.7 TextWithOptionalLink

**Purpose**: Utility component — renders text with an optional hyperlink wrapper.

**Props**:
| Prop | Type | Description |
|------|------|-------------|
| `text` | `string` | Display text |
| `link` | `string` | Optional URL (wraps text in `<a>`) |

**Source**: Port directly from `slidev-theme-academic` `TextWithOptionalLink.vue`.

## 6. Development Workflow

### Setup
```bash
cd ~/Documents/AcademicWorkplace/01_TEACHING_PORTFOLIO/Teaching_Resources/Template_Lectures/slidev-theme-hebmu
bun install
```

### Preview (example.md)
```bash
bun run dev
```
This starts Slidev with `example.md` using `theme: ./` (self-referencing). Hot-reload works for all theme files (layouts, components, styles).

### Build
```bash
bun run build
```

### Export to PDF
```bash
bun run export
```

### Testing Strategy
There are no automated tests for Slidev themes. Use `example.md` as a visual test:
1. Every layout must have at least one slide in `example.md`
2. Every component must be used at least once in `example.md`
3. Manually verify: light mode, dark mode, Chinese rendering, Mermaid diagrams, code highlighting, tables
4. Check pagination appears on all slides except the first and any `paginationPagesDisabled` pages

## 7. How to Consume from Course Projects

### 7.1 In course project `package.json`

Replace `slidev-theme-academic` with the local path:

```json
{
  "dependencies": {
    "slidev-theme-hebmu": "file:../../../Teaching_Resources/Template_Lectures/slidev-theme-hebmu"
  }
}
```

Path calculation from course project to theme:
- Course: `Course_Development/BIOINFO_Bioinformatics/lectures/`
- Theme: `Teaching_Resources/Template_Lectures/slidev-theme-hebmu/`
- Relative: `../../../Teaching_Resources/Template_Lectures/slidev-theme-hebmu`

### 7.2 In slides.md frontmatter

```yaml
---
theme: hebmu          # Slidev resolves "hebmu" from "slidev-theme-hebmu"
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
---
```

### 7.3 Migration checklist

When switching a course project from `slidev-theme-academic` to `slidev-theme-hebmu`:
1. Update `package.json` dependency
2. Change `theme: academic` → `theme: hebmu` in all slide markdown files
3. Delete `styles/index.css` (Chinese overrides are now built into the theme)
4. Delete `setup/mermaid.ts` (Mermaid theming is now built into the theme)
5. Remove empty `styles/` and `setup/` directories
6. Run `bun install` to re-link

## 8. Implementation Notes

### 8.1 What to PORT from `slidev-theme-academic`

Port these files directly from the installed theme with minimal changes:

| Source file (in `node_modules/slidev-theme-academic/`) | Destination |
|---|---|
| `components/Pagination.vue` | `components/Pagination.vue` |
| `components/Footnotes.vue` | `components/Footnotes.vue` |
| `components/Footnote.vue` | `components/Footnote.vue` |
| `components/FigureWithOptionalCaption.vue` | `components/FigureWithOptionalCaption.vue` |
| `components/TextWithOptionalLink.vue` | `components/TextWithOptionalLink.vue` |
| `layouts/cover.vue` | `layouts/cover.vue` (then add new props) |
| `layouts/figure.vue` | `layouts/figure.vue` |
| `layouts/figure-side.vue` | `layouts/figure-side.vue` |
| `layouts/table-of-contents.vue` | `layouts/table-of-contents.vue` |
| `global-top.vue` | `global-top.vue` |

Reference location:
`/Users/hugodong/Documents/AcademicWorkplace/01_TEACHING_PORTFOLIO/Course_Development/BIOINFO_Bioinformatics/lectures/node_modules/slidev-theme-academic/`

### 8.2 What to PORT from current project overrides

| Source file | Port to | What to port |
|---|---|---|
| `lectures/styles/index.css` | `styles/chinese.css` | CJK font stack, table styling, line-height |
| `lectures/setup/mermaid.ts` | `styles/mermaid.css` or `setup/mermaid.ts` | Mermaid theme variables |

Reference location:
`/Users/hugodong/Documents/AcademicWorkplace/01_TEACHING_PORTFOLIO/Course_Development/BIOINFO_Bioinformatics/lectures/`

### 8.3 What to BUILD NEW

| File | Type | Notes |
|---|---|---|
| `layouts/section.vue` | Layout | Section divider with bilingual title |
| `layouts/break.vue` | Layout | Break divider |
| `layouts/end.vue` | Layout | Thank you / Q&A |
| `layouts/quote.vue` | Layout | Blockquote with accent border |
| `layouts/two-col.vue` | Layout | Two-column comparison |
| `components/BilingualTitle.vue` | Component | Chinese + English title pair |
| `components/SessionInfo.vue` | Component | 学时 progress indicator |
| `styles/layout.css` | CSS | Design system + custom properties |
| `styles/chinese.css` | CSS | CJK typography overrides |
| `styles/code.css` | CSS | Code block styling |
| `uno.config.ts` | Config | UnoCSS shortcuts |
| `setup/shiki.ts` | Config | Syntax highlighting config |

### 8.4 Recommended implementation order

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

After step 6, the Ch10 deck should render correctly with the new theme.

## 9. Slidev Theme Authoring Constraints and Gotchas

1. **Theme name resolution**: Package must be named `slidev-theme-{name}`. In frontmatter, use `theme: {name}` (without prefix). For local preview, use `theme: ./` in `example.md`.

2. **Auto-registration**: Files in `layouts/` and `components/` are auto-registered by Slidev. No manual imports needed. Filenames directly become layout/component names.

3. **`styles/index.ts`**: Must exist and be named exactly `index.ts`. Slidev auto-imports it. Import `@slidev/client/styles/layouts-base.css` first, then custom CSS files.

4. **`global-top.vue` / `global-bottom.vue`**: Injected into every slide. Use for global elements like pagination. Keep logic minimal.

5. **`themeConfig`**: Arbitrary frontmatter keys accessible via `$slidev.themeConfigs` in Vue. Used for pagination position, disabled pages, etc.

6. **Props in markdown**: Pass props to layouts via frontmatter. Props are defined in the layout's `defineProps<T>()`.

7. **Default merging**: `package.json` `slidev.defaults` merges with user frontmatter. User values win. Define sensible defaults in the theme.

8. **Local path dependencies**: After modifying theme files, the consuming project may need `bun install` to pick up changes. HMR works during dev without reinstall.

9. **Chinese fonts**: Use system fonts (PingFang SC) or Google Fonts. Do not bundle font files in the theme.

10. **No `prebuild.js` needed**: The academic theme uses a prebuild script for its example vs published distribution. This theme is not published to npm, so that complexity is unnecessary.

11. **CSS `@apply`**: Slidev uses UnoCSS (not Tailwind). `@apply` directives work with UnoCSS utility classes.

12. **Dark mode**: Use CSS `:root` for light and `.dark` selector for dark overrides. Set `colorSchema: "both"` in package.json.

## 10. Source Reference

### Academic theme source (to port from)
```
/Users/hugodong/Documents/AcademicWorkplace/01_TEACHING_PORTFOLIO/Course_Development/BIOINFO_Bioinformatics/lectures/node_modules/slidev-theme-academic/
├── package.json                    # Slidev metadata format
├── layout-helper.ts                # resolveAssetUrl + handleBackground
├── global-top.vue                  # Global pagination injection
├── components/
│   ├── Pagination.vue              # Page numbering
│   ├── Footnotes.vue               # Footnote container
│   ├── Footnote.vue                # Single footnote
│   ├── FigureWithOptionalCaption.vue
│   └── TextWithOptionalLink.vue
├── layouts/
│   ├── cover.vue                   # Title slide
│   ├── figure.vue                  # Full-slide figure
│   ├── figure-side.vue             # Side-by-side figure
│   ├── table-of-contents.vue       # Auto TOC
│   └── intro.vue                   # Intro/overview
├── styles/
│   ├── index.ts                    # Style entry point
│   └── layout.css                  # Base layout CSS
└── uno.config.ts                   # UnoCSS config
```

### Current project overrides (to port from)
```
/Users/hugodong/Documents/AcademicWorkplace/01_TEACHING_PORTFOLIO/Course_Development/BIOINFO_Bioinformatics/lectures/
├── styles/index.css                # Chinese typography + table styling
├── setup/mermaid.ts                # Mermaid theme variables
├── ch10_biomolecular_network_analysis.md  # Real-world deck (16 slides, 4 layout types)
└── package.json                    # Current dependency config
```

### Real-world usage (Ch10 deck layout distribution)
- `section`: 6 slides (37.5%)
- `default`: 5 slides (31.25%)
- `center`: 4 slides (25%)
- `cover`: 1 slide (6.25%)
