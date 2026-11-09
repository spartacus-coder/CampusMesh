import { defineStore } from "pinia";
import { ref, computed } from "vue";
import {
  type Conversation,
  type DeliveryState as DeliveryStateType,
  DeliveryState,
  MessageType,
} from "@campusmesh/shared-types";
import {
  DexieStorageAdapter,
  InMemoryStorageAdapter,
  type IStoragePort,
  type StoredMessage,
} from "@campusmesh/storage";
import { nativeService } from "../services/native";

let storageInstance: IStoragePort | null = null;
function getStorage(): IStoragePort {
  if (!storageInstance) {
    storageInstance =
      typeof indexedDB !== "undefined"
        ? new DexieStorageAdapter("CampusMeshWebDB")
        : new InMemoryStorageAdapter();
  }
  return storageInstance;
}

const defaultConversations: Conversation[] = [
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
];

export const useChatStore = defineStore("chat", () => {
  const activeConversationId = ref<string | null>(null);
  const conversations = ref<Conversation[]>([...defaultConversations]);

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

  function setStorageAdapter(storage: IStoragePort) {
    storageInstance = storage;
  }

  const activeMessages = computed(() => {
    if (!activeConversationId.value) return [];
    const list = messagesMap.value[activeConversationId.value];
    return list || [];
  });

  async function loadMessagesForConversation(
    conversationId: string,
  ): Promise<StoredMessage[]> {
    let loadedMsgs: StoredMessage[] = [];

    // 1. Try native desktop SQLite if available
    if (nativeService.isTauri) {
      try {
        const nativeMsgs =
          await nativeService.getMessagesFromNativeDb(conversationId);
        if (nativeMsgs && nativeMsgs.length > 0) {
          loadedMsgs = nativeMsgs;
        }
      } catch (err) {
        console.warn(
          "[ChatStore] Native getMessagesFromNativeDb failed:",
          err,
        );
      }
    }

    // 2. Fall back to Dexie IndexedDB
    if (loadedMsgs.length === 0) {
      try {
        const idbMsgs = await getStorage().getMessages(conversationId, 200);
        if (idbMsgs && idbMsgs.length > 0) {
          loadedMsgs = idbMsgs;
        }
      } catch (err) {
        console.warn("[ChatStore] Dexie getMessages failed:", err);
      }
    }

    if (loadedMsgs.length > 0) {
      const existing = messagesMap.value[conversationId] || [];
      const idSet = new Set(existing.map((m) => m.id));
      for (const m of loadedMsgs) {
        if (!idSet.has(m.id)) {
          existing.push(m);
          idSet.add(m.id);
        }
      }
      existing.sort((a, b) => a.timestamp - b.timestamp);
      messagesMap.value = {
        ...messagesMap.value,
        [conversationId]: [...existing],
      };
    } else if (!messagesMap.value[conversationId]) {
      messagesMap.value = {
        ...messagesMap.value,
        [conversationId]: [],
      };
    }

    return messagesMap.value[conversationId] || [];
  }

  async function selectConversation(id: string | null) {
    activeConversationId.value = id;
    if (id) {
      const conv = conversations.value.find((c) => c.id === id);
      if (conv) {
        conv.unreadCount = 0;
        if (nativeService.isTauri) {
          nativeService.saveConversationToNativeDb(conv).catch(() => {});
        }
        getStorage().saveConversation(conv).catch(() => {});
      }
      await loadMessagesForConversation(id);
    }
  }

  async function initConversations(): Promise<void> {
    const loadedMap = new Map<string, Conversation>();

    // 1. Load from Tauri SQLite
    if (nativeService.isTauri) {
      try {
        const nativeConvs = await nativeService.getConversationsFromNativeDb();
        if (nativeConvs && nativeConvs.length > 0) {
          for (const c of nativeConvs) {
            loadedMap.set(c.id, c);
          }
        }
      } catch (err) {
        console.warn("[ChatStore] Native getConversations failed:", err);
      }
    }

    // 2. Load from Dexie IndexedDB
    try {
      const idbConvs = await getStorage().getConversations();
      if (idbConvs && idbConvs.length > 0) {
        for (const c of idbConvs) {
          if (!loadedMap.has(c.id)) {
            loadedMap.set(c.id, c);
          }
        }
      }
    } catch (err) {
      console.warn("[ChatStore] Dexie getConversations failed:", err);
    }

    // 3. Fallback to mock conversations only if nothing else loaded
    if (loadedMap.size === 0) {
      for (const def of defaultConversations) {
        if (!loadedMap.has(def.id)) {
          loadedMap.set(def.id, def);
        }
      }
    }

    conversations.value = Array.from(loadedMap.values()).sort(
      (a, b) => (b.lastMessageTimestamp || 0) - (a.lastMessageTimestamp || 0),
    );

    // Pre-hydrate messages for all loaded conversations
    for (const conv of conversations.value) {
      await loadMessagesForConversation(conv.id);
    }

    // Auto-select the most recent conversation if none is active
    if (!activeConversationId.value) {
      const first = conversations.value[0];
      if (first) {
        activeConversationId.value = first.id;
      }
    }
  }

  async function appendMessage(
    msg: StoredMessage,
    senderDisplayName?: string,
  ): Promise<void> {
    const peerFp = !msg.isOutgoing
      ? msg.senderFingerprint
      : msg.recipientFingerprint;

    // Find existing conversation by ID or matching peer fingerprint
    let conv = conversations.value.find(
      (c) =>
        c.id === msg.conversationId || (peerFp && c.peerFingerprint === peerFp),
    );

    // If conversation doesn't exist yet and we have a peer fingerprint, auto-create it
    if (!conv && peerFp) {
      const canonicalId = `conv-${peerFp}`;
      conv = {
        id: canonicalId,
        isGroup: false,
        name:
          senderDisplayName ||
          (!msg.isOutgoing ? `Peer ${peerFp.slice(0, 8)}` : "Contact"),
        peerFingerprint: peerFp,
        lastMessagePreview: msg.content,
        lastMessageTimestamp: msg.timestamp,
        unreadCount: activeConversationId.value === canonicalId ? 0 : 1,
        isPinned: false,
        isArchived: false,
      };
      conversations.value.unshift(conv);
    }

    // Always ensure message is filed under the true canonical conversation ID
    const targetConvId = conv
      ? conv.id
      : peerFp
        ? `conv-${peerFp}`
        : msg.conversationId;
    msg.conversationId = targetConvId;

    if (!messagesMap.value[targetConvId]) {
      await loadMessagesForConversation(targetConvId);
    }

    const list = messagesMap.value[targetConvId];
    if (list) {
      if (!list.some((m) => m.id === msg.id)) {
        list.push(msg);
        list.sort((a, b) => a.timestamp - b.timestamp);
      }
    }

    if (conv) {
      conv.lastMessagePreview = msg.content;
      conv.lastMessageTimestamp = msg.timestamp;
      if (!msg.isOutgoing && activeConversationId.value !== conv.id) {
        conv.unreadCount = (conv.unreadCount || 0) + 1;
      }
      // Persist conversation to both SQLite and IndexedDB
      if (nativeService.isTauri) {
        nativeService.saveConversationToNativeDb(conv).catch(() => {});
      }
      getStorage().saveConversation(conv).catch(() => {});
    }

    // Persist message to both native SQLite vault and IndexedDB
    if (nativeService.isTauri) {
      nativeService.saveMessageToNativeDb(msg).catch(() => {});
    }
    getStorage().saveMessage(msg).catch(() => {});
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
        getStorage().updateMessageDeliveryState(messageId, state).catch(() => {});
      }
    }
  }

  async function saveConversation(conv: Conversation): Promise<void> {
    const idx = conversations.value.findIndex((c) => c.id === conv.id);
    if (idx >= 0) {
      conversations.value[idx] = conv;
    } else {
      conversations.value.unshift(conv);
    }
    if (nativeService.isTauri) {
      await nativeService.saveConversationToNativeDb(conv).catch(() => {});
    }
    await getStorage().saveConversation(conv).catch(() => {});
  }

  return {
    conversations,
    activeConversationId,
    activeMessages,
    messagesMap,
    setStorageAdapter,
    selectConversation,
    loadMessagesForConversation,
    initConversations,
    appendMessage,
    updateMessageDelivery,
    saveConversation,
  };
});
