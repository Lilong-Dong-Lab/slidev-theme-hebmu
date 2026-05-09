<template>
  <div class="slidev-layout keynote-layout keynote-break">
    <KeynoteChrome
      :hide-footer="hideFooter"
      :hide-logo="hideLogo"
      :hide-page="hidePage"
      :hide-wave="hideWave"
    />
    <div class="keynote-break-content">
      <h1>休息</h1>
      <p>
        Break <span v-if="breakMinutes">/ {{ breakMinutes }} 分钟</span>
      </p>
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    breakMinutes?: number;
    hideFooter?: boolean;
    hideLogo?: boolean;
    hidePage?: boolean;
    hideWave?: boolean;
  }>(),
  {
    breakMinutes: 10,
    hideFooter: false,
    hideLogo: false,
    hidePage: false,
    hideWave: false,
  },
);
</script>

<style scoped></style>
