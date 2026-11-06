<script setup lang="ts">
import { cn } from "../../lib/utils";

interface Props {
  class?: string;
  count?: number;
}

withDefaults(defineProps<Props>(), {
  count: 1,
});
</script>

<template>
  <div class="space-y-3">
    <div
      v-for="i in count"
      :key="i"
      :class="cn('animate-pulse rounded-lg bg-surface-subtle', $props.class)"
    />
  </div>
</template>
