<template>
  <div class="absolute pagination-widget" :class="positionClasses">
    <SlideCurrentNo />
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";

const props = withDefaults(
  defineProps<{
    x?: "l" | "r";
    y?: "b" | "t";
  }>(),
  {
    x: "r",
    y: "b",
  },
);

const positionClasses = computed(() => [
  props.x === "l" && "left-0",
  props.x === "r" && "right-0",
  props.y === "t" && "top-0",
  props.y === "b" && "bottom-0",
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
