<script setup lang="ts">
import { CloudOff } from "lucide-vue-next";
</script>

<template>
  <div
    class="flex items-center justify-center gap-2 bg-destructive/15 border-b border-destructive/20 py-1.5 px-4 text-xs font-medium text-destructive select-none"
    role="status"
  >
    <CloudOff class="h-3.5 w-3.5 shrink-0" />
    <span
      >You are currently offline. Outgoing messages are safely persisted in
      local storage.</span
    >
  </div>
</template>
