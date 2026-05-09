<template>
  <div class="slidev-layout keynote-layout keynote-default keynote-intro">
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
      <div v-if="courseTitle || sessionNumber" class="intro-meta">
        <span v-if="courseTitle">{{ courseTitle }}</span>
        <SessionInfo v-if="sessionNumber" :session-number="sessionNumber" />
      </div>
      <slot />
    </main>
  </div>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    courseTitle?: string;
    hideFooter?: boolean;
    hideFrame?: boolean;
    hideLogo?: boolean;
    hidePage?: boolean;
    hideWave?: boolean;
    sessionNumber?: number;
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

<style scoped>
.intro-meta {
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-bottom: 14px;
  color: var(--hebmu-primary);
  font-size: 16px;
  font-weight: 600;
}
</style>
