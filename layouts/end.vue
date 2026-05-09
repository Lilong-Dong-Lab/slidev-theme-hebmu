<template>
  <div class="slidev-layout keynote-end">
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
    <svg
      class="end-wave"
      viewBox="0 0 1024 768"
      preserveAspectRatio="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M0 472 C174 550 356 556 568 522 C754 492 900 432 1024 348 L1024 390 C840 514 610 590 372 582 C202 576 88 548 0 504 Z"
        fill="var(--hebmu-primary)"
        opacity="0.86"
      />
      <path
        d="M0 504 C178 574 394 574 608 534 C762 506 902 458 1024 390 L1024 768 L0 768 Z"
        fill="#ffffff"
      />
    </svg>

    <div class="end-message">
      <h1>{{ props.endMessage }}</h1>
      <p v-if="props.endMessageEn">{{ props.endMessageEn }}</p>
    </div>

    <div class="end-contact">
      <div class="end-contact-row">
        <span class="end-contact-icon">P</span>
        <strong>Presenter</strong>
        <span>{{ $slidev.themeConfigs?.footerAuthor || "董立龙" }}</span>
      </div>
      <div v-if="$slidev.themeConfigs?.footerTel" class="end-contact-row">
        <span class="end-contact-icon">T</span>
        <strong>Tel.</strong>
        <span>{{ $slidev.themeConfigs.footerTel }}</span>
      </div>
      <div class="end-contact-row">
        <span class="end-contact-icon">E</span>
        <strong>Email</strong>
        <a
          :href="`mailto:${$slidev.themeConfigs?.footerEmail || 'lilong.dong@hebmu.edu.cn'}`"
        >
          {{ $slidev.themeConfigs?.footerEmail || "lilong.dong@hebmu.edu.cn" }}
        </a>
      </div>
      <div class="end-contact-row">
        <span class="end-contact-icon">W</span>
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
import { resolveAssetUrl } from "../layout-helper";

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

<style scoped>
.keynote-end {
  background: #ffffff;
}

.end-photo {
  position: absolute;
  inset: 0 0 auto;
  height: 500px;
  background-position: center 40%;
  background-size: cover;
}

.end-wave {
  position: absolute;
  inset: 0;
  width: 1024px;
  height: 768px;
}

.end-message {
  position: absolute;
  left: 116px;
  bottom: 86px;
  width: 220px;
  color: var(--hebmu-primary);
  text-align: center;
  white-space: pre-line;
}

.end-message h1 {
  color: var(--hebmu-primary);
  font-size: 42px;
  font-weight: 700;
  line-height: 1.35;
}

.end-message p {
  margin-top: 8px;
  color: #808080;
  font-size: 18px;
  font-weight: 700;
}

.end-contact {
  position: absolute;
  left: 356px;
  right: 240px;
  bottom: 52px;
  display: grid;
  gap: 14px;
  color: #000000;
  font-size: 21px;
  line-height: 1.1;
}

.end-contact-row {
  display: grid;
  grid-template-columns: 34px 126px minmax(0, 1fr);
  align-items: center;
  gap: 14px;
}

.end-contact-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: var(--hebmu-primary);
  color: #ffffff;
  font-size: 18px;
  font-weight: 700;
}

.end-contact strong {
  font-weight: 700;
}

.end-contact a {
  color: var(--hebmu-info);
  text-decoration: underline;
}

.end-logo {
  position: absolute;
  right: 36px;
  bottom: 58px;
  width: 132px;
  height: 132px;
  object-fit: contain;
}

.end-slot-layer {
  position: relative;
  z-index: 10;
}
</style>
