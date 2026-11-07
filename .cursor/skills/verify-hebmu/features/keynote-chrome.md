# Keynote chrome geometry

Keynote chrome places the university logo and slide title in one header band and
pads the content stage so body text clears the waves and footer. Default and
compact densities use different stage paddings while sharing the same band size.

## Sub-features

- `chrome-band` keeps logo and title on the same top/height tokens.
- `stage-default` applies normal unframed stage padding (theme default
  `hideFrame: true`).
- `stage-compact` remaps stage tokens under `density: compact`.

## How to get to it (user POV)

- Open the preview deck and go to a normal `layout: default` content slide.
- Open a `layout: default` slide with `density: compact` in frontmatter.
- Read the chrome logo and chrome title on those slides (not the cover logo).

## Driving it with verify-hebmu

Preconditions:

- Doctor exit 0 for the current run.
- On tip `example.md` (0.5.0 era): compact sample is slide `4`; first normal
  default after sections is slide `6`. Re-check indices if the deck reorders.

- **Measure both densities.** Run
  `.cursor/skills/verify-hebmu/scripts/measure.sh 4 6`.
  Proof files appear under
  `.cursor/skills/verify-hebmu/artifacts/proof/$RUN_ID/metrics.json` plus
  `slide-4.png` and `slide-6.png`.
- **Assert compact stage (slide 4).** In `metrics.json`, slide `4`
  `stagePadding.shorthand` is `148px 36px 64px 36px`. Logo is
  `top/left/width/height` `20/24/68/68`. Title is
  `top/left/right/minHeight` `20/104/28/68`.
- **Assert default stage (slide 6).** `stagePadding.shorthand` is
  `168px 44px 78px 44px`. Logo and title match the same band numbers as slide 4.
- **Assert shared band.** Logo `top` equals title `top`, and logo `height`
  equals title `minHeight`, on both slides.
- **Proof.** Keep `metrics.json` and the two PNGs. Quote the shorthand paddings
  and band numbers in the agent reply.

## Gotchas

- Cover (slide 1) has no `.keynote-stage` / `.keynote-logo`. Do not use it for
  this feature.
- Stage padding lives on `.keynote-stage`, not on `.slidev-layout`.
- Framed paddings (`hideFrame: false`) differ from the unframed defaults above.
  This recipe covers the theme default (unframed). Add a dedicated framed slide
  before claiming framed geometry.
- Slide indices drift when `example.md` gains or loses slides before the target.
