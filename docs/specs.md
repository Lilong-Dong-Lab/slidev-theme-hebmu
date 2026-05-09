# Layout & Component Specifications

Detailed specs for all layouts and components. Referenced from CLAUDE.md via `@docs/specs.md`.

## Layouts

Each layout is a Vue SFC in `layouts/`. Auto-registered by filename (minus `.vue`). Every layout must wrap content in `<div class="slidev-layout {name}">` and use `<slot />`.

### cover

Title slide with university branding, course info, and author.

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
- Include the university logo and campus background from `themeConfig` fallbacks
- Use `resolveAssetUrl` from `layout-helper.ts` for theme asset URLs
- Supports multiple authors (array) with Chinese punctuation joining

### section

Section divider with bilingual title and section numbering (第X节).

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
- NEW layout — no academic equivalent.
- Large centered section number, bilingual title below
- `BilingualTitle` remains available as a public component for custom slide content
- Thin horizontal accent line between number and title

### default

Standard content slide (~31% of slides in production).

**Props**: None. **Slot**: Full slide content.

**Implementation**: `<div class="slidev-layout default"><slot /></div>`

### center

Vertically centered content for emphasis, key takeaways, or single statements.

**Props**: None. **Slot**: Centered content.

**Implementation**: `<div class="slidev-layout center"><div class="my-auto"><slot /></div></div>`

### intro

Course/session overview slide. Displays course title and session information.

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

### two-col

Two-column comparison layout.

**Props**:
None.

**Slot**: Content with `::left::` / `::right::` separators.

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
- NEW layout. Uses Slidev's built-in `::left::` / `::right::` named slot syntax.
- Renders a fixed two-column grid styled by `.keynote-two-col-grid`.

### figure

Full-slide image with optional caption and footnote.

**Props**:
| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `figureUrl` | `string` | required | Image URL |
| `figureCaption` | `string` | `undefined` | Caption text |
| `figureFootnoteNumber` | `number` | `undefined` | Footnote reference number |

**Implementation**: Port directly from `slidev-theme-academic` `figure.vue`. Uses `FigureWithOptionalCaption` component.

### figure-side

Content + figure side-by-side.

**Props**:
| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `figureUrl` | `string` | required | Image URL |
| `figureCaption` | `string` | `undefined` | Caption text |
| `figureFootnoteNumber` | `number` | `undefined` | Footnote reference number |
| `figureX` | `'l' \| 'r'` | `'r'` | Figure position (left or right) |

**Implementation**: Port directly from `slidev-theme-academic` `figure-side.vue`.

### table-of-contents

Keynote-style agenda/content slide matching the original `目录 | CONTENT` visual pattern.

**Props**:
| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `active` | `number` | inferred | Highlighted item number |
| `contentItems` | `(string \| object)[]` | section titles / TOC fallback | Agenda labels |
| `items` | `(string \| object)[]` | `undefined` | Alias for `contentItems` |
| `contentTitle` | `string` | `"目录 \| CONTENT"` | Main heading |
| `contentImageUrl` | `string` | `themeConfig.contentImageUrl`, then cover image | Left-side campus image |
| `contentImagePosition` | `string` | `"center"` | CSS `object-position` for the left image |
| `logoUrl` | `string` | `themeConfig.logoUrl` | Top logo override |
| `hidePage` | `boolean` | `false` | Hide pagination |

**Implementation**: Dedicated layout, not Slidev's built-in `<Toc />`. Uses a purple left crescent/photo panel, centered university logo, and a numbered agenda list with grey inactive items and purple active item.

### break

Break divider between lecture halves (10-minute break). Session format: 40min lecture → 10min break → 40min lecture = 2 学时.

**Props**:
| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `breakMinutes` | `number` | `10` | Break duration in minutes |

**Implementation notes**:
- NEW layout.
- Large centered text: "休息 / Break" with duration below
- Subtle background pattern or color to visually separate from content slides

### end

Closing slide — thank you message and/or Q&A.

**Props**:
| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `endMessage` | `string` | `"谢谢！"` | Closing message in Chinese |
| `endMessageEn` | `string` | `"Thank You!"` | Closing message in English |

**Slot**: Additional content (contact info, QR code, etc.).

**Implementation notes**:
- NEW layout.
- Large centered bilingual message
- University logo placeholder at bottom

### quote

Key definition or principle in blockquote style.

**Props**:
| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `quoteSource` | `string` | `undefined` | Source attribution |
| `quoteAuthor` | `string` | `undefined` | Author attribution |

**Slot**: Quote content (markdown supported).

**Implementation notes**:
- NEW layout.
- Left border accent in `--hebmu-primary`
- Italic attribution text
- Larger font for the quote body

## Components

Auto-registered by filename. `Pagination.vue` → `<Pagination />`.

### Pagination

Current slide number on every slide.

**Props**:
| Prop | Type | Values | Default | Description |
|------|------|--------|---------|-------------|
| `x` | `string` | `'l'`, `'r'` | `'r'` | Horizontal position |
| `y` | `string` | `'b'`, `'t'` | `'b'` | Vertical position |

**Behavior**: Uses `<SlideCurrentNo />`. Renders the current page number in fixed position.

**ThemeConfig integration**: `themeConfig.paginationX`, `themeConfig.paginationY`, `themeConfig.paginationPagesDisabled: [1, 5]`.

**Source**: Port from `slidev-theme-academic` `Pagination.vue`.

### Footnotes

Container for multiple `Footnote` children.

**Props**:
| Prop | Type | Values | Default | Description |
|------|------|--------|---------|-------------|
| `filled` | `boolean` | — | `false` | Background fill |
| `separator` | `boolean` | — | `false` | Show separator line |
| `x` | `string` | `'l'`, `'r'` | `'r'` | Horizontal position |
| `y` | `string` | `'col'`, `'row'` | `'row'` | Layout direction |

**Source**: Port from `slidev-theme-academic` `Footnotes.vue`.

### Footnote

Individual footnote item. Child of `Footnotes`.

**Props**: `number: number` (superscript).

**Source**: Port from `slidev-theme-academic` `Footnote.vue`.

### BilingualTitle

Chinese title + English subtitle pair for custom slide content.

**Props**: `titleZh: string` (rendered as `<h2>`), `titleEn: string` (rendered as `<h3 class="opacity-60">`).

```vue
<template>
  <div class="bilingual-title">
    <h2>{{ titleZh }}</h2>
    <h3 v-if="titleEn" class="opacity-60 text-sm mt-1">{{ titleEn }}</h3>
  </div>
</template>
```

### SessionInfo

Display current 学时 (session) number. Format: 1 session = 2×40min + 10min break = 2 学时.

**Props**: `sessionNumber: number`, `totalSessions?: number` (optional, for progress bar).

```vue
<template>
  <div class="session-info text-xs opacity-50">
    <span>第 {{ sessionNumber }} 学时</span>
    <span v-if="totalSessions"> / {{ totalSessions }}</span>
  </div>
</template>
```

### FigureWithOptionalCaption

Reusable figure rendering with optional caption and footnote number.

**Props**: `figureUrl: string` (resolved via `resolveAssetUrl`), `figureCaption?: string`, `figureFootnoteNumber?: number`.

**Source**: Port from `slidev-theme-academic` `FigureWithOptionalCaption.vue`.
