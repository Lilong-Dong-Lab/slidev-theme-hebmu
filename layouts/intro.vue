<template>
  <div class="slidev-layout intro">
    <div class="my-auto">
      <div v-if="courseTitle || sessionNumber" class="intro-header">
        <span v-if="courseTitle" class="intro-course">{{ courseTitle }}</span>
        <SessionInfo v-if="sessionNumber" :session-number="sessionNumber" />
      </div>
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  courseTitle?: string;
  sessionNumber?: number;
}>();
</script>

<style scoped>
.intro-header {
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-bottom: 1rem;
  padding-bottom: 0.75rem;
  border-bottom: 2px solid var(--hebmu-primary);
}

.intro-course {
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--hebmu-primary);
}
</style>
