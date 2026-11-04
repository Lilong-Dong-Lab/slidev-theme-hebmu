<template>
  <div
    ref="layoutRef"
    class="slidev-layout table-of-contents keynote-content"
  >
    <div class="keynote-content-left" aria-hidden="true">
      <div class="keynote-content-disc"></div>
      <div class="keynote-content-photo">
        <img
          :src="resolveAssetUrl(contentImage)"
          :style="{ objectPosition: contentImagePosition }"
          alt=""
        />
      </div>
      <svg
        class="keynote-content-ribbon"
        viewBox="0 0 392 768"
        preserveAspectRatio="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M176 0 C275 82 334 188 358 315 C385 462 350 625 278 768 L392 768 L392 0 Z"
        />
      </svg>
      <div class="keynote-content-band keynote-content-band-top"></div>
      <div class="keynote-content-band keynote-content-band-bottom"></div>
      <span class="keynote-content-dot dot-a"></span>
      <span class="keynote-content-dot dot-b"></span>
      <span class="keynote-content-dot dot-c"></span>
      <span class="keynote-content-dot dot-d"></span>
    </div>

    <main class="keynote-content-main">
      <img
        class="keynote-content-logo"
        :src="resolveAssetUrl(contentLogo)"
        alt="Hebei Medical University"
      />
      <h1 class="keynote-content-title">{{ contentTitle }}</h1>

      <ol ref="listRef" class="keynote-content-list" :class="{ 'has-active': activeIndex != null }">
        <li
          v-for="(item, index) in normalizedItems"
          :key="`${index}-${item.title}`"
          class="keynote-content-item"
          :class="{
            'is-active': activeIndex != null && index + 1 === activeIndex,
            'is-equal': activeIndex == null,
          }"
        >
          <span class="keynote-content-number">{{ index + 1 }}</span>
          <span class="keynote-content-text">{{ item.title }}</span>
        </li>
      </ol>
    </main>

    <Pagination
      v-if="
        !hidePage &&
        !$slidev.themeConfigs?.paginationPagesDisabled?.includes(
          $slidev.nav.currentPage,
        )
      "
      :x="$slidev.themeConfigs?.paginationX || 'r'"
      :y="$slidev.themeConfigs?.paginationY || 'b'"
    />
  </div>
</template>

<script setup lang="ts">
import { useSlideContext } from "@slidev/client";
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
  watchEffect,
} from "vue";
import { type ThemeConfigs, resolveAssetUrl } from "../layout-helper";

const CURVE_CX = 50;
const CURVE_RX = 320;
const CURVE_CY = 385;
const CURVE_RY = 575;
const CURVE_GAP = 48;
// The ×2 bow swings end items left of the constant-clearance line. MIN_GAP is
// the floor: no item may sit closer than this to the crescent ellipse.
const MIN_GAP = 24;

const layoutRef = ref<HTMLElement | null>(null);
const listRef = ref<HTMLElement | null>(null);
let listObserver: ResizeObserver | null = null;

function alignItems() {
  const layout = layoutRef.value;
  const list = listRef.value;
  if (!layout || !list) return;

  const nodes = [
    ...list.querySelectorAll<HTMLElement>(".keynote-content-item"),
  ];
  // Clear prior translates so Y is measured from the flex layout, not a stale curve.
  for (const node of nodes) node.style.transform = "";

  const layoutRect = layout.getBoundingClientRect();
  const scale = layoutRect.height / layout.offsetHeight;
  if (!Number.isFinite(scale) || scale === 0) return;

  const listLeft =
    (list.getBoundingClientRect().left - layoutRect.left) / scale;

  const peakOffset = CURVE_CX + CURVE_RX + CURVE_GAP - listLeft;
  for (const node of nodes) {
    const rect = node.getBoundingClientRect();
    const centerY = (rect.top + rect.height / 2 - layoutRect.top) / scale;
    const dy = (centerY - CURVE_CY) / CURVE_RY;
    const inside = 1 - dy * dy;
    const curveX =
      inside > 0 ? CURVE_CX + CURVE_RX * Math.sqrt(inside) : CURVE_CX;
    const rawOffset = curveX + CURVE_GAP - listLeft;
    // Packed TOC sits on a flat arc band; amplify deviation so the crescent still reads.
    const amplifiedOffset = peakOffset + (rawOffset - peakOffset) * 2;
    // Clamp: the amplified bow never pushes an item closer than MIN_GAP to the crescent.
    const clearanceOffset = curveX + MIN_GAP - listLeft;
    const offsetX = Math.max(amplifiedOffset, clearanceOffset);
    node.style.transform = `translateX(${offsetX}px)`;
  }
}

function scheduleAlign() {
  nextTick(() => {
    alignItems();
    requestAnimationFrame(() => {
      alignItems();
      requestAnimationFrame(alignItems);
    });
  });
}

type ContentItemInput =
  | string
  | {
      title?: string;
      text?: string;
      label?: string;
    };

type ContentItem = {
  title: string;
};

const props = withDefaults(
  defineProps<{
    active?: number;
    contentImagePosition?: string;
    contentImageUrl?: string;
    contentItems?: ContentItemInput[];
    contentTitle?: string;
    hidePage?: boolean;
    imageUrl?: string;
    items?: ContentItemInput[];
    logoUrl?: string;
  }>(),
  {
    active: undefined,
    contentImagePosition: "center",
    contentImageUrl: undefined,
    contentItems: undefined,
    contentTitle: "目录 | Contents",
    hidePage: false,
    imageUrl: undefined,
    items: undefined,
    logoUrl: undefined,
  },
);

const { $slidev } = useSlideContext();

const themeConfigs = computed(
  () => ($slidev.themeConfigs || {}) as ThemeConfigs,
);

const configuredItems = computed(
  () =>
    props.contentItems ||
    props.items ||
    (themeConfigs.value.contentItems as ContentItemInput[] | undefined) ||
    (themeConfigs.value.tocItems as ContentItemInput[] | undefined),
);

// Slides that contribute a numbered entry to a section-derived TOC: a
// section layout carrying a sectionTitle. The item list and index inference
// both derive from this list so they stay in lockstep.
const sectionRoutes = computed(() =>
  $slidev.nav.slides.filter((route) => {
    const frontmatter = route.meta?.slide?.frontmatter;
    return frontmatter?.layout === "section" && frontmatter.sectionTitle;
  }),
);

const sectionItems = computed<ContentItemInput[]>(() =>
  sectionRoutes.value.map((route) => ({
    title: route.meta?.slide?.frontmatter?.sectionTitle,
  })),
);

const tocItems = computed<ContentItemInput[]>(() =>
  $slidev.nav.tocTree
    .filter((item) => item.title)
    .slice(0, 6)
    .map((item) => ({
      title: item.title,
    })),
);

const normalizeItems = (items: ContentItemInput[] | undefined): ContentItem[] =>
  (items || [])
    .map((item) => {
      if (typeof item === "string") return { title: item };

      return {
        title: item.title || item.text || item.label || "",
      };
    })
    .filter((item) => item.title);

const normalizedItems = computed(() => {
  const items =
    (configuredItems.value?.length || 0) > 0
      ? configuredItems.value
      : sectionItems.value.length > 0
        ? sectionItems.value
        : tocItems.value;

  return normalizeItems(items);
});

// A usable `active`: a 1-indexed integer within the rendered items. The
// render path and the dev warning share this predicate so they cannot drift.
function isValidActive(value: number, count: number) {
  return Number.isInteger(value) && value >= 1 && value <= count;
}

// Overview TOC: leave `active` unset before the first section — every item
// shares one color. Progress TOC: set `active: N` to pin item N, or leave it
// unset on a later TOC and the layout infers the section that contains the
// current page. No matching section → overview. An invalid `active` is
// ignored (a dev-mode warning fires once per value) and the layout behaves
// as if unset.
const activeIndex = computed(() => {
  const active = props.active;
  if (active != null && isValidActive(active, normalizedItems.value.length)) {
    return active;
  }

  const currentPage = $slidev.nav.currentPage;
  let inferred: number | null = null;
  sectionRoutes.value.forEach((route, index) => {
    if (route.no <= currentPage) inferred = index + 1;
  });
  return inferred;
});

if (import.meta.env.DEV) {
  const warnedActive = new Set<number>();
  watchEffect(() => {
    const active = props.active;
    if (active == null) return;
    const count = normalizedItems.value.length;
    if (isValidActive(active, count)) return;
    if (warnedActive.has(active)) return;
    warnedActive.add(active);
    // eslint-disable-next-line no-console
    console.warn(
      `[slidev-theme-hebmu] table-of-contents: \`active\` is 1-indexed (valid range 1..${count}); received ${active}. Rendering as if unset.`,
    );
  });
}

const contentImage = computed(
  () =>
    props.contentImageUrl ||
    props.imageUrl ||
    (themeConfigs.value.contentImageUrl as string | undefined) ||
    (themeConfigs.value.coverBackgroundUrl as string | undefined) ||
    "/campus-cover.jpeg",
);

const contentLogo = computed(
  () =>
    props.logoUrl ||
    (themeConfigs.value.logoUrl as string | undefined) ||
    "/hebmu-logo.png",
);

onMounted(() => {
  scheduleAlign();
  if (!layoutRef.value) return;
  listObserver = new ResizeObserver(() => scheduleAlign());
  listObserver.observe(layoutRef.value);
  if (listRef.value) listObserver.observe(listRef.value);
});

watch(normalizedItems, () => {
  scheduleAlign();
});

onBeforeUnmount(() => listObserver?.disconnect());
</script>
