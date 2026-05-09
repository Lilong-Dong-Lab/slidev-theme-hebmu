<template>
  <div class="slidev-layout keynote-layout keynote-default keynote-quote">
    <KeynoteChrome
      :hide-footer="hideFooter"
      :hide-logo="hideLogo"
      :hide-page="hidePage"
      :hide-wave="hideWave"
    />
    <main
      class="keynote-stage"
      :class="{
        'is-unframed': hideFrame,
      }"
    >
      <blockquote>
        <slot />
      </blockquote>
      <div v-if="quoteAuthor || quoteSource" class="quote-attribution">
        <span v-if="quoteAuthor" class="quote-author">{{ quoteAuthor }}</span>
        <span v-if="quoteAuthor && quoteSource">, </span>
        <span v-if="quoteSource" class="quote-source">{{ quoteSource }}</span>
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    hideFooter?: boolean;
    hideFrame?: boolean;
    hideLogo?: boolean;
    hidePage?: boolean;
    hideWave?: boolean;
    quoteSource?: string;
    quoteAuthor?: string;
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
