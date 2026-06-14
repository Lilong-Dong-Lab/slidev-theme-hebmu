import { presetAttributify, presetIcons, presetWind3 } from "unocss";

/**
 * Theme-side UnoCSS escape hatch.
 *
 * Slidev auto-loads this via `loadSetups(roots, "unocss.ts", …)` and merges the
 * returned config into the deck's UnoCSS pipeline, so consuming decks gain
 * utility classes (grid, flex, gap, etc.) for composing one-off custom slides
 * without writing their own uno.config.
 *
 * NOTE: the default export MUST be a function. Slidev calls `mod.default(...args)`
 * at load time — an object export will crash.
 *
 * Fonts are intentionally NOT configured here: hebmu uses system fonts
 * (PingFang SC, etc.) and Slidev wires `theme.fontFamily.{sans,mono,serif}`
 * from the theme defaults.
 */
export default () => ({
  presets: [
    presetWind3({ dark: "class" }),
    presetAttributify(),
    presetIcons({
      prefix: "i-",
      extraProperties: {
        display: "inline-block",
        "vertical-align": "middle",
      },
    }),
  ],
});
