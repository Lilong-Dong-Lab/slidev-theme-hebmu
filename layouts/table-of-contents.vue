<template>
  <div class="slidev-layout keynote-content">
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

      <ol class="keynote-content-list">
        <li
          v-for="(item, index) in normalizedItems"
          :key="`${index}-${item.title}`"
          class="keynote-content-item"
          :class="{ 'is-active': index + 1 === activeIndex }"
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
import { computed } from "vue";
import { resolveAssetUrl } from "../layout-helper";

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
    contentTitle: "目录 | CONTENT",
    hidePage: false,
    imageUrl: undefined,
    items: undefined,
    logoUrl: undefined,
  },
);

const { $slidev } = useSlideContext();

const themeConfigs = computed(
  () => ($slidev.themeConfigs || {}) as Record<string, unknown>,
);

const configuredItems = computed(
  () =>
    props.contentItems ||
    props.items ||
    (themeConfigs.value.contentItems as ContentItemInput[] | undefined) ||
    (themeConfigs.value.tocItems as ContentItemInput[] | undefined),
);

const sectionItems = computed<ContentItemInput[]>(() =>
  $slidev.nav.slides
    .map((route) => route.meta?.slide?.frontmatter)
    .filter(
      (frontmatter) =>
        frontmatter?.layout === "section" && frontmatter.sectionTitle,
    )
    .map((frontmatter) => ({
      title: frontmatter.sectionTitle,
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

const activeIndex = computed(() => {
  if (props.active) return props.active;

  const currentPage = $slidev.nav.currentPage;
  const sections = $slidev.nav.slides.filter(
    (route) => route.meta?.slide?.frontmatter?.layout === "section",
  );
  const nextSectionIndex = sections.findIndex(
    (route) => route.no > currentPage,
  );
  if (nextSectionIndex >= 0) return nextSectionIndex + 1;

  const previousSectionIndex = [...sections]
    .reverse()
    .findIndex((route) => route.no <= currentPage);

  if (previousSectionIndex < 0) return 1;
  return sections.length - previousSectionIndex;
});

const contentImage = computed(
  () =>
    props.contentImageUrl ||
    props.imageUrl ||
    (themeConfigs.value.contentImageUrl as string | undefined) ||
    (themeConfigs.value.coverBackgroundUrl as string | undefined) ||
    "/hebmu-assets/campus-cover.jpeg",
);

const contentLogo = computed(
  () =>
    props.logoUrl ||
    (themeConfigs.value.logoUrl as string | undefined) ||
    "/hebmu-assets/hebmu-logo.png",
);
</script>
