<template>
  <div class="slidev-layout keynote-layout keynote-section">
    <KeynoteChrome
      :hide-footer="hideFooter"
      :hide-logo="hideLogo"
      :hide-page="hidePage"
      :hide-wave="hideWave"
    />
    <div class="keynote-section-content">
      <div v-if="sectionNumber" class="keynote-section-number">
        第 {{ sectionNumber }} 节
      </div>
      <div v-if="sectionTitle" class="keynote-section-title">
        {{ sectionTitle }}
      </div>
      <div v-if="sectionTitleEn" class="keynote-section-title-en">
        {{ sectionTitleEn }}
      </div>
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    hideFooter?: boolean;
    hideLogo?: boolean;
    hidePage?: boolean;
    hideWave?: boolean;
    sectionNumber?: number;
    sectionTitle?: string;
    sectionTitleEn?: string;
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
