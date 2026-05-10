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
withDefaults(
  defineProps<{
    filled?: boolean;
    separator?: boolean;
    x?: "l" | "r";
    y?: "col" | "row";
  }>(),
  {
    filled: false,
    separator: false,
    x: "r",
    y: "row",
  },
);
</script>
