<template>
  <div class="slidev-layout keynote-layout keynote-center">
    <KeynoteChrome
      :hide-footer="hideFooter"
      :hide-logo="hideLogo"
      :hide-page="hidePage"
      :hide-wave="hideWave"
    />
    <main class="keynote-stage is-unframed">
      <div class="keynote-center-content">
        <slot />
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    hideFooter?: boolean;
    hideLogo?: boolean;
    hidePage?: boolean;
    hideWave?: boolean;
  }>(),
  {
    hideFooter: false,
    hideLogo: false,
    hidePage: false,
    hideWave: false,
  },
);
</script>

<style scoped></style>
