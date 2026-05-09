<template>
  <div class="slidev-layout keynote-layout keynote-default keynote-figure-side">
    <KeynoteChrome
      :hide-footer="hideFooter"
      :hide-logo="hideLogo"
      :hide-page="hidePage"
      :hide-wave="hideWave"
    />
    <main
      class="keynote-stage keynote-figure-side-stage"
      :class="{
        'figure-left': figureX === 'l',
        'is-unframed': hideFrame,
      }"
    >
      <div>
        <slot />
      </div>
      <FigureWithOptionalCaption
        :caption="figureCaption"
        :footnoteNumber="figureFootnoteNumber"
        :url="figureUrl"
      />
    </main>
  </div>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    figureCaption?: string;
    figureFootnoteNumber?: number;
    figureUrl: string;
    figureX?: "l" | "r";
    hideFooter?: boolean;
    hideFrame?: boolean;
    hideLogo?: boolean;
    hidePage?: boolean;
    hideWave?: boolean;
  }>(),
  {
    figureX: "r",
    hideFooter: false,
    hideFrame: false,
    hideLogo: false,
    hidePage: false,
    hideWave: false,
  },
);
</script>

<style scoped></style>
