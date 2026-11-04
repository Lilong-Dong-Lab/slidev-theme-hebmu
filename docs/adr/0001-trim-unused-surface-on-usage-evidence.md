# Trim unused theme surface on deck-usage evidence

The theme shipped an API surface ported from `slidev-theme-academic` (footnotes,
session-info, intro overview, full footer) that production decks never touched:
a 2026-11-04 audit of all 8 consumer decks (BIOINFO_Bioinformatics, BIOINFO_Programming;
323 slides) found zero uses of the `intro` layout, the `SessionInfo` component, the
`Footnotes`/`Footnote` components, figure's `footnoteFlow`/`figureFootnoteNumber`
props, and `footerMode: 'full'` — each survived only in `example.md`. We deleted
them outright in 0.4.0 rather than deprecating, because the package is unpublished
and its only consumers install via a `file:` path, so there is no external API
contract to honor. Surface whose usage is merely rare but real (e.g. `figureX`
side-by-side: 1 use; `hebmu-card`/`hebmu-source`: example-only but documented
authoring vocabulary) stays.

**Considered options**: delete outright (chosen); keep but stop documenting;
deprecate with a `console.warn` for one release. Rejection reason for the
latter two: dead surface is a navigation and testing cost for agents and the
sole author, and no consumer outside the two audited courses exists.

**Consequence**: decks that want footnotes or a full contact footer must build
them from `default` + raw markup/UnoCSS utilities, or the features must be
re-added deliberately with a usage-based justification.
