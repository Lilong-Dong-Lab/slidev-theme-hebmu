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
    stage-class="keynote-figure-stage"
  >
    <slot />
    <FigureWithOptionalCaption
      :caption="figureCaption"
      :footnoteNumber="figureFootnoteNumber"
      :url="figureUrl"
    />
  </KeynoteShell>
</template>

<script setup lang="ts">
import { type KeynoteShellProps, keynoteShellDefaults } from "../layout-helper";

withDefaults(
  defineProps<
    KeynoteShellProps & {
      figureCaption?: string;
      figureFootnoteNumber?: number;
      figureUrl: string;
    }
  >(),
  keynoteShellDefaults,
);
</script>
