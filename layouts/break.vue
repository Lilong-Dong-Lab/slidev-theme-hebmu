<template>
  <div class="slidev-layout break">
    <div class="break-icon">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="48"
        height="48"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.5"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
      </svg>
    </div>
    <h1>休息</h1>
    <p class="break-subtitle">Break</p>
    <p v-if="breakMinutes" class="break-duration">{{ breakMinutes }} 分钟</p>
    <slot />
  </div>
</template>

<script setup lang="ts">
defineProps<{
  breakMinutes?: number;
}>();
</script>

<style scoped>
.break-icon {
  opacity: 0.6;
  margin-bottom: 0.5rem;
}

.break h1 {
  color: #ffffff;
  font-size: 3.5rem;
  font-weight: 700;
  margin: 0;
}

.break-subtitle {
  font-size: 1.25rem;
  opacity: 0.7;
  margin: 0.25rem 0 0;
}

.break-duration {
  font-size: 1rem;
  opacity: 0.5;
  margin-top: 0.5rem;
}
</style>
