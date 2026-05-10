<template>
  <h1 v-if="resolvedTitle" class="keynote-slide-title">
    {{ resolvedTitle }}
  </h1>
</template>

<script setup lang="ts">
import { useSlideContext } from "@slidev/client";
import {
  Fragment,
  Text,
  computed,
  isVNode,
  useSlots,
  type VNodeChild,
} from "vue";

const props = withDefaults(
  defineProps<{
    autoTitle?: boolean;
    title?: string;
  }>(),
  {
    autoTitle: true,
  },
);

const { $slidev } = useSlideContext();
const slots = useSlots();

const normalizeTitle = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";

const textFromChildren = (children: unknown): string => {
  if (typeof children === "string" || typeof children === "number") {
    return String(children);
  }

  if (Array.isArray(children)) {
    return children
      .map((child) => {
        if (typeof child === "string" || typeof child === "number") {
          return String(child);
        }

        if (isVNode(child)) return textFromChildren(child.children);
        return "";
      })
      .join("");
  }

  return "";
};

const findFirstH1Title = (nodes: VNodeChild[]): string => {
  for (const node of nodes) {
    if (!isVNode(node)) continue;

    if (node.type === Text) continue;

    if (node.type === Fragment && Array.isArray(node.children)) {
      const title = findFirstH1Title(node.children as VNodeChild[]);
      if (title) return title;
      continue;
    }

    if (typeof node.type === "string" && node.type.toLowerCase() === "h1") {
      return normalizeTitle(textFromChildren(node.children));
    }

    // Do not recurse into element nodes (div, grid containers, named-slot wrappers)
  }

  return "";
};

const inferredTitle = computed(() => {
  const slotTitle = findFirstH1Title(slots.default?.() || []);
  if (slotTitle) return slotTitle;
  return normalizeTitle($slidev.nav.currentSlideRoute?.meta?.slide?.title);
});

const explicitTitle = computed(() => normalizeTitle(props.title));

const resolvedTitle = computed(() => {
  if (explicitTitle.value) return explicitTitle.value;
  if (props.autoTitle) return inferredTitle.value;
  return "";
});
</script>
