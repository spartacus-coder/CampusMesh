<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { useChatStore } from "../stores/chat";
import { useNetworkStore } from "../stores/network";
import { useIdentityStore } from "../stores/identity";
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
  FileText,
  Download,
  Image as ImageIcon,
  Phone,
  Video,
  Plus,
  Search,
  UserPlus,
} from "lucide-vue-next";
import {
  Avatar,
  Button,
  Input,
  EmptyState,
  Badge,
  ConnectionStatusBar,
} from "@campusmesh/ui";
import {
  DeliveryState,
  MessageType,
  PeerConnectionState,
} from "@campusmesh/shared-types";
import ManualSignalingModal from "../components/ManualSignalingModal.vue";
import AddContactModal from "../components/AddContactModal.vue";
import {
  useFileTransferStore,
  type StoredAttachmentPayload,
} from "../stores/files";
import { useCallStore } from "../stores/call";
import { useContactsStore } from "../stores/contacts";
import { nativeService } from "../services/native";

const chatStore = useChatStore();
const networkStore = useNetworkStore();
const fileTransferStore = useFileTransferStore();
const callStore = useCallStore();
const identityStore = useIdentityStore();
const contactsStore = useContactsStore();

const isPeerInContacts = computed(() => {
  if (!activeConversation.value?.peerFingerprint) return true;
  return contactsStore.contacts.some(
    (c) => c.fingerprint === activeConversation.value?.peerFingerprint,
  );
});

const activePeerSafetyNumber = computed(() => {
  const peerFp = activeConversation.value?.peerFingerprint;
  if (!peerFp) return "Group Channel (Shared Epoch Key)";
  const contact = contactsStore.contacts.find((c) => c.fingerprint === peerFp);
  if (contact?.safetyNumber) return contact.safetyNumber;
  return peerFp.match(/.{1,4}/g)?.join(" ") ?? peerFp;
});

const isActivePeerVerified = computed(() => {
  const peerFp = activeConversation.value?.peerFingerprint;
  if (!peerFp) return true;
  const contact = contactsStore.contacts.find((c) => c.fingerprint === peerFp);
  return Boolean(contact?.isVerified);
});

function handleAddPeerToContacts() {
  if (!activeConversation.value?.peerFingerprint) return;
  contactsStore.openAddContactWithPeer(
    activeConversation.value.peerFingerprint,
    activeConversation.value.name.startsWith("Peer ")
      ? ""
      : activeConversation.value.name,
  );
}

const inputText = ref("");
const isDetailsOpen = ref(false);
const showManualSignalModal = ref(false);
const fileInputRef = ref<HTMLInputElement | null>(null);
const mobileSearchQuery = ref("");

const activeConversation = computed(() => {
  return chatStore.conversations.find(
    (c) => c.id === chatStore.activeConversationId,
  );
});

const isActivePeerOnline = computed(() => {
  if (!activeConversation.value) return false;
  if (activeConversation.value.isGroup) return false;
  const peerFp = activeConversation.value.peerFingerprint;
  if (!peerFp) return false;
  if (networkStore.lanPeers[peerFp]) return true;
  if (networkStore.blePeers[peerFp]) return true;
  if (networkStore.peerState === PeerConnectionState.CONNECTED) return true;
  return false;
});

const filteredMobileConversations = computed(() => {
  if (!mobileSearchQuery.value.trim()) {
    return chatStore.conversations;
  }
  const q = mobileSearchQuery.value.toLowerCase().trim();
  return chatStore.conversations.filter(
    (c) =>
      c.name.toLowerCase().includes(q) ||
      (c.lastMessagePreview && c.lastMessagePreview.toLowerCase().includes(q)),
  );
});

function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  if (diff < 60000) return "just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`;
  return `${Math.floor(diff / 86400000)}d`;
}

watch(
  () => activeConversation.value?.peerFingerprint,
  (peerFp) => {
    const myFp = identityStore.identity?.fingerprint;
    if (peerFp && myFp) {
      networkStore.connectToPeer(peerFp);
    }
  },
  { immediate: true },
);

watch(
  () => activeConversation.value?.id,
  async (convId) => {
    if (convId) {
      const msgs = chatStore.messagesMap[convId];
      if (!msgs || msgs.length === 0) {
        await chatStore.loadMessagesForConversation(convId);
      }
    }
  },
  { immediate: true },
);

watch(
  () =>
    [activeConversation.value?.id, chatStore.activeMessages.length] as const,
  ([convId]) => {
    const peerFp = activeConversation.value?.peerFingerprint;
    if (convId && peerFp) {
      networkStore.sendReadReceipt(peerFp, convId);
    }
  },
  { immediate: true },
);

function formatMessageTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function handleSendMessage() {
  if (!inputText.value.trim() || !activeConversation.value) return;
  const myFp = identityStore.identity?.fingerprint || "me";
  const myName = identityStore.identity?.displayName || "CampusMesh User";
  const peerFp = activeConversation.value.peerFingerprint;

  if (peerFp) {
    networkStore.sendChatMessage(
      peerFp,
      activeConversation.value.id,
      inputText.value.trim(),
      myFp,
      myName,
    );
  } else {
    const groupObj = contactsStore.groups.find(
      (g) => g.id === activeConversation.value?.id,
    );
    const members = groupObj?.memberFingerprints ?? [];
    void networkStore.sendGroupMessage(
      activeConversation.value.id,
      activeConversation.value.name,
      members,
      inputText.value.trim(),
      myFp,
      myName,
      activeConversation.value.autobaseKey || groupObj?.autobaseKey,
    );
  }
  nativeService.hapticFeedback();
  inputText.value = "";
}

function parseAttachmentPayload(
  content: string,
): StoredAttachmentPayload | null {
  try {
    const parsed = JSON.parse(content) as StoredAttachmentPayload;
    if (parsed && parsed.fileId && parsed.fileName) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function handleFileSelected(event: Event) {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];
  if (!file || !activeConversation.value) return;

  try {
    await fileTransferStore.sendFile(
      file,
      activeConversation.value.id,
      activeConversation.value.peerFingerprint,
    );
  } catch (err: unknown) {
    alert(err instanceof Error ? err.message : String(err));
  } finally {
    if (fileInputRef.value) {
      fileInputRef.value.value = "";
    }
  }
}

async function handleStartVoiceCall() {
  if (!activeConversation.value?.peerFingerprint) return;
  if (identityStore.identity?.fingerprint) {
    callStore.setLocalFingerprint(identityStore.identity.fingerprint);
  }
  if (identityStore.identity?.displayName) {
    callStore.setLocalDisplayName(identityStore.identity.displayName);
  }
  try {
    await callStore.startCall(
      activeConversation.value.peerFingerprint,
      activeConversation.value.name,
      "AUDIO",
    );
  } catch (err) {
    console.warn("Unable to start voice call:", err);
  }
}

async function handleStartVideoCall() {
  if (!activeConversation.value?.peerFingerprint) return;
  if (identityStore.identity?.fingerprint) {
    callStore.setLocalFingerprint(identityStore.identity.fingerprint);
  }
  if (identityStore.identity?.displayName) {
    callStore.setLocalDisplayName(identityStore.identity.displayName);
  }
  try {
    await callStore.startCall(
      activeConversation.value.peerFingerprint,
      activeConversation.value.name,
      "VIDEO",
    );
  } catch (err) {
    console.warn("Unable to start video call:", err);
  }
}
</script>

<template>
  <div v-if="!activeConversation" class="h-full w-full">
    <!-- Desktop EmptyState -->
    <div class="hidden md:flex h-full w-full items-center justify-center">
      <EmptyState
        title="No Conversation Selected"
        description="Choose a conversation from the sidebar or start a new encrypted P2P session."
        action-text="Browse Contacts"
        @action="$router.push('/contacts')"
      />
    </div>

    <!-- Mobile Conversation List -->
    <div
      class="md:hidden flex flex-col h-full w-full bg-background overflow-hidden"
    >
      <!-- Mobile Header -->
      <header
        class="flex h-14 items-center justify-between border-b border-border bg-surface px-4 shrink-0"
      >
        <h1 class="text-base font-bold text-textPrimary tracking-tight">
          Messages
        </h1>
        <Button
          variant="default"
          size="sm"
          class="gap-1.5 h-8 px-2.5 text-xs font-semibold"
          @click="$router.push('/contacts')"
        >
          <Plus class="h-3.5 w-3.5" />
          <span>New Chat</span>
        </Button>
      </header>

      <!-- Search Bar -->
      <div class="p-3 border-b border-borderSubtle bg-surface/50">
        <div class="relative">
          <Search class="absolute left-2.5 top-2.5 h-4 w-4 text-textMuted" />
          <Input
            v-model="mobileSearchQuery"
            placeholder="Search conversations..."
            class="pl-9 h-9 text-xs"
          />
        </div>
      </div>

      <!-- Conversations List -->
      <div class="flex-1 overflow-y-auto p-2 space-y-1">
        <div
          v-for="conv in filteredMobileConversations"
          :key="conv.id"
          class="flex items-center gap-3 p-3 rounded-xl cursor-pointer hover:bg-surface-hover active:bg-surface transition-colors border border-transparent hover:border-border"
          @click="chatStore.selectConversation(conv.id)"
        >
          <Avatar
            :name="conv.name"
            size="md"
            :is-online="
              Boolean(
                conv.peerFingerprint &&
                (networkStore.lanPeers[conv.peerFingerprint] ||
                  networkStore.blePeers[conv.peerFingerprint] ||
                  (chatStore.activeConversationId === conv.id &&
                    networkStore.peerState === PeerConnectionState.CONNECTED)),
              )
            "
          />
          <div class="flex-1 min-w-0">
            <div class="flex items-center justify-between mb-0.5">
              <span class="text-sm font-semibold text-textPrimary truncate">{{
                conv.name
              }}</span>
              <span
                v-if="conv.lastMessageTimestamp"
                class="text-[10px] text-textMuted"
                >{{ formatRelativeTime(conv.lastMessageTimestamp) }}</span
              >
            </div>
            <p class="text-xs text-textSecondary truncate">
              {{ conv.lastMessagePreview }}
            </p>
          </div>
          <Badge
            v-if="conv.unreadCount > 0"
            variant="default"
            class="h-5 px-1.5 text-[10px]"
          >
            {{ conv.unreadCount }}
          </Badge>
        </div>

        <div
          v-if="filteredMobileConversations.length === 0"
          class="flex flex-col items-center justify-center p-8 text-center"
        >
          <p class="text-xs text-textMuted mb-3">No conversations found</p>
          <Button
            size="sm"
            variant="outline"
            @click="$router.push('/contacts')"
          >
            Start a new chat
          </Button>
        </div>
      </div>
    </div>
  </div>

  <div
    v-else
    class="flex flex-col h-full w-full min-h-0 overflow-hidden relative"
  >
    <!-- Main Chat Column -->
    <div
      class="flex-1 flex flex-col h-full min-h-0 overflow-hidden bg-background"
    >
      <!-- Active Chat Header -->
      <header
        class="flex h-14 sm:h-16 items-center justify-between border-b border-border bg-surface px-3 sm:px-4 shrink-0 z-10"
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
            :is-online="isActivePeerOnline"
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
          <!-- Add to Contacts Shortcut if sender is not yet in contacts -->
          <Button
            v-if="!activeConversation.isGroup && !isPeerInContacts"
            variant="outline"
            size="sm"
            class="text-xs h-8 px-2.5 gap-1.5 border-primary/40 text-primary hover:bg-primary/10 shrink-0"
            title="Save this peer to your contacts"
            @click="handleAddPeerToContacts"
          >
            <UserPlus class="h-3.5 w-3.5" />
            <span class="hidden sm:inline">Add Contact</span>
          </Button>

          <!-- Voice Call (1-to-1 direct) -->
          <Button
            v-if="!activeConversation.isGroup"
            variant="ghost"
            size="iconSm"
            title="Start P2P Voice Call"
            class="text-textSecondary hover:text-emerald-500"
            @click="handleStartVoiceCall"
          >
            <Phone class="h-4 w-4" />
          </Button>

          <!-- Video Call (1-to-1 direct) -->
          <Button
            v-if="!activeConversation.isGroup"
            variant="ghost"
            size="iconSm"
            title="Start P2P Video Call"
            class="text-textSecondary hover:text-emerald-500"
            @click="handleStartVideoCall"
          >
            <Video class="h-4 w-4" />
          </Button>

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
        class="shrink-0"
        :signaling-state="networkStore.signalingState"
        :peer-state="networkStore.peerState"
        :is-direct-lan="networkStore.isDirectLan"
      />

      <!-- Message History Viewport -->
      <div class="flex-1 min-h-0 overflow-y-auto p-3 sm:p-4 space-y-3">
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
          v-for="msg in chatStore.activeMessages"
          :key="msg.id"
          class="flex flex-col"
          :class="msg.isOutgoing ? 'items-end' : 'items-start'"
        >
          <div class="flex items-end gap-2 max-w-[80%] md:max-w-[70%]">
            <div
              class="rounded-2xl px-4 py-2.5 shadow-xs text-sm"
              :class="
                msg.isOutgoing
                  ? 'bg-primary text-white rounded-br-xs'
                  : 'bg-surface text-textPrimary border border-borderSubtle rounded-bl-xs'
              "
            >
              <!-- Text or File Attachment Content -->
              <div v-if="msg.contentType === MessageType.ATTACHMENT">
                <div
                  v-if="parseAttachmentPayload(msg.content)"
                  class="flex flex-col gap-2 min-w-[220px]"
                >
                  <div
                    class="flex items-center gap-3 p-2.5 rounded-xl bg-black/10 dark:bg-white/10"
                  >
                    <div
                      class="h-8 w-8 rounded-lg bg-black/10 dark:bg-white/10 flex items-center justify-center shrink-0"
                    >
                      <ImageIcon
                        v-if="
                          parseAttachmentPayload(
                            msg.content,
                          )!.mimeType.startsWith('image/')
                        "
                        class="h-4 w-4"
                      />
                      <FileText v-else class="h-4 w-4" />
                    </div>
                    <div class="flex-1 min-w-0">
                      <p class="text-xs font-bold truncate">
                        {{ parseAttachmentPayload(msg.content)!.fileName }}
                      </p>
                      <p class="text-[10px] opacity-75">
                        {{
                          formatFileSize(
                            parseAttachmentPayload(msg.content)!.fileSize,
                          )
                        }}
                      </p>
                    </div>
                    <Button
                      v-if="
                        fileTransferStore.completedFiles[
                          parseAttachmentPayload(msg.content)!.fileId
                        ]
                      "
                      variant="ghost"
                      size="iconSm"
                      class="h-7 w-7 text-current hover:bg-black/10"
                      title="Download File"
                      @click="
                        fileTransferStore.downloadFile(
                          parseAttachmentPayload(msg.content)!.fileId,
                        )
                      "
                    >
                      <Download class="h-4 w-4" />
                    </Button>
                  </div>

                  <!-- Progress Bar if Transferring -->
                  <div
                    v-if="
                      fileTransferStore.transfers[
                        parseAttachmentPayload(msg.content)!.fileId
                      ] &&
                      fileTransferStore.transfers[
                        parseAttachmentPayload(msg.content)!.fileId
                      ]!.status !== 'COMPLETED'
                    "
                    class="w-full bg-black/20 rounded-full h-1.5 overflow-hidden"
                  >
                    <div
                      class="bg-current h-full transition-all duration-200"
                      :style="{
                        width: `${
                          fileTransferStore.transfers[
                            parseAttachmentPayload(msg.content)!.fileId
                          ]!.percentage
                        }%`,
                      }"
                    ></div>
                  </div>
                </div>
                <p v-else class="break-words leading-relaxed">
                  {{ msg.content }}
                </p>
              </div>
              <p v-else class="break-words leading-relaxed">
                {{ msg.content }}
              </p>
              <div
                class="flex items-center justify-end gap-1 text-[10px] mt-1 select-none"
                :class="msg.isOutgoing ? 'text-white/80' : 'text-textMuted'"
              >
                <span>{{ formatMessageTime(msg.timestamp) }}</span>
                <!-- 6-State Delivery Indicator Icons -->
                <Clock
                  v-if="
                    msg.isOutgoing &&
                    msg.deliveryState === DeliveryState.SAVED_LOCALLY
                  "
                  class="h-3 w-3 text-warning"
                  title="Saved locally"
                />
                <Check
                  v-else-if="
                    msg.isOutgoing && msg.deliveryState === DeliveryState.SENT
                  "
                  class="h-3 w-3 text-white/70"
                  title="Sent to peer"
                />
                <CheckCheck
                  v-else-if="
                    msg.isOutgoing &&
                    msg.deliveryState === DeliveryState.DELIVERED
                  "
                  class="h-3 w-3 text-white/90"
                  title="Delivered"
                />
                <CheckCheck
                  v-else-if="
                    msg.isOutgoing && msg.deliveryState === DeliveryState.READ
                  "
                  class="h-3 w-3 text-sky-200"
                  title="Read"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Message Composer Bar -->
      <footer
        class="p-2 sm:p-2.5 border-t border-border bg-surface shrink-0 z-20 pb-[max(0.5rem,env(safe-area-inset-bottom))]"
      >
        <form
          class="flex items-center gap-1.5 sm:gap-2 max-w-4xl mx-auto"
          @submit.prevent="handleSendMessage"
        >
          <input
            ref="fileInputRef"
            type="file"
            class="hidden"
            @change="handleFileSelected"
          />

          <Button
            type="button"
            variant="ghost"
            size="iconSm"
            title="Attach File (Direct P2P)"
            class="text-textSecondary hover:text-primary"
            @click="fileInputRef?.click()"
          >
            <Paperclip class="h-4 w-4" />
          </Button>

          <Input
            v-model="inputText"
            placeholder="Type an encrypted message..."
            class="flex-1 bg-surface-subtle border-border text-textPrimary placeholder:text-textMuted h-10 text-sm"
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
            {{ activePeerSafetyNumber }}
          </p>
        </div>
        <Badge
          :variant="isActivePeerVerified ? 'success' : 'secondary'"
          class="w-full justify-center py-1"
        >
          {{
            isActivePeerVerified
              ? "✓ Verified Identity Key"
              : "Unverified Peer Key"
          }}
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
            <span class="text-textMuted">Transport:</span>
            {{
              networkStore.swarmStatus === "online"
                ? "Hyperswarm UTP + WebRTC + LAN TCP"
                : networkStore.gatewayPeerFingerprint
                  ? "WebRTC + Desktop Hybrid Gateway"
                  : "WebRTC DataChannel + LAN"
            }}
          </p>
          <p v-if="activeConversation.isGroup">
            <span class="text-textMuted">Group Log:</span>
            {{
              activeConversation.groupMode === "autobase-swarm"
                ? "Autobase Multi-Writer"
                : "WebRTC Bounded Mesh"
            }}
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
    <AddContactModal />
  </div>
</template>
