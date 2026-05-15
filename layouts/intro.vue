<template>
  <KeynoteShell
    :auto-slide-title="autoSlideTitle"
    :density="density"
    :hide-footer="hideFooter"
    :hide-frame="hideFrame"
    :hide-logo="hideLogo"
    :hide-page="hidePage"
    :hide-title="hideTitle"
    :hide-wave="hideWave"
    :slide-title="slideTitle"
    layout-class="intro keynote-default keynote-intro"
  >
    <slot />
    <div v-if="courseTitle || sessionNumber" class="intro-meta">
      <span v-if="courseTitle">{{ courseTitle }}</span>
      <SessionInfo v-if="sessionNumber" :session-number="sessionNumber" />
    </div>
  </KeynoteShell>
</template>

<script setup lang="ts">
import { type KeynoteShellProps, keynoteShellDefaults } from "../layout-helper";

withDefaults(
  defineProps<
    KeynoteShellProps & {
      courseTitle?: string;
      sessionNumber?: number;
    }
  >(),
  keynoteShellDefaults,
);
</script>

<style scoped>
.intro-meta {
  position: absolute;
  top: 72px;
  left: 102px;
  right: 28px;
  display: flex;
  align-items: center;
  gap: 1rem;
  color: var(--hebmu-primary);
  font-size: 14px;
  font-weight: 600;
  line-height: 1.2;
  overflow-wrap: anywhere;
}
</style>
