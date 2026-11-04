import { defineShikiSetup } from "@slidev/types";

// Light-only theme, but code panes use a dark VS Code palette for contrast.
// Test: light slides + dark-plus tokens (revert light to "vitesse-light" if unwanted).
export default defineShikiSetup(async () => {
  return {
    theme: {
      dark: "dark-plus",
      light: "dark-plus",
    },
  };
});
