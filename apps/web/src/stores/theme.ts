import { defineStore } from "pinia";
import { ref } from "vue";

export type ThemePreference = "dark" | "light" | "high-contrast" | "system";

export const useThemeStore = defineStore("theme", () => {
  const isBrowser =
    typeof window !== "undefined" && typeof localStorage !== "undefined";

  const currentTheme = ref<ThemePreference>(
    (isBrowser
      ? (localStorage.getItem("cm-theme") as ThemePreference)
      : null) || "dark",
  );

  function applyTheme(theme: ThemePreference) {
    currentTheme.value = theme;
    if (isBrowser) {
      localStorage.setItem("cm-theme", theme);
      const root = document.documentElement;
      root.classList.remove("dark", "light", "high-contrast");

      if (theme === "system") {
        const prefersDark = window.matchMedia(
          "(prefers-color-scheme: dark)",
        ).matches;
        root.classList.add(prefersDark ? "dark" : "light");
      } else {
        root.classList.add(theme);
      }
    }
  }

  function initTheme() {
    applyTheme(currentTheme.value);
  }

  function toggleTheme() {
    const next: Record<ThemePreference, ThemePreference> = {
      dark: "light",
      light: "high-contrast",
      "high-contrast": "dark",
      system: "dark",
    };
    applyTheme(next[currentTheme.value] || "dark");
  }

  return {
    currentTheme,
    applyTheme,
    initTheme,
    toggleTheme,
  };
});
