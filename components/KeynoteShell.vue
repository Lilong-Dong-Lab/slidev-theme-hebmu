<template>
  <div
    class="slidev-layout keynote-layout"
    :class="[layoutClass, density === 'compact' && 'keynote-density-compact']"
  >
    <KeynoteChrome
      :hide-footer="hideFooter"
      :hide-logo="hideLogo"
      :hide-page="hidePage"
      :hide-wave="hideWave"
    />
    <!-- SlideTitle inspects slot VNodes to extract h1 text; it does not render DOM from this slot -->
    <SlideTitle
      v-if="!hideTitle"
      :auto-title="autoSlideTitle"
      :title="slideTitle"
    >
      <slot />
    </SlideTitle>
    <main
      class="keynote-stage"
      :class="[
        stageClass,
        {
          'is-unframed': hideFrame,
          'keynote-stage-title-auto': shouldAutoPromoteTitle,
        },
      ]"
    >
      <slot />
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";

type ClassValue =
  | string
  | Record<string, boolean>
  | Array<string | Record<string, boolean> | false | undefined>;

const props = withDefaults(
  defineProps<{
    autoSlideTitle?: boolean;
    density?: "normal" | "compact";
    hideFooter?: boolean;
    hideFrame?: boolean;
    hideLogo?: boolean;
    hidePage?: boolean;
    hideTitle?: boolean;
    hideWave?: boolean;
    layoutClass?: ClassValue;
    slideTitle?: string;
    stageClass?: ClassValue;
  }>(),
  {
    autoSlideTitle: true,
    density: "normal",
    hideFooter: false,
    hideFrame: false,
    hideLogo: false,
    hidePage: false,
    hideTitle: true,
    hideWave: false,
    layoutClass: "",
    stageClass: "",
  },
);

const normalizeTitle = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";

const explicitSlideTitle = computed(() => normalizeTitle(props.slideTitle));
const shouldAutoPromoteTitle = computed(
  () => !props.hideTitle && props.autoSlideTitle && !explicitSlideTitle.value,
);
</script>
