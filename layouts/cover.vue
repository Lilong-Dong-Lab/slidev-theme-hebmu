<template>
  <div class="slidev-layout keynote-cover">
    <div
      class="cover-photo"
      :style="{
        backgroundImage: `url('${resolveAssetUrl(
          coverBackgroundUrl ||
            $slidev.themeConfigs?.coverBackgroundUrl ||
            '/hebmu-assets/campus-cover.jpeg',
        )}')`,
      }"
    ></div>
    <svg
      class="cover-wave"
      viewBox="0 0 1024 768"
      preserveAspectRatio="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M0 455 C170 516 370 520 580 486 C752 458 890 406 1024 324 L1024 377 C832 492 622 545 394 558 C226 568 96 542 0 496 Z"
        fill="var(--hebmu-primary)"
        opacity="0.86"
      />
      <path
        d="M0 477 C184 536 386 535 598 503 C762 478 900 427 1024 352 L1024 768 L0 768 Z"
        fill="#ffffff"
      />
    </svg>

    <img
      class="cover-logo"
      :src="
        resolveAssetUrl(
          logoUrl ||
            $slidev.themeConfigs?.logoUrl ||
            '/hebmu-assets/hebmu-logo.png',
        )
      "
      alt="Hebei Medical University"
    />

    <div class="cover-title">
      <slot />
      <div
        v-if="courseName || courseNameEn || sessionNumber"
        class="cover-course"
      >
        <span v-if="courseName">{{ courseName }}</span>
        <span v-if="courseNameEn">{{ courseNameEn }}</span>
        <span v-if="sessionNumber">第 {{ sessionNumber }} 学时</span>
      </div>
    </div>

    <div v-if="coverAuthors.length || coverDate" class="cover-meta">
      <p v-if="coverAuthors.length">
        授课老师：
        <template v-for="(author, idx) in coverAuthors" :key="author">
          <a
            v-if="coverAuthorUrls[idx]"
            :href="coverAuthorUrls[idx]"
            rel="noreferrer"
            target="_blank"
          >
            {{ author }}
          </a>
          <span v-else>{{ author }}</span>
          <span v-if="idx < coverAuthors.length - 1">、</span>
        </template>
      </p>
      <p v-if="coverDate">课程时间： {{ coverDate }}</p>
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
    <div v-if="coverBackgroundSource" class="cover-attribution">
      <a
        v-if="coverBackgroundSourceUrl"
        :href="coverBackgroundSourceUrl"
        rel="noreferrer"
        target="_blank"
      >
        {{ coverBackgroundSource }}
      </a>
      <span v-else>{{ coverBackgroundSource }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { resolveAssetUrl } from "../layout-helper";

const {
  coverAuthor: coverAuthorInput,
  coverAuthorUrl: coverAuthorUrlInput,
  coverBackgroundSource,
  coverBackgroundSourceUrl,
  coverBackgroundUrl,
  coverDate,
  courseName,
  courseNameEn,
  logoUrl,
  sessionNumber,
} = defineProps<{
  coverAuthor?: string | string[];
  coverAuthorUrl?: string | string[];
  coverBackgroundSource?: string;
  coverBackgroundSourceUrl?: string;
  coverBackgroundUrl?: string;
  coverDate?: string | Date;
  courseName?: string;
  courseNameEn?: string;
  logoUrl?: string;
  sessionNumber?: number;
}>();

const toArray = (v: string | string[] | undefined): string[] => {
  if (Array.isArray(v)) return v;
  if (!v) return [];
  return [v];
};

const coverAuthors = computed(() => toArray(coverAuthorInput));
const coverAuthorUrls = computed(() => toArray(coverAuthorUrlInput));
</script>

<style scoped>
.keynote-cover {
  background: #ffffff;
}

.cover-photo {
  position: absolute;
  inset: 0 0 auto;
  height: 520px;
  background-position: center top;
  background-size: cover;
}

.cover-wave {
  position: absolute;
  inset: 0;
  width: 1024px;
  height: 768px;
}

.cover-logo {
  position: absolute;
  right: 62px;
  bottom: 88px;
  width: 136px;
  height: 136px;
  object-fit: contain;
}

.cover-title {
  position: absolute;
  left: 205px;
  right: 205px;
  bottom: 112px;
  color: var(--hebmu-primary);
  text-align: center;
}

.cover-title :deep(h1) {
  color: var(--hebmu-primary);
  font-size: 37px;
  font-weight: 700;
  line-height: 1.16;
  white-space: nowrap;
}

.cover-title :deep(h2) {
  margin-top: 8px;
  color: #808080;
  font-size: 21px;
  font-weight: 700;
  line-height: 1.2;
}

.cover-title :deep(p) {
  margin-top: 8px;
  color: #808080;
  font-size: 21px;
  font-weight: 700;
  line-height: 1.2;
}

.cover-course {
  display: flex;
  justify-content: center;
  gap: 12px;
  margin-top: 10px;
  color: #808080;
  font-size: 14px;
  font-weight: 700;
}

.cover-meta {
  position: absolute;
  left: 6px;
  bottom: 30px;
  color: #808080;
  font-size: 21px;
  font-weight: 700;
  line-height: 1.45;
}

.cover-attribution {
  position: absolute;
  right: 40px;
  bottom: 28px;
  color: #808080;
  font-size: 8px;
}
</style>
