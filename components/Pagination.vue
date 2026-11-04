<template>
  <div v-if="!disabled" class="absolute pagination-widget" :class="positionClasses">
    <SlideCurrentNo />
  </div>
</template>

<script setup lang="ts">
import { useSlideContext } from "@slidev/client";
import { computed } from "vue";
import { type ThemeConfigs } from "../layout-helper";

const props = withDefaults(
  defineProps<{
    x?: "l" | "r";
    y?: "b" | "t";
  }>(),
  {
    x: undefined,
    y: undefined,
  },
);

// Single owner of pagination gating: the disabled-pages check and the
// themeConfig x/y defaults live here, so layouts just render <Pagination />.
const { $slidev } = useSlideContext();

const themeConfigs = computed(
  () => ($slidev.themeConfigs || {}) as ThemeConfigs,
);

const x = computed(
  () =>
    props.x ??
    (themeConfigs.value.paginationX as "l" | "r" | undefined) ??
    "r",
);
const y = computed(
  () =>
    props.y ??
    (themeConfigs.value.paginationY as "b" | "t" | undefined) ??
    "b",
);

const disabled = computed(() =>
  (themeConfigs.value.paginationPagesDisabled || []).includes(
    $slidev.nav.currentPage,
  ),
);

const positionClasses = computed(() => [
  x.value === "l" && "left-0",
  x.value === "r" && "right-0",
  y.value === "t" && "top-0",
  y.value === "b" && "bottom-0",
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
