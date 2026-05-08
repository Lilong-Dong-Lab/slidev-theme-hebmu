import { defineShikiSetup } from "@slidev/types";

export default defineShikiSetup(async ({ highlighter }) => {
  return {
    theme: {
      dark: "one-dark-pro",
      light: "vitesse-light",
    },
  };
});
