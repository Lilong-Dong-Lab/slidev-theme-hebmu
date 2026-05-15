<template>
  <div class="slidev-layout cover keynote-cover">
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
    <WaveDivider />

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
