<template>
  <KeynoteShell
    :density="density"
    :hide-footer="hideFooter"
    :hide-frame="hideFrame"
    :hide-logo="hideLogo"
    :hide-page="hidePage"
    :hide-wave="hideWave"
    layout-class="keynote-default keynote-quote"
  >
    <blockquote>
      <slot />
    </blockquote>
    <div v-if="quoteAuthor || quoteSource" class="quote-attribution">
      <span v-if="quoteAuthor" class="quote-author">{{ quoteAuthor }}</span>
      <span v-if="quoteAuthor && quoteSource">, </span>
      <span v-if="quoteSource" class="quote-source">{{ quoteSource }}</span>
    </div>
  </KeynoteShell>
</template>

<script setup lang="ts">
import { type KeynoteShellProps, keynoteShellDefaults } from "../layout-helper";

withDefaults(
  defineProps<
    KeynoteShellProps & { quoteSource?: string; quoteAuthor?: string }
  >(),
  { ...keynoteShellDefaults },
);
</script>

<style scoped></style>
