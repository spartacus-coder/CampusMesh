<script setup lang="ts">
import { AlertTriangle, ShieldCheck } from "lucide-vue-next";

interface Props {
  quotaType?: "signaling" | "mailbox" | "pages";
}

withDefaults(defineProps<Props>(), {
  quotaType: "signaling",
});

const emit = defineEmits<{
  (e: "switchManual"): void;
}>();
</script>

<template>
  <div
    class="flex items-center justify-between gap-3 border-l-4 border-warning bg-warning/10 p-3 text-xs text-textPrimary shadow-sm"
    role="alert"
  >
    <div class="flex items-center gap-2">
      <AlertTriangle class="h-4 w-4 shrink-0 text-warning" />
      <div>
        <span class="font-semibold text-warning"
          >Zero-Cost Budget Guard Active:</span
        >
        <span class="ml-1 text-textSecondary">
          Free cloud coordination quota reached. All paid escalations are
          blocked. Local messages remain queued.
        </span>
      </div>
    </div>
    <div class="flex items-center gap-2">
      <button
        class="inline-flex items-center gap-1 rounded bg-surface px-2.5 py-1 text-xs font-medium text-textPrimary border border-border hover:bg-surface-hover shadow-xs transition-colors"
        @click="emit('switchManual')"
      >
        <ShieldCheck class="h-3.5 w-3.5 text-primary" />
        Use Manual Token
      </button>
    </div>
  </div>
</template>
