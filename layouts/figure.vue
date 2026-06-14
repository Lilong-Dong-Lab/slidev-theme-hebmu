<template>
  <KeynoteShell
    :auto-slide-title="autoSlideTitle"
    :density="density"
    :hide-footer="hideFooter"
    :hide-frame="hideFrame"
    :hide-logo="hideLogo"
    :hide-page="hidePage"
    :hide-title="hideTitle"
    :hide-wave="hideWave"
    :slide-title="slideTitle"
    layout-class="figure keynote-default keynote-figure"
    :stage-class="stageClass"
  >
    <div v-if="figureX"><slot /></div>
    <slot v-else />
    <FigureWithOptionalCaption
      :caption="figureCaption"
      :footnoteNumber="figureFootnoteNumber"
      :url="figureUrl"
    />
  </KeynoteShell>
</template>

<script setup lang="ts">
import { computed, watchEffect } from "vue";
import { type KeynoteShellProps, keynoteShellDefaults } from "../layout-helper";

/**
 * Unified figure layout. By default it is a full-bleed image (the historical
 * `figure` behavior). Two optional props absorb the former figure family:
 *
 * - `figureX: 'l' | 'r'`  → side-by-side mode (image + slot text column),
 *   formerly `figure-side`. The slot is wrapped in a `<div>` so it becomes the
 *   text column of `.keynote-figure-side-stage`.
 * - `footnoteFlow: true`  → image + an in-flow `<Footnotes>` block, formerly
 *   `figure-footnote`. Uses `.keynote-figure-footnote-stage` so footnotes
 *   participate in layout flow instead of absolute positioning.
 *
 * When neither is set, behavior is identical to the original `figure` layout,
 * so existing `figure` consumers are unaffected.
 *
 * `figureX` and `footnoteFlow` are effectively mutually exclusive: if both are
 * set, `figureX` wins (a dev-mode `console.warn` is emitted).
 */
const props = withDefaults(
  defineProps<
    KeynoteShellProps & {
      figureCaption?: string;
      figureFootnoteNumber?: number;
      figureUrl: string;
      figureX?: "l" | "r";
      footnoteFlow?: boolean;
    }
  >(),
  keynoteShellDefaults,
);

const stageClass = computed(() => {
  if (props.figureX) {
    return [
      "keynote-figure-side-stage",
      props.figureX === "l" && "figure-left",
    ];
  }
  if (props.footnoteFlow) {
    return "keynote-figure-footnote-stage";
  }
  return "keynote-figure-stage";
});

if (import.meta.env.DEV) {
  watchEffect(() => {
    if (props.figureX && props.footnoteFlow) {
      // eslint-disable-next-line no-console
      console.warn(
        "[slidev-theme-hebmu] figure: `figureX` and `footnoteFlow` are mutually exclusive — `figureX` takes precedence.",
      );
    }
  });
}
</script>
