<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from "vue";
import {
  Search,
  UserPlus,
  Users,
  Settings,
  Shield,
  QrCode,
} from "lucide-vue-next";

interface Props {
  isOpen: boolean;
}

const props = defineProps<Props>();
const emit = defineEmits<{
  (e: "update:isOpen", value: boolean): void;
  (e: "navigate", route: string): void;
}>();

const query = ref("");

const commands = [
  {
    id: "new-chat",
    label: "Start New Direct Chat",
    icon: UserPlus,
    route: "/contacts/new",
  },
  {
    id: "new-group",
    label: "Create New Study Group",
    icon: Users,
    route: "/groups/new",
  },
  {
    id: "scan-qr",
    label: "Scan Peer Identity QR Code",
    icon: QrCode,
    route: "/scan",
  },
  {
    id: "security",
    label: "Security & Encryption Settings",
    icon: Shield,
    route: "/settings/security",
  },
  {
    id: "settings",
    label: "Preferences & Storage Management",
    icon: Settings,
    route: "/settings",
  },
];

const filteredCommands = computed(() => {
  if (!query.value.trim()) return commands;
  const q = query.value.toLowerCase();
  return commands.filter((c) => c.label.toLowerCase().includes(q));
});

function handleSelect(route: string) {
  emit("navigate", route);
  emit("update:isOpen", false);
  query.value = "";
}

function handleKeyDown(e: KeyboardEvent) {
  if ((e.metaKey || e.ctrlKey) && e.key === "k") {
    e.preventDefault();
    emit("update:isOpen", !props.isOpen);
  }
  if (e.key === "Escape" && props.isOpen) {
    emit("update:isOpen", false);
  }
}

onMounted(() => {
  window.addEventListener("keydown", handleKeyDown);
});

onUnmounted(() => {
  window.removeEventListener("keydown", handleKeyDown);
});
</script>

<template>
  <div
    v-if="isOpen"
    class="fixed inset-0 z-50 flex items-start justify-center pt-24 px-4 bg-black/60 backdrop-blur-xs select-none"
    @click.self="emit('update:isOpen', false)"
  >
    <div
      class="w-full max-w-lg rounded-xl border border-border bg-surface shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150"
    >
      <div class="flex items-center border-b border-border px-3">
        <Search class="h-4 w-4 shrink-0 text-textMuted mr-2" />
        <input
          v-model="query"
          type="text"
          placeholder="Type a command or search conversations..."
          class="h-12 w-full bg-transparent text-sm text-textPrimary placeholder:text-textMuted focus:outline-none"
          autofocus
        />
        <kbd
          class="rounded bg-surface-subtle border border-borderSubtle px-1.5 py-0.5 text-[10px] font-mono text-textMuted"
        >
          ESC
        </kbd>
      </div>

      <div class="max-h-72 overflow-y-auto p-2">
        <div
          v-if="filteredCommands.length === 0"
          class="py-6 text-center text-xs text-textMuted"
        >
          No matching commands found.
        </div>
        <button
          v-for="cmd in filteredCommands"
          :key="cmd.id"
          class="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-textPrimary hover:bg-surface-hover transition-colors text-left"
          @click="handleSelect(cmd.route)"
        >
          <component
            :is="cmd.icon"
            class="h-4 w-4 text-textSecondary shrink-0"
          />
          <span>{{ cmd.label }}</span>
        </button>
      </div>
    </div>
  </div>
</template>
