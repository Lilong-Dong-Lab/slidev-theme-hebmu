<template>
  <div class="keynote-chrome" aria-hidden="true">
    <div class="keynote-header-band"></div>
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
      </defs>
      <path
        class="keynote-wave-muted"
        d="M0 0 H1024 V84 C820 70 570 64 360 78 C196 90 82 108 0 116 Z"
        style="fill: url(#keynote-header-gradient)"
      />
      <path
        class="keynote-wave-accent"
        d="M0 116 C106 100 220 88 372 78 C226 94 98 116 0 136 Z"
        style="fill: url(#keynote-purple-fade)"
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
