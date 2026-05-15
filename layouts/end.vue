<template>
  <div class="slidev-layout end keynote-end">
    <div
      class="end-photo"
      :style="{
        backgroundImage: `url('${resolveAssetUrl(
          props.endBackgroundUrl ||
            $slidev.themeConfigs?.endBackgroundUrl ||
            '/hebmu-assets/campus-end.jpeg',
        )}')`,
      }"
    ></div>
    <WaveDivider />

    <div class="end-message">
      <h1>{{ props.endMessage }}</h1>
      <p v-if="props.endMessageEn">{{ props.endMessageEn }}</p>
    </div>

    <div class="end-contact">
      <div class="end-contact-row">
        <span class="end-contact-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24">
            <path d="M18 20a6 6 0 0 0-12 0" />
            <circle cx="12" cy="8" r="4" />
          </svg>
        </span>
        <strong>Presenter</strong>
        <span>{{ $slidev.themeConfigs?.footerAuthor || "董立龙" }}</span>
      </div>
      <div v-if="$slidev.themeConfigs?.footerTel" class="end-contact-row">
        <span class="end-contact-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24">
            <path
              d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.4 19.4 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 2 .7 2.8a2 2 0 0 1-.4 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7A2 2 0 0 1 22 16.9Z"
            />
          </svg>
        </span>
        <strong>Tel.</strong>
        <span>{{ $slidev.themeConfigs.footerTel }}</span>
      </div>
      <div class="end-contact-row">
        <span class="end-contact-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24">
            <rect x="3" y="5" width="18" height="14" rx="2" />
            <path d="m3 7 9 6 9-6" />
          </svg>
        </span>
        <strong>Email</strong>
        <a
          :href="`mailto:${$slidev.themeConfigs?.footerEmail || 'lilong.dong@hebmu.edu.cn'}`"
        >
          {{ $slidev.themeConfigs?.footerEmail || "lilong.dong@hebmu.edu.cn" }}
        </a>
      </div>
      <div class="end-contact-row">
        <span class="end-contact-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24">
            <path
              d="M10.5 15.5c-4.2 0-7.5-2.7-7.5-6s3.3-6 7.5-6 7.5 2.7 7.5 6-3.3 6-7.5 6Z"
            />
            <path d="m7.5 15-2.2 2 .7-3" />
            <path
              d="M14 13.4c1 2 3.5 3.4 6.2 3.4.4 0 .8 0 1.2-.1l-.5 2.3-1.7-1.5"
            />
            <path d="M16.9 8.1c2.4.6 4.1 2.2 4.1 4.2 0 1.5-1 2.9-2.5 3.6" />
            <path d="M8 8.2h.1" />
            <path d="M13 8.2h.1" />
          </svg>
        </span>
        <strong>Wechat</strong>
        <span>{{
          $slidev.themeConfigs?.footerWechat || "donglilonghugo"
        }}</span>
      </div>
    </div>

    <img
      class="end-logo"
      :src="
        resolveAssetUrl(
          props.logoUrl ||
            $slidev.themeConfigs?.logoUrl ||
            '/hebmu-assets/hebmu-logo.png',
        )
      "
      alt="Hebei Medical University"
    />
    <div class="end-slot-layer">
      <slot />
    </div>
    <Pagination
      v-if="
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
import { type ThemeConfigs, resolveAssetUrl } from "../layout-helper";

const props = withDefaults(
  defineProps<{
    endBackgroundUrl?: string;
    endMessage?: string;
    endMessageEn?: string;
    logoUrl?: string;
  }>(),
  {
    endMessage: "谢谢聆听\n下课",
    endMessageEn: "",
  },
);
</script>
