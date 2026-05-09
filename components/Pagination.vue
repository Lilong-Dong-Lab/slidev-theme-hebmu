<template>
  <div class="absolute pagination-widget" :class="positionClasses">
    <SlideCurrentNo />
  </div>
</template>

<script setup lang="ts">
import { computed, type PropType } from "vue";

const { x, y } = defineProps({
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

const positionClasses = computed(() => [
  x === "l" && "left-0",
  x === "r" && "right-0",
  y === "t" && "top-0",
  y === "b" && "bottom-0",
]);
</script>

<style scoped>
.pagination-widget {
  padding: 10px 21px;
  color: var(--hebmu-text-muted);
  font-size: 13px;
  font-weight: 700;
  line-height: 1;
}
</style>
