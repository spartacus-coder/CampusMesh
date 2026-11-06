<script setup lang="ts">
import { MessageSquareDashed } from "lucide-vue-next";
import Button from "../ui/button/Button.vue";

interface Props {
  title?: string;
  description?: string;
  actionText?: string;
}

withDefaults(defineProps<Props>(), {
  title: "No Active Conversation",
  description:
    "Select a conversation from the sidebar or scan a peer QR code to start messaging.",
});

const emit = defineEmits<{
  (e: "action"): void;
}>();
</script>

<template>
  <div
    class="flex h-full w-full flex-col items-center justify-center p-8 text-center select-none"
  >
    <div
      class="flex h-16 w-16 items-center justify-center rounded-2xl bg-surface-subtle border border-borderSubtle text-textSecondary mb-4 shadow-sm"
    >
      <MessageSquareDashed class="h-8 w-8 text-textMuted" />
    </div>
    <h3 class="text-base font-semibold text-textPrimary mb-1">
      {{ title }}
    </h3>
    <p class="text-sm text-textSecondary max-w-sm mb-6 leading-relaxed">
      {{ description }}
    </p>
    <Button
      v-if="actionText"
      variant="default"
      size="sm"
      @click="emit('action')"
    >
      {{ actionText }}
    </Button>
  </div>
</template>
