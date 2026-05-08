<template>
  <div class="absolute p-2 text-xs" :class="classNames">
    <SlideCurrentNo /> / <SlidesTotal />
  </div>
</template>

<script setup lang="ts">
import { computed, type PropType } from "vue";

const {
  classNames: classNamesInput,
  x,
  y,
} = defineProps({
  classNames: {
    type: [Array, String] as PropType<string[] | string>,
  },
  x: {
    default: "r",
    type: String as PropType<"l" | "r">,
    validator: (value: string) => value === "l" || value === "r",
  },
  y: {
    default: "b",
    type: String as PropType<"b" | "t">,
    validator: (value: string) => value === "b" || value === "t",
  },
});

const classNames = computed(() => [
  ...(classNamesInput
    ? Array.isArray(classNamesInput)
      ? classNamesInput
      : [classNamesInput]
    : []),
  x === "l" && "left-0",
  x === "r" && "right-0",
  y === "t" && "top-0",
  y === "b" && "bottom-0",
]);
</script>
