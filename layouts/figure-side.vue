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
    :stage-class="[
      'keynote-figure-side-stage',
      figureX === 'l' && 'figure-left',
    ]"
    layout-class="figure-side keynote-default keynote-figure-side"
  >
    <div>
      <slot />
    </div>
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
      figureX?: "l" | "r";
    }
  >(),
  { ...keynoteShellDefaults, figureX: "r" },
);
</script>
