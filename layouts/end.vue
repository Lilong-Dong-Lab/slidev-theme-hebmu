<template>
  <div class="slidev-layout end">
    <h1 class="end-message-zh">{{ endMessage }}</h1>
    <p class="end-message-en">{{ endMessageEn }}</p>
    <slot />
    <div class="end-logo">
      <img src="/logo-placeholder.svg" alt="University Logo" />
    </div>
  </div>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    endMessage?: string;
    endMessageEn?: string;
  }>(),
  {
    endMessage: "谢谢！",
    endMessageEn: "Thank You!",
  },
);
</script>

<style scoped>
.end-message-zh {
  color: var(--hebmu-primary);
  font-size: 3rem;
  font-weight: 700;
}

.end-message-en {
  color: var(--hebmu-text-muted);
  font-size: 1.25rem;
  opacity: 0.6;
}

.end-logo {
  margin-top: 2rem;
}

.end-logo img {
  width: 60px;
  height: 60px;
  border-radius: 50%;
  opacity: 0.6;
}
</style>
