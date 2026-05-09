<template>
  <div
    class="keynote-footnotes"
    :class="{
      'keynote-footnotes-filled': filled,
    }"
  >
    <hr v-if="separator" />
    <ul
      class="keynote-footnotes-list"
      :class="{
        'keynote-footnotes-col': y === 'col',
        'keynote-footnotes-row': y === 'row',
        'keynote-footnotes-left': x === 'l',
        'keynote-footnotes-right': x === 'r',
      }"
    >
      <slot />
    </ul>
  </div>
</template>

<script setup lang="ts">
import type { PropType } from "vue";

defineProps({
  filled: {
    default: false,
    type: Boolean,
  },
  separator: {
    default: false,
    type: Boolean,
  },
  x: {
    default: "r",
    type: String as PropType<"l" | "r">,
    validator: (value: string) => value === "l" || value === "r",
  },
  y: {
    default: "row",
    type: String as PropType<"col" | "row">,
    validator: (value: string) => value === "col" || value === "row",
  },
});
</script>
