<template>
  <div class="slidev-layout keynote-layout keynote-default">
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
      <slot />
    </main>
  </div>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    hideFooter?: boolean;
    hideFrame?: boolean;
    hideLogo?: boolean;
    hidePage?: boolean;
    hideWave?: boolean;
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

<style scoped></style>
