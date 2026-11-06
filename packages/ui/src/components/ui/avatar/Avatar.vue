<script setup lang="ts">
import { computed } from "vue";
import { cn } from "../../../lib/utils";

interface Props {
  src?: string;
  name?: string;
  size?: "sm" | "md" | "lg" | "xl";
  class?: string;
  isOnline?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  size: "md",
  isOnline: false,
});

const sizeClasses = {
  sm: "h-8 w-8 text-xs",
  md: "h-10 w-10 text-sm",
  lg: "h-12 w-12 text-base",
  xl: "h-16 w-16 text-lg font-bold",
};

const initials = computed(() => {
  if (!props.name) return "?";
  const parts = props.name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0]?.substring(0, 2).toUpperCase() ?? "?";
  return `${parts[0]?.charAt(0) ?? ""}${parts[1]?.charAt(0) ?? ""}`.toUpperCase();
});

// Deterministic background color generator based on name
const backgroundHue = computed(() => {
  if (!props.name) return 210;
  let hash = 0;
  for (let i = 0; i < props.name.length; i++) {
    hash = props.name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash % 360);
});
</script>

<template>
  <div
    class="relative inline-block select-none"
    :class="cn(sizeClasses[size], props.class)"
  >
    <div
      v-if="!src"
      class="flex h-full w-full items-center justify-center rounded-full font-semibold text-white shadow-inner"
      :style="{ backgroundColor: `hsl(${backgroundHue}, 65%, 45%)` }"
    >
      {{ initials }}
    </div>
    <img
      v-else
      :src="src"
      :alt="name ?? 'Avatar'"
      class="h-full w-full rounded-full object-cover shadow-sm"
    />
    <span
      v-if="isOnline"
      class="absolute bottom-0 right-0 block h-2.5 w-2.5 rounded-full bg-success ring-2 ring-surface"
      title="Online"
    />
  </div>
</template>
