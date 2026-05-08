<template>
  <div class="slidev-layout cover" :style="coverStyle">
    <!-- Purple wave divider -->
    <div class="cover-wave">
      <svg
        viewBox="0 0 1440 320"
        preserveAspectRatio="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M0,192 C240,280 480,100 720,192 C960,280 1200,100 1440,192 L1440,320 L0,320 Z"
          fill="var(--hebmu-primary)"
        />
      </svg>
    </div>

    <!-- Text area -->
    <div class="cover-content">
      <slot />

      <!-- Course info line -->
      <div v-if="courseName || sessionNumber" class="cover-course-info">
        <span v-if="courseName" class="cover-course">{{ courseName }}</span>
        <span v-if="courseNameEn" class="cover-course-en">{{
          courseNameEn
        }}</span>
        <span v-if="sessionNumber" class="cover-session"
          >第 {{ sessionNumber }} 学时</span
        >
      </div>

      <!-- Author & date -->
      <div v-if="coverAuthors.length || coverDate" class="cover-meta">
        <p v-if="coverAuthors.length">
          <template v-for="(author, idx) in coverAuthors">
            <TextWithOptionalLink :link="coverAuthorUrls[idx]" :text="author" />
            <span v-if="idx < coverAuthors.length - 2">, </span>
            <span v-if="idx === coverAuthors.length - 2"> and </span>
          </template>
        </p>
        <p v-if="coverDate">
          {{ coverAuthors.length ? ` · ${coverDate}` : coverDate }}
        </p>
      </div>
    </div>

    <!-- University logo -->
    <div class="cover-logo">
      <img src="/logo-placeholder.svg" alt="University Logo" />
    </div>

    <!-- Background attribution -->
    <div class="cover-attribution" v-if="coverBackgroundSource">
      <TextWithOptionalLink
        :link="coverBackgroundSourceUrl"
        :text="coverBackgroundSource"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { handleBackground } from "../layout-helper";

const {
  coverAuthor: coverAuthorInput,
  coverAuthorUrl: coverAuthorUrlInput,
  coverBackgroundUrl,
  coverBackgroundSource,
  coverBackgroundSourceUrl,
  coverDate = new Date().toLocaleDateString(),
  courseName,
  courseNameEn,
  sessionNumber,
} = defineProps<{
  coverAuthor?: string | string[];
  coverAuthorUrl?: string | string[];
  coverBackgroundUrl?: string;
  coverBackgroundSource?: string;
  coverBackgroundSourceUrl?: string;
  coverDate?: string | Date;
  courseName?: string;
  courseNameEn?: string;
  sessionNumber?: number;
}>();

const toArray = (v: string | string[] | undefined): string[] => {
  if (Array.isArray(v)) return v;
  if (!v) return [];
  return [v];
};

const coverAuthors = computed(() => toArray(coverAuthorInput));
const coverAuthorUrls = computed(() => toArray(coverAuthorUrlInput));
const coverStyle = computed(() => handleBackground(coverBackgroundUrl, true));
</script>

<style scoped>
.cover {
  display: flex;
  position: relative;
  padding: 0;
}

.cover-wave {
  position: absolute;
  bottom: 0;
  left: 0;
  width: 100%;
  height: 55%;
  z-index: 1;
  pointer-events: none;
}

.cover-wave svg {
  position: absolute;
  bottom: 0;
  width: 100%;
  height: 100%;
}

.cover-content {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 2;
  padding: 2rem 3.5rem 4rem;
  color: #ffffff;
}

.cover-content :deep(h1) {
  color: #ffffff;
  font-size: 2.5rem;
  font-weight: 700;
  margin-bottom: 0.25rem;
  text-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
}

.cover-content :deep(h2) {
  color: rgba(255, 255, 255, 0.85);
  font-size: 1.25rem;
  font-weight: 400;
  margin-bottom: 0.5rem;
}

.cover-course-info {
  display: flex;
  gap: 0.75rem;
  font-size: 0.85rem;
  opacity: 0.8;
  margin-bottom: 0.5rem;
}

.cover-course {
  font-weight: 600;
}

.cover-session {
  background: rgba(255, 255, 255, 0.2);
  padding: 0.1rem 0.5rem;
  border-radius: 0.25rem;
  font-size: 0.8rem;
}

.cover-meta {
  font-size: 0.9rem;
  opacity: 0.75;
  margin-top: 0.25rem;
}

.cover-logo {
  position: absolute;
  bottom: 1.5rem;
  right: 2rem;
  z-index: 3;
}

.cover-logo img {
  width: 80px;
  height: 80px;
  border-radius: 50%;
  opacity: 0.9;
}

.cover-attribution {
  position: absolute;
  bottom: 0.25rem;
  right: 0.5rem;
  z-index: 3;
  font-size: 0.65rem;
  opacity: 0.5;
  color: #ffffff;
}
</style>
