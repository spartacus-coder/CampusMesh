/**
 * Design tokens and UI themes for CampusMesh
 */

export const THEME_COLORS = {
  dark: {
    background: "#0B0F17",
    surface: "#111827",
    surfaceHover: "#1F2937",
    primary: "#3B82F6",
    primaryHover: "#2563EB",
    textPrimary: "#F9FAFB",
    textSecondary: "#9CA3AF",
    border: "#1F2937",
  },
  light: {
    background: "#FFFFFF",
    surface: "#F9FAFB",
    surfaceHover: "#F3F4F6",
    primary: "#2563EB",
    primaryHover: "#1D4ED8",
    textPrimary: "#111827",
    textSecondary: "#6B7280",
    border: "#E5E7EB",
  },
} as const;

export type ThemeMode = "dark" | "light" | "system";
