<template>
  <div class="keynote-chrome" aria-hidden="true">
    <div v-if="hideWave" class="keynote-header-band"></div>
    <svg
      v-if="!hideWave"
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
      v-if="!hideLogo"
      class="keynote-logo"
      :src="
        resolveAssetUrl(
          $slidev.themeConfigs?.logoUrl || '/hebmu-assets/hebmu-logo.png',
        )
      "
      alt=""
    />
    <footer v-if="!hideFooter" class="keynote-footer">
      <span class="keynote-footer-dept">
        {{
          $slidev.themeConfigs?.footerDepartment ||
          "河北医科大学 基础医学院 医药信息学教研室"
        }}
      </span>
      <span class="keynote-footer-contact">
        {{ $slidev.themeConfigs?.footerAuthor || "董立龙" }} | Email
        <a
          :href="`mailto:${$slidev.themeConfigs?.footerEmail || 'lilong.dong@hebmu.edu.cn'}`"
        >
          {{ $slidev.themeConfigs?.footerEmail || "lilong.dong@hebmu.edu.cn" }}
        </a>
        | Wechat
        {{ $slidev.themeConfigs?.footerWechat || "donglilonghugo" }}
      </span>
    </footer>
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
import { resolveAssetUrl } from "../layout-helper";

withDefaults(
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
</script>
