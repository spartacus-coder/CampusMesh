import type { Config } from "tailwindcss";

export const campusMeshPreset: Partial<Config> = {
  darkMode: ["class"],
  theme: {
    extend: {
      colors: {
        background: "var(--cm-background)",
        surface: "var(--cm-surface)",
        "surface-subtle": "var(--cm-surface-subtle)",
        "surface-hover": "var(--cm-surface-hover)",
        "surface-active": "var(--cm-surface-active)",
        border: "var(--cm-border)",
        "border-subtle": "var(--cm-border-subtle)",
        borderSubtle: "var(--cm-border-subtle)",
        textPrimary: "var(--cm-text-primary)",
        textSecondary: "var(--cm-text-secondary)",
        textMuted: "var(--cm-text-muted)",
        primary: {
          DEFAULT: "var(--cm-primary)",
          hover: "var(--cm-primary-hover)",
          foreground: "var(--cm-primary-foreground)",
        },
        muted: {
          DEFAULT: "var(--cm-surface-subtle)",
          foreground: "var(--cm-text-muted)",
        },
        accent: {
          DEFAULT: "var(--cm-accent)",
          foreground: "#FFFFFF",
        },
        destructive: {
          DEFAULT: "var(--cm-destructive)",
          foreground: "#FFFFFF",
        },
        success: {
          DEFAULT: "var(--cm-success)",
          foreground: "#FFFFFF",
        },
        warning: {
          DEFAULT: "var(--cm-warning)",
          foreground: "#FFFFFF",
        },
      },
      borderRadius: {
        lg: "var(--radius, 0.625rem)",
        md: "calc(var(--radius, 0.625rem) - 2px)",
        sm: "calc(var(--radius, 0.625rem) - 4px)",
      },
    },
  },
};
