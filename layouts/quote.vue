<template>
  <div class="slidev-layout quote">
    <blockquote>
      <slot />
    </blockquote>
    <div v-if="quoteAuthor || quoteSource" class="quote-attribution">
      <span v-if="quoteAuthor" class="quote-author">{{ quoteAuthor }}</span>
      <span v-if="quoteAuthor && quoteSource">, </span>
      <span v-if="quoteSource" class="quote-source">{{ quoteSource }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  quoteSource?: string;
  quoteAuthor?: string;
}>();
</script>

<style scoped>
.quote blockquote {
  border-left: 5px solid var(--hebmu-primary);
  padding-left: 1.5rem;
  font-size: 1.5rem;
  line-height: 1.6;
  color: var(--hebmu-text);
  font-style: italic;
}

.quote-attribution {
  margin-top: 1rem;
  padding-left: 1.5rem;
  font-size: 0.9rem;
  color: var(--hebmu-text-muted);
}

.quote-author {
  font-weight: 600;
}

.quote-source {
  font-style: italic;
}
</style>
