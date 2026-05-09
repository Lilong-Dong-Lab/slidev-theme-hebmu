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
  () => ($slidev.themeConfigs.value || {}) as Record<string, unknown>,
);

const configuredItems = computed(
  () =>
    props.contentItems ||
    props.items ||
    (themeConfigs.value.contentItems as ContentItemInput[] | undefined) ||
    (themeConfigs.value.tocItems as ContentItemInput[] | undefined),
);

const sectionItems = computed<ContentItemInput[]>(() =>
  $slidev.nav.slides.value
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
  $slidev.nav.tocTree.value
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

  const currentPage = $slidev.nav.currentPage.value;
  const sections = $slidev.nav.slides.value.filter(
    (route) => route.meta?.slide?.frontmatter?.layout === "section",
  );
  const nextSectionIndex = sections.findIndex((route) => route.no > currentPage);
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

<style scoped>
.keynote-content {
  background: #ffffff;
}

.keynote-content-left {
  position: absolute;
  inset: 0 auto 0 0;
  width: 392px;
  overflow: hidden;
}

.keynote-content-disc {
  position: absolute;
  border-radius: 50%;
  pointer-events: none;
}

.keynote-content-disc {
  top: -190px;
  left: -270px;
  width: 640px;
  height: 1150px;
  z-index: 1;
  background: var(--hebmu-primary-light);
}

.keynote-content-ribbon {
  position: absolute;
  inset: 0;
  width: 392px;
  height: 768px;
  z-index: 4;
  clip-path: ellipse(320px 575px at 50px 385px);
  pointer-events: none;
}

.keynote-content-ribbon path {
  fill: rgba(47, 0, 76, 0.32);
}

.keynote-content-band {
  position: absolute;
  left: 0;
  width: 374px;
  height: 28px;
  z-index: 5;
  clip-path: ellipse(320px 575px at 50px 385px);
  background: rgba(255, 255, 255, 0.22);
}

.keynote-content-band-top {
  top: 204px;
}

.keynote-content-band-bottom {
  top: 557px;
}

.keynote-content-photo {
  position: absolute;
  inset: 0;
  width: 392px;
  height: 768px;
  z-index: 3;
  clip-path: ellipse(320px 575px at 50px 385px);
  overflow: hidden;
}

.keynote-content-photo img {
  position: absolute;
  top: 222px;
  left: 0;
  display: block;
  width: 382px;
  height: 349px;
  object-fit: cover;
}

.keynote-content-dot {
  position: absolute;
  display: block;
  border-radius: 50%;
  z-index: 6;
  background: rgba(255, 255, 255, 0.24);
}

.dot-a {
  top: 120px;
  left: 0;
  width: 35px;
  height: 35px;
}

.dot-b {
  top: 129px;
  left: 259px;
  width: 50px;
  height: 50px;
}

.dot-c {
  top: 176px;
  left: 126px;
  width: 101px;
  height: 101px;
  background: rgba(255, 255, 255, 0.12);
}

.dot-d {
  top: 607px;
  left: 96px;
  width: 34px;
  height: 34px;
}

.keynote-content-main {
  position: absolute;
  inset: 0 0 0 382px;
}

.keynote-content-logo {
  position: absolute;
  top: 16px;
  left: 50%;
  width: 170px;
  height: 170px;
  object-fit: contain;
  transform: translateX(-50%);
}

.keynote-content-title {
  position: absolute;
  top: 238px;
  left: 0;
  right: 0;
  color: var(--hebmu-primary-light);
  font-size: 37px;
  font-weight: 700;
  line-height: 1.1;
  text-align: center;
  white-space: nowrap;
}

.keynote-content-list {
  position: absolute;
  top: 347px;
  left: 66px;
  right: 16px;
  display: flex;
  flex-direction: column;
  gap: 65px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.keynote-content-item {
  display: grid;
  grid-template-columns: 36px minmax(0, 1fr);
  gap: 22px;
  align-items: center;
  min-height: 46px;
  color: #808080;
  font-size: 33px;
  font-weight: 700;
  line-height: 1.12;
}

.keynote-content-item.is-active {
  color: var(--hebmu-primary-light);
}

.keynote-content-number {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  background: #808080;
  color: #ffffff;
  font-size: 34px;
  font-weight: 700;
  line-height: 1;
}

.keynote-content-item.is-active .keynote-content-number {
  background: var(--hebmu-primary-light);
}

.keynote-content-text {
  min-width: 0;
  overflow-wrap: anywhere;
}
</style>
