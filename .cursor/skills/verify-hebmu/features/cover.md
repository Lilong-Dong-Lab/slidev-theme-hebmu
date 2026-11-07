# Cover layout

The cover is the branded opening slide with campus background, university logo,
course title, and optional author/date meta. It does not use KeynoteShell stage
chrome.

## Sub-features

- `cover-title` shows the deck H1/H2 in the cover title region.
- `cover-logo` loads the theme logo image.
- `cover-identity` keeps the document title naming this demo deck.

## How to get to it (user POV)

- Open the preview deck at the first slide (`layout: cover`).
- Look for the campus photo panel, logo, and bilingual title block.

## Driving it with verify-hebmu

Preconditions:

- Doctor exit 0.
- Cover is slide `1` in current `example.md`.

- **Open cover.** Run
  `.cursor/skills/verify-hebmu/scripts/measure.sh 1`.
- **Assert deck identity.** In `metrics.json`, slide `1` `pageTitle` contains
  `slidev-theme-hebmu 主题演示`.
- **Assert cover chrome, not Keynote stage.** `stagePadding` is null / absent.
  `cover.naturalWidth` is greater than `0` when `cover` is present (image
  decoded). Prefer also confirming the PNG shows the campus photo and logo.
- **Proof.** Keep `slide-1.png` and the slide `1` entry in `metrics.json`.

## Gotchas

- Measuring `.keynote-logo` on the cover always fails; use `.cover-logo`.
- A 200 response on the wrong port can still render another deck. Doctor title
  check is mandatory before trusting the PNG.
- Cover background is a CSS `background-image`; absence shows as a blank photo
  panel in the PNG, not as a missing `<img>` for the campus asset.
