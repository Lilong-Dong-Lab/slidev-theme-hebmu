# Table of contents

The TOC layout shows a purple left photo crescent and a numbered agenda list.
Overview (no active section) keeps all items purple. Progress mode greys inactive
items and highlights one active item.

## Sub-features

- `toc-overview` renders the agenda before a section is active.
- `toc-progress` highlights the active agenda item when `active` is set.

## How to get to it (user POV)

- Open the first `layout: table-of-contents` slide (overview).
- Open the second TOC slide that sets `active:` (progress).

## Driving it with verify-hebmu

Preconditions:

- Doctor exit 0.
- On current `example.md`: overview is slide `2`, progress (`active: 4`) is
  slide `3`.

- **Open overview.** Navigate to `/2` (or
  `.cursor/skills/verify-hebmu/scripts/measure.sh 2`). Visible layout classes
  include `table-of-contents`. The list `.keynote-content-list` is present.
- **Open progress.** Navigate to `/3`. The list has class `has-active`, and at
  least one `.keynote-content-item` has an active class.
- **Assert logos load.** In the parked or visible DOM, every `.keynote-content-logo`
  / related TOC `<img>` reports `naturalWidth > 0` (whole-DOM image sweep from
  `docs/agents/verification.md` is acceptable here).
- **Proof.** Keep PNGs for slides 2 and 3. In the reply, note overview vs
  `has-active` on progress.

## Gotchas

- TOC is not KeynoteShell; do not assert `.keynote-stage` padding here.
- `active` counts section slides in the deck. Custom `contentItems` can diverge
  from inferred section indices (see `docs/specs.md`).
- Slide numbers shift if covers or early slides are inserted above the TOC pair.
