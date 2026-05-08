# slidev-theme-hebmu

A [Slidev](https://sli.dev) presentation theme for **河北医科大学 (Hebei Medical University)** academic teaching — Chinese-first typography with bilingual (中/EN) support.

## Features

- Chinese-first typography (PingFang SC, CJK-optimized spacing)
- Bilingual layout support (Chinese title + English subtitle)
- Session-based structure (学时): 40min + 10min break + 40min
- Light and dark mode
- Bioinformatics-optimized: Mermaid diagram theming, code highlighting
- 12 layouts, 7 components

## Quick Start

### In your Slidev project

Add the theme as a local dependency in your `package.json`:

```json
{
  "dependencies": {
    "slidev-theme-hebmu": "file:path/to/slidev-theme-hebmu"
  }
}
```

Then set it in your slide frontmatter:

```markdown
---
theme: hebmu
fonts:
  sans: 'PingFang SC'
  mono: 'Fira Code'
htmlAttrs:
  lang: zh-CN
---
```

## Layouts

| Layout | Description | Key Props |
|---|---|---|
| `cover` | Title slide with university branding | `coverAuthor`, `coverDate`, `courseName`, `sessionNumber` |
| `section` | Section divider (第X节) | `sectionNumber`, `sectionTitle`, `sectionTitleEn` |
| `default` | Standard content slide | — |
| `center` | Vertically centered emphasis | — |
| `intro` | Course/session overview | `courseTitle`, `sessionNumber` |
| `two-col` | Two-column comparison | `cols`, `gap` |
| `figure` | Full-slide figure with caption | `figureUrl`, `figureCaption` |
| `figure-side` | Content + figure side-by-side | `figureUrl`, `figureX` |
| `table-of-contents` | Auto-generated TOC | — |
| `break` | Break divider (10 min) | `breakMinutes` |
| `end` | Thank you / Q&A | `endMessage`, `endMessageEn` |
| `quote` | Key definition blockquote | `quoteSource`, `quoteAuthor` |

## Components

| Component | Description |
|---|---|
| `<Pagination>` | Page numbering (current/total) |
| `<Footnotes>` / `<Footnote>` | Reference footnotes |
| `<BilingualTitle>` | Chinese + English title pair |
| `<SessionInfo>` | 学时 session progress |
| `<FigureWithOptionalCaption>` | Reusable figure rendering |

## ThemeConfig

Set in the first slide's frontmatter:

```yaml
themeConfig:
  paginationX: 'r'     # 'l' or 'r'
  paginationY: 'b'     # 't' or 'b'
  paginationPagesDisabled: [1]  # Pages without pagination
```

## Development

```bash
bun install
bun run dev      # Preview with example.md
bun run build    # Build static site
bun run export   # Export to PDF
```

## License

MIT
