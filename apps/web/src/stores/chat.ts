import { defineStore } from "pinia";
import { ref } from "vue";
import type { Conversation } from "@campusmesh/shared-types";

export const useChatStore = defineStore("chat", () => {
  const activeConversationId = ref<string | null>("conv_general");
  const conversations = ref<Conversation[]>([
    {
      id: "conv_general",
      isGroup: true,
      name: "CampusMesh Dev Circle",
      lastMessagePreview: "P2P mesh architecture is live on local network!",
      lastMessageTimestamp: Date.now() - 1000 * 60 * 5,
      unreadCount: 0,
      isPinned: true,
      isArchived: false,
    },
    {
      id: "conv_alice",
      isGroup: false,
      name: "Alice (Security Lead)",
      peerFingerprint: "fp_e3b0c44298fc1c149afbf4c8996fb924",
      lastMessagePreview: "Safety numbers verified. Ready for Phase 1.",
      lastMessageTimestamp: Date.now() - 1000 * 60 * 25,
      unreadCount: 2,
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

  function selectConversation(id: string | null) {
    activeConversationId.value = id;
    if (id) {
      const conv = conversations.value.find((c) => c.id === id);
      if (conv) {
        conv.unreadCount = 0;
      }
    }
  }

  return {
    conversations,
    activeConversationId,
    selectConversation,
  };
});
