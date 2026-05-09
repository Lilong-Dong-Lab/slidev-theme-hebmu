<template>
  <li class="keynote-footnote">
    <span v-if="number" class="keynote-footnote-number">{{ number }}</span>
    <span class="keynote-footnote-text"><slot /></span>
  </li>
</template>

<script setup lang="ts">
defineProps<{
  number?: number;
}>();
</script>
