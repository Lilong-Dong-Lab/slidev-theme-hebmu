<template>
  <div class="slidev-layout break keynote-layout keynote-break">
    <KeynoteChrome
      :hide-footer="hideFooter"
      :hide-logo="hideLogo"
      :hide-page="hidePage"
      :hide-wave="hideWave"
    />
    <div class="keynote-break-content">
      <div class="keynote-break-title">休息</div>
      <div class="keynote-break-subtitle">
        Break <span v-if="breakMinutes">/ {{ breakMinutes }} 分钟</span>
      </div>
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
import {
  type KeynoteChromeProps,
  keynoteChromeDefaults,
} from "../layout-helper";

withDefaults(defineProps<KeynoteChromeProps & { breakMinutes?: number }>(), {
  ...keynoteChromeDefaults,
  breakMinutes: 10,
  hideFooter: true,
  hidePage: true,
});
</script>
