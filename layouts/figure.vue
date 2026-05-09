<template>
  <div class="slidev-layout keynote-layout keynote-default keynote-figure">
    <KeynoteChrome
      :hide-footer="hideFooter"
      :hide-logo="hideLogo"
      :hide-page="hidePage"
      :hide-wave="hideWave"
    />
    <main
      class="keynote-stage keynote-figure-stage"
      :class="{
        'is-unframed': hideFrame,
      }"
    >
      <slot />
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
    hideFooter?: boolean;
    hideFrame?: boolean;
    hideLogo?: boolean;
    hidePage?: boolean;
    hideWave?: boolean;
  }>(),
  {
    hideFooter: false,
    hideFrame: false,
    hideLogo: false,
    hidePage: false,
    hideWave: false,
  },
);
</script>

<style scoped></style>
