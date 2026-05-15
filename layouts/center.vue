<template>
  <KeynoteShell
    :density="density"
    :hide-footer="hideFooter"
    :hide-frame="true"
    :hide-logo="hideLogo"
    :hide-page="hidePage"
    :hide-wave="hideWave"
    layout-class="center keynote-center"
  >
    <div class="keynote-center-content">
      <slot />
    </div>
  </KeynoteShell>
</template>

<script setup lang="ts">
import { type KeynoteShellProps, keynoteShellDefaults } from "../layout-helper";

withDefaults(defineProps<KeynoteShellProps>(), {
  ...keynoteShellDefaults,
  hideFrame: true,
  hideTitle: true,
});
</script>
