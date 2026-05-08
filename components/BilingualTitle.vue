<template>
  <div class="bilingual-title">
    <h2>{{ titleZh }}</h2>
    <h3 v-if="titleEn" class="opacity-60 text-sm mt-1">{{ titleEn }}</h3>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  titleZh: string;
  titleEn?: string;
}>();
</script>
