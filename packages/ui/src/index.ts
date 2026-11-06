/**
 * @campusmesh/ui
 * Tokenized design system, themes, and accessible primitives for CampusMesh
 */

export * from "./tokens/index";
export * from "./lib/utils";
export * from "./tailwind-preset";

// UI Primitives
export { default as Button } from "./components/ui/button/Button.vue";
export { default as Input } from "./components/ui/input/Input.vue";
export { default as Badge } from "./components/ui/badge/Badge.vue";
export { default as Avatar } from "./components/ui/avatar/Avatar.vue";

// Scoped UX State Components
export { default as ConnectionStatusBar } from "./components/states/ConnectionStatusBar.vue";
export { default as QuotaAlertBanner } from "./components/states/QuotaAlertBanner.vue";
export { default as OfflineBanner } from "./components/states/OfflineBanner.vue";
export { default as LoadingSkeleton } from "./components/states/LoadingSkeleton.vue";
export { default as EmptyState } from "./components/states/EmptyState.vue";

// Navigation & Actions
export { default as CommandPalette } from "./components/navigation/CommandPalette.vue";
