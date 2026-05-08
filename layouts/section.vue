<template>
  <div class="slidev-layout section">
    <div v-if="sectionNumber" class="section-number">
      第{{ sectionNumber }}节
    </div>
    <div class="section-divider"></div>
    <BilingualTitle :title-zh="sectionTitle" :title-en="sectionTitleEn" />
    <slot />
  </div>
</template>

<script setup lang="ts">
defineProps<{
  sectionNumber?: number;
  sectionTitle?: string;
  sectionTitleEn?: string;
}>();
</script>

<style scoped>
.section-number {
  font-size: 3.5rem;
  font-weight: 700;
  color: var(--hebmu-primary);
  opacity: 0.2;
  line-height: 1;
}

.section-divider {
  width: 4rem;
  height: 3px;
  background: var(--hebmu-primary);
  border-radius: 2px;
  margin: 0.75rem 0;
}

.section :deep(h2) {
  font-size: 2rem;
}

.section :deep(h3) {
  color: var(--hebmu-text-muted);
}
</style>
