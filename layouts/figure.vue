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
    <FigureWithOptionalCaption :caption="figureCaption" :url="figureUrl" />
  </KeynoteShell>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { type KeynoteShellProps, keynoteShellDefaults } from "../layout-helper";

/**
 * Unified figure layout. By default it is a full-bleed image (the historical
 * `figure` behavior). `figureX: 'l' | 'r'` switches to side-by-side mode
 * (image + slot text column), formerly the `figure-side` layout: the slot is
 * wrapped in a `<div>` so it becomes the text column of
 * `.keynote-figure-side-stage`. Without `figureX`, behavior is identical to
 * the original `figure` layout, so existing `figure` consumers are unaffected.
 */
const props = withDefaults(
  defineProps<
    KeynoteShellProps & {
      figureCaption?: string;
      figureUrl: string;
      figureX?: "l" | "r";
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
  return "keynote-figure-stage";
});
</script>
