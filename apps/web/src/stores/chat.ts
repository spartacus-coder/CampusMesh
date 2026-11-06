import { defineStore } from "pinia";
import { ref, computed } from "vue";
import {
  type Conversation,
  type DeliveryState as DeliveryStateType,
  DeliveryState,
  MessageType,
} from "@campusmesh/shared-types";
import type { StoredMessage } from "@campusmesh/storage";

export const useChatStore = defineStore("chat", () => {
  const activeConversationId = ref<string | null>("conv_alice");
  const conversations = ref<Conversation[]>([
    {
      id: "conv_alice",
      isGroup: false,
      name: "Alice (Security Lead)",
      peerFingerprint: "fp_e3b0c44298fc1c149afbf4c8996fb924",
      lastMessagePreview:
        "End-to-end encrypted with Double Ratchet forward secrecy.",
      lastMessageTimestamp: Date.now() - 1000 * 60 * 5,
      unreadCount: 0,
      isPinned: true,
      isArchived: false,
    },
    {
      id: "conv_general",
      isGroup: true,
      name: "CampusMesh Dev Circle",
      lastMessagePreview: "P2P mesh architecture is live on local network!",
      lastMessageTimestamp: Date.now() - 1000 * 60 * 15,
      unreadCount: 0,
      isPinned: true,
      isArchived: false,
    },
    {
      id: "conv_bob",
      isGroup: false,
      name: "Bob (Transport)",
      peerFingerprint: "fp_a1b2c3d4e5f60718293a4b5c6d7e8f90",
      lastMessagePreview: "STUN ICE candidate trickling tested cleanly.",
      lastMessageTimestamp: Date.now() - 1000 * 60 * 120,
      unreadCount: 0,
      isPinned: false,
      isArchived: false,
    },
  ]);

  const messagesMap = ref<Record<string, StoredMessage[]>>({
    conv_alice: [
      {
        id: "m1",
        conversationId: "conv_alice",
        senderFingerprint: "fp_alice",
        content: "Hey! Are you connected directly over WebRTC DataChannel?",
        contentType: MessageType.TEXT,
        timestamp: Date.now() - 1000 * 60 * 10,
        deliveryState: DeliveryState.READ,
        isOutgoing: false,
      },
      {
        id: "m2",
        conversationId: "conv_alice",
        senderFingerprint: "me",
        content:
          "Yes! Direct P2P connection established. Zero plaintext passed through signaling.",
        contentType: MessageType.TEXT,
        timestamp: Date.now() - 1000 * 60 * 8,
        deliveryState: DeliveryState.READ,
        isOutgoing: true,
      },
      {
        id: "m3",
        conversationId: "conv_alice",
        senderFingerprint: "fp_alice",
        content:
          "Awesome. End-to-end encrypted with Double Ratchet forward secrecy.",
        contentType: MessageType.TEXT,
        timestamp: Date.now() - 1000 * 60 * 5,
        deliveryState: DeliveryState.DELIVERED,
        isOutgoing: false,
      },
    ],
  });

  const activeMessages = computed(() => {
    if (!activeConversationId.value) return [];
    const list = messagesMap.value[activeConversationId.value];
    return list || [];
  });

  function selectConversation(id: string | null) {
    activeConversationId.value = id;
    if (id) {
      const conv = conversations.value.find((c) => c.id === id);
      if (conv) {
        conv.unreadCount = 0;
      }
    }
  }

  function appendMessage(msg: StoredMessage) {
    if (!messagesMap.value[msg.conversationId]) {
      messagesMap.value[msg.conversationId] = [];
    }
    const list = messagesMap.value[msg.conversationId];
    if (list) {
      list.push(msg);
    }

    const conv = conversations.value.find((c) => c.id === msg.conversationId);
    if (conv) {
      conv.lastMessagePreview = msg.content;
      conv.lastMessageTimestamp = msg.timestamp;
    }
  }

  function updateMessageDelivery(
    conversationId: string,
    messageId: string,
    state: DeliveryStateType,
  ) {
    const list = messagesMap.value[conversationId];
    if (list) {
      const target = list.find((m) => m.id === messageId);
      if (target) {
        target.deliveryState = state;
      }
    }
  }

  return {
    conversations,
    activeConversationId,
    activeMessages,
    messagesMap,
    selectConversation,
    appendMessage,
    updateMessageDelivery,
  };
});
