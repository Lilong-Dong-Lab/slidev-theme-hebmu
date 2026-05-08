import { defineShikiSetup } from "@slidev/types";

export default defineShikiSetup(async ({ highlighter }) => {
  return {
    theme: {
      dark: "one-dark-pro",
      default: "vitesse-light",
    },
  };
});
