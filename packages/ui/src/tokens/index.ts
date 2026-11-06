/**
 * CampusMesh Tokenized Design System
 * Supports Premium Dark, Clean Light, and Accessible High-Contrast themes.
 */

export const COLOR_TOKENS = {
  dark: {
    background: "#0B0F17",
    surface: "#111827",
    surfaceSubtle: "#182234",
    surfaceHover: "#1F293D",
    surfaceActive: "#26344D",
    border: "#1F293D",
    borderSubtle: "#162030",
    primary: "#3B82F6",
    primaryHover: "#2563EB",
    primaryForeground: "#FFFFFF",
    textPrimary: "#F9FAFB",
    textSecondary: "#9CA3AF",
    textMuted: "#6B7280",
    accent: "#8B5CF6",
    destructive: "#EF4444",
    success: "#10B981",
    warning: "#F59E0B",
  },
  light: {
    background: "#F8FAFC",
    surface: "#FFFFFF",
    surfaceSubtle: "#F1F5F9",
    surfaceHover: "#E2E8F0",
    surfaceActive: "#CBD5E1",
    border: "#E2E8F0",
    borderSubtle: "#F1F5F9",
    primary: "#2563EB",
    primaryHover: "#1D4ED8",
    primaryForeground: "#FFFFFF",
    textPrimary: "#0F172A",
    textSecondary: "#475569",
    textMuted: "#94A3B8",
    accent: "#7C3AED",
    destructive: "#DC2626",
    success: "#059669",
    warning: "#D97706",
  },
  highContrast: {
    background: "#000000",
    surface: "#0A0A0A",
    surfaceSubtle: "#141414",
    surfaceHover: "#262626",
    surfaceActive: "#404040",
    border: "#FFFFFF",
    borderSubtle: "#A3A3A3",
    primary: "#60A5FA",
    primaryHover: "#93C5FD",
    primaryForeground: "#000000",
    textPrimary: "#FFFFFF",
    textSecondary: "#E5E5E5",
    textMuted: "#D4D4D4",
    accent: "#C084FC",
    destructive: "#F87171",
    success: "#34D399",
    warning: "#FBBF24",
  },
} as const;

export const MOTION_TOKENS = {
  durationFast: "150ms",
  durationNormal: "250ms",
  durationSlow: "400ms",
  easingStandard: "cubic-bezier(0.4, 0.0, 0.2, 1)",
} as const;

export const BREAKPOINTS = {
  sm: "640px",
  md: "768px",
  lg: "1024px",
  xl: "1280px",
  "2xl": "1536px",
} as const;
