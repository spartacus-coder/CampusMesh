<script setup lang="ts">
import { ref, computed } from "vue";
import { useChatStore } from "../stores/chat";
import { useNetworkStore } from "../stores/network";
import {
  Lock,
  Send,
  Paperclip,
  Mic,
  ChevronLeft,
  Info,
  Check,
  CheckCheck,
  Clock,
  ShieldCheck,
  Radio,
} from "lucide-vue-next";
import {
  Avatar,
  Button,
  Input,
  EmptyState,
  Badge,
  ConnectionStatusBar,
} from "@campusmesh/ui";
import { DeliveryState } from "@campusmesh/shared-types";
import ManualSignalingModal from "../components/ManualSignalingModal.vue";

const chatStore = useChatStore();
const networkStore = useNetworkStore();

const inputText = ref("");
const isDetailsOpen = ref(false);
const showManualSignalModal = ref(false);

const activeConversation = computed(() => {
  return chatStore.conversations.find(
    (c) => c.id === chatStore.activeConversationId,
  );
});

// Sample timeline messages demonstrating the 6 delivery states
const sampleMessages = ref([
  {
    id: "m1",
    sender: "Alice",
    isMe: false,
    text: "Hey! Are you connected directly over WebRTC DataChannel?",
    timestamp: "10:42 AM",
    state: DeliveryState.READ,
  },
  {
    id: "m2",
    sender: "You",
    isMe: true,
    text: "Yes! Direct P2P connection established. Zero plaintext passed through signaling.",
    timestamp: "10:43 AM",
    state: DeliveryState.READ,
  },
  {
    id: "m3",
    sender: "Alice",
    isMe: false,
    text: "Awesome. End-to-end encrypted with forward secrecy.",
    timestamp: "10:44 AM",
    state: DeliveryState.DELIVERED,
  },
  {
    id: "m4",
    sender: "You",
    isMe: true,
    text: "Testing responsive layout and PWA shell on Phase 1 branch.",
    timestamp: "10:45 AM",
    state: DeliveryState.SENT,
  },
]);

function handleSendMessage() {
  if (!inputText.value.trim()) return;
  sampleMessages.value.push({
    id: `m_${Date.now()}`,
    sender: "You",
    isMe: true,
    text: inputText.value.trim(),
    timestamp: new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    }),
    state: networkStore.isOnline
      ? DeliveryState.DELIVERED
      : DeliveryState.SAVED_LOCALLY,
  });
  inputText.value = "";
}
</script>

<template>
  <div v-if="!activeConversation" class="h-full w-full">
    <EmptyState
      title="No Conversation Selected"
      description="Choose a conversation from the sidebar or start a new encrypted P2P session."
      action-text="Browse Contacts"
      @action="$router.push('/contacts')"
    />
  </div>

  <div v-else class="flex h-full w-full overflow-hidden relative">
    <!-- Main Chat Column -->
    <div class="flex-1 flex flex-col h-full overflow-hidden bg-background">
      <!-- Active Chat Header -->
      <header
        class="flex h-16 items-center justify-between border-b border-border bg-surface px-4 shrink-0 z-10"
      >
        <div class="flex items-center gap-3 min-w-0">
          <!-- Back button on mobile -->
          <Button
            variant="ghost"
            size="iconSm"
            class="md:hidden -ml-1 text-textSecondary"
            @click="chatStore.selectConversation(null)"
          >
            <ChevronLeft class="h-5 w-5" />
          </Button>

          <Avatar
            :name="activeConversation.name"
            size="md"
            :is-online="!activeConversation.isGroup"
          />

          <div class="min-w-0">
            <div class="flex items-center gap-2">
              <h2 class="text-sm font-semibold text-textPrimary truncate">
                {{ activeConversation.name }}
              </h2>
              <span
                class="inline-flex items-center gap-1 text-[11px] font-medium text-success bg-success/10 px-1.5 py-0.5 rounded"
              >
                <Lock class="h-3 w-3" />
                E2EE
              </span>
            </div>
            <p class="text-xs text-textSecondary truncate">
              {{
                activeConversation.isGroup
                  ? "4 active peers in mesh"
                  : "Safety Number Verified"
              }}
            </p>
          </div>
        </div>

        <!-- Header Actions -->
        <div class="flex items-center gap-1">
          <Button
            variant="ghost"
            size="iconSm"
            title="Manual P2P Connect (Offline / Air-Gapped)"
            class="text-textSecondary hover:text-primary"
            @click="showManualSignalModal = true"
          >
            <Radio class="h-4 w-4" />
          </Button>

          <Button
            variant="ghost"
            size="iconSm"
            title="Inspect Verification & Details"
            :class="{ 'bg-surface-hover text-primary': isDetailsOpen }"
            @click="isDetailsOpen = !isDetailsOpen"
          >
            <Info class="h-4 w-4" />
          </Button>
        </div>
      </header>

      <!-- Connection Status Bar for active session -->
      <ConnectionStatusBar
        :signaling-state="networkStore.signalingState"
        :peer-state="networkStore.peerState"
        :is-direct-lan="networkStore.isDirectLan"
      />

      <!-- Message History Viewport -->
      <div class="flex-1 overflow-y-auto p-4 space-y-4">
        <!-- E2EE Security Notice Card -->
        <div
          class="mx-auto max-w-sm rounded-xl border border-primary/20 bg-primary/5 p-3 text-center text-xs text-textSecondary select-none"
        >
          <ShieldCheck class="mx-auto h-5 w-5 text-primary mb-1" />
          <p class="font-medium text-textPrimary">
            Messages are end-to-end encrypted
          </p>
          <p class="text-[11px] text-textMuted mt-0.5">
            Only you and the participants can read them. No central server
            handles plaintext.
          </p>
        </div>

        <!-- Chat Bubble Stream -->
        <div
          v-for="msg in sampleMessages"
          :key="msg.id"
          class="flex flex-col"
          :class="msg.isMe ? 'items-end' : 'items-start'"
        >
          <div class="flex items-end gap-2 max-w-[80%] md:max-w-[70%]">
            <div
              class="rounded-2xl px-4 py-2.5 shadow-xs text-sm"
              :class="
                msg.isMe
                  ? 'bg-primary text-white rounded-br-xs'
                  : 'bg-surface text-textPrimary border border-borderSubtle rounded-bl-xs'
              "
            >
              <p class="break-words leading-relaxed">{{ msg.text }}</p>
              <div
                class="flex items-center justify-end gap-1 text-[10px] mt-1 select-none"
                :class="msg.isMe ? 'text-white/80' : 'text-textMuted'"
              >
                <span>{{ msg.timestamp }}</span>
                <!-- 6-State Delivery Indicator Icons -->
                <Clock
                  v-if="msg.isMe && msg.state === DeliveryState.SAVED_LOCALLY"
                  class="h-3 w-3 text-warning"
                  title="Saved locally"
                />
                <Check
                  v-else-if="msg.isMe && msg.state === DeliveryState.SENT"
                  class="h-3 w-3 text-white/70"
                  title="Sent to peer"
                />
                <CheckCheck
                  v-else-if="msg.isMe && msg.state === DeliveryState.DELIVERED"
                  class="h-3 w-3 text-white/90"
                  title="Delivered"
                />
                <CheckCheck
                  v-else-if="msg.isMe && msg.state === DeliveryState.READ"
                  class="h-3 w-3 text-sky-200"
                  title="Read"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Message Composer Bar -->
      <footer class="p-3 border-t border-border bg-surface shrink-0 z-10">
        <form
          class="flex items-center gap-2 max-w-4xl mx-auto"
          @submit.prevent="handleSendMessage"
        >
          <Button
            type="button"
            variant="ghost"
            size="iconSm"
            title="Attach File (Direct P2P)"
            class="text-textSecondary"
          >
            <Paperclip class="h-4 w-4" />
          </Button>

          <Input
            v-model="inputText"
            placeholder="Type an encrypted message..."
            class="flex-1 bg-background h-10 text-sm"
          />

          <Button
            type="button"
            variant="ghost"
            size="iconSm"
            title="Record Voice Note"
            class="text-textSecondary"
          >
            <Mic class="h-4 w-4" />
          </Button>

          <Button
            type="submit"
            variant="default"
            size="iconSm"
            :disabled="!inputText.trim()"
            title="Send"
          >
            <Send class="h-4 w-4" />
          </Button>
        </form>
      </footer>
    </div>

    <!-- Expandable Right Inspection Drawer (Desktop) -->
    <aside
      v-if="isDetailsOpen"
      class="hidden lg:flex w-72 flex-col border-l border-border bg-surface p-4 shrink-0 overflow-y-auto animate-in slide-in-from-right duration-200"
    >
      <div
        class="flex flex-col items-center text-center pb-6 border-b border-border"
      >
        <Avatar :name="activeConversation.name" size="xl" class="mb-3" />
        <h3 class="text-base font-bold text-textPrimary">
          {{ activeConversation.name }}
        </h3>
        <p class="text-xs text-textMuted mt-1">Direct Peer Identity</p>
      </div>

      <div class="py-4 border-b border-border space-y-3">
        <h4
          class="text-xs font-semibold text-textMuted uppercase tracking-wider"
        >
          Cryptographic Verification
        </h4>
        <div
          class="rounded-lg bg-surface-subtle p-3 border border-borderSubtle"
        >
          <span class="text-[11px] text-textMuted block mb-1"
            >Safety Number (Fingerprint)</span
          >
          <p
            class="font-mono text-xs text-primary font-semibold tracking-wider break-all"
          >
            4920 1849 2049 8291 9301 8492
          </p>
        </div>
        <Badge variant="success" class="w-full justify-center py-1">
          ✓ Verified Identity Key
        </Badge>
      </div>

      <div class="py-4 space-y-2">
        <h4
          class="text-xs font-semibold text-textMuted uppercase tracking-wider"
        >
          Session Diagnostics
        </h4>
        <div class="text-xs text-textSecondary space-y-1">
          <p>
            <span class="text-textMuted">Transport:</span> WebRTC DataChannel
          </p>
          <p>
            <span class="text-textMuted">Encryption:</span> Double Ratchet (FS +
            PCS)
          </p>
          <p>
            <span class="text-textMuted">Signaling:</span> Cloudflare DO
            (Partitioned)
          </p>
        </div>
      </div>
    </aside>

    <ManualSignalingModal
      v-if="showManualSignalModal"
      @close="showManualSignalModal = false"
    />
  </div>
</template>
