<template>
  <div class="keynote-chrome" aria-hidden="true">
    <div v-if="props.hideWave" class="keynote-header-band"></div>
    <svg
      v-if="!props.hideWave"
      class="keynote-wave"
      viewBox="0 0 1024 768"
      preserveAspectRatio="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient
          id="keynote-header-gradient"
          x1="0"
          y1="0"
          x2="1024"
          y2="0"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stop-color="#eeeeee" />
          <stop offset="0.5" stop-color="#f7f7f7" />
          <stop offset="1" stop-color="#eeeeee" />
        </linearGradient>
        <linearGradient
          id="keynote-purple-fade"
          x1="0"
          y1="0"
          x2="380"
          y2="0"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stop-color="#8f55ad" />
          <stop offset="0.72" stop-color="#8f55ad" />
          <stop offset="1" stop-color="#8f55ad" stop-opacity="0" />
        </linearGradient>
        <linearGradient
          id="keynote-purple-fade-reverse"
          x1="644"
          y1="0"
          x2="1024"
          y2="0"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stop-color="#8f55ad" stop-opacity="0" />
          <stop offset="0.28" stop-color="#8f55ad" />
          <stop offset="1" stop-color="#8f55ad" />
        </linearGradient>
      </defs>
      <path
        class="keynote-wave-muted"
        d="M0 0 H1024 V96 C840 73 612 68 392 82 C226 94 88 102 0 116 Z"
        style="fill: url(#keynote-header-gradient)"
      />
      <path
        class="keynote-wave-accent"
        d="M0 116 C88 102 226 94 392 82 C236 98 98 116 0 136 Z"
        style="fill: url(#keynote-purple-fade)"
      />
      <path
        class="keynote-wave-muted"
        d="M0 728 C238 742 468 746 646 736 C804 727 930 716 1024 704 V768 H0 Z"
        style="fill: url(#keynote-header-gradient)"
      />
      <path
        class="keynote-wave-accent"
        d="M646 736 C804 727 930 716 1024 704 V720 C922 729 786 740 646 736 Z"
        style="fill: url(#keynote-purple-fade-reverse)"
      />
    </svg>
    <img
      v-if="!props.hideLogo"
      class="keynote-logo"
      :src="resolveAssetUrl(logoUrl)"
      alt=""
    />
    <footer v-if="showFooter" class="keynote-footer" :class="footerModeClass">
      <span class="keynote-footer-dept">
        {{ footerDepartment }}
      </span>
      <span v-if="footerMode === 'full'" class="keynote-footer-contact">
        {{ footerAuthor }} | Email
        <a :href="`mailto:${footerEmail}`">{{ footerEmail }}</a>
        | Wechat {{ footerWechat }}
      </span>
    </footer>
    <Pagination
      v-if="!props.hidePage && !paginationDisabled"
      :x="paginationX"
      :y="paginationY"
    />
  </div>
</template>

<script setup lang="ts">
import { useSlideContext } from "@slidev/client";
import { computed } from "vue";
import {
  type FooterMode,
  type ThemeConfigs,
  resolveAssetUrl,
} from "../layout-helper";

const props = withDefaults(
  defineProps<{
    hideFooter?: boolean;
    hideLogo?: boolean;
    hidePage?: boolean;
    hideWave?: boolean;
  }>(),
  {
    hideFooter: false,
    hideLogo: false,
    hidePage: false,
    hideWave: false,
  },
);

const { $slidev } = useSlideContext();

const themeConfigs = computed(
  () => ($slidev.themeConfigs || {}) as ThemeConfigs,
);

const footerMode = computed<FooterMode>(() => {
  const mode = themeConfigs.value.footerMode;
  if (mode === "full" || mode === "none") return mode;
  return "compact";
});

const footerModeClass = computed(() => `keynote-footer-${footerMode.value}`);
const showFooter = computed(
  () => !props.hideFooter && footerMode.value !== "none",
);

const logoUrl = computed(
  () => themeConfigs.value.logoUrl || "/hebmu-assets/hebmu-logo.png",
);
const footerDepartment = computed(
  () =>
    themeConfigs.value.footerDepartment ||
    "河北医科大学 基础医学院 医药信息学教研室",
);
const footerAuthor = computed(
  () => themeConfigs.value.footerAuthor || "董立龙",
);
const footerEmail = computed(
  () => themeConfigs.value.footerEmail || "lilong.dong@hebmu.edu.cn",
);
const footerWechat = computed(
  () => themeConfigs.value.footerWechat || "donglilonghugo",
);
const paginationX = computed(() => themeConfigs.value.paginationX || "r");
const paginationY = computed(() => themeConfigs.value.paginationY || "b");
const paginationDisabled = computed(() =>
  (themeConfigs.value.paginationPagesDisabled || []).includes(
    $slidev.nav.currentPage,
  ),
);
</script>
