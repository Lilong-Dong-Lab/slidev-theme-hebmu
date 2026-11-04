<template>
  <figure class="flex flex-col items-center justify-center">
    <img :alt="caption" class="max-h-full" :src="resolveUrl(url)" />
    <figcaption class="mt-3 text-center text-xs" v-if="caption">
      {{ caption }}
    </figcaption>
  </figure>
</template>

<script setup lang="ts">
import { resolveUrl } from "../layout-helper";

defineProps<{ caption?: string; url: string }>();
</script>
