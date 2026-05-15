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
    layout-class="two-col keynote-default keynote-two-col"
  >
    <slot />
    <div class="keynote-two-col-grid">
      <div>
        <slot name="left" />
      </div>
      <div>
        <slot name="right" />
      </div>
    </div>
  </KeynoteShell>
</template>

<script setup lang="ts">
import { type KeynoteShellProps, keynoteShellDefaults } from "../layout-helper";

withDefaults(defineProps<KeynoteShellProps>(), keynoteShellDefaults);
</script>
