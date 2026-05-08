<template>
  <div class="session-info text-xs">
    <span>第 {{ sessionNumber }} 学时</span>
    <span v-if="totalSessions"> / {{ totalSessions }}</span>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  sessionNumber: number;
  totalSessions?: number;
}>();
</script>

<style scoped>
.session-info {
  background: color-mix(in srgb, var(--hebmu-primary) 10%, transparent);
  color: var(--hebmu-primary);
  padding: 0.15rem 0.5rem;
  border-radius: 0.25rem;
  font-weight: 500;
  opacity: 0.7;
}
</style>
