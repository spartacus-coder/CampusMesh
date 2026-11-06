import { describe, it, expect, beforeEach } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { useThemeStore } from "./theme";
import { useNetworkStore } from "./network";
import { useChatStore } from "./chat";
import { useIdentityStore } from "./identity";
import { InMemoryStorageAdapter } from "@campusmesh/storage";
import {
  SignalingState,
  PeerConnectionState,
  DeliveryState,
  MessageType,
} from "@campusmesh/shared-types";

describe("Web Stores Suite", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it("theme store should cycle between dark, light, and high-contrast", () => {
    const themeStore = useThemeStore();
    themeStore.applyTheme("dark");
    expect(themeStore.currentTheme).toBe("dark");

    themeStore.toggleTheme();
    expect(themeStore.currentTheme).toBe("light");

    themeStore.toggleTheme();
    expect(themeStore.currentTheme).toBe("high-contrast");

    themeStore.toggleTheme();
    expect(themeStore.currentTheme).toBe("dark");
  });

  it("network store should track signaling and peer states", () => {
    const networkStore = useNetworkStore();
    expect(networkStore.signalingState).toBe(SignalingState.CONNECTED);

    networkStore.setSignalingState(SignalingState.UNAVAILABLE_QUOTA);
    expect(networkStore.signalingState).toBe(SignalingState.UNAVAILABLE_QUOTA);

    networkStore.setPeerState(PeerConnectionState.FAILED);
    expect(networkStore.peerState).toBe(PeerConnectionState.FAILED);

    networkStore.setDirectLan(true);
    expect(networkStore.isDirectLan).toBe(true);

    expect(networkStore.isQuotaAlertDismissed).toBe(false);
    networkStore.dismissQuotaAlert();
    expect(networkStore.isQuotaAlertDismissed).toBe(true);

    networkStore.disconnectSignaling();
    expect(networkStore.activeRoomId).toBeNull();
  });

  it("chat store should handle conversation selection, message appending, and state update", () => {
    const chatStore = useChatStore();
    expect(chatStore.conversations.length).toBeGreaterThan(0);
    expect(chatStore.activeConversationId).toBe("conv_alice");
    expect(chatStore.activeMessages.length).toBeGreaterThan(0);

    // Append outgoing message
    const newMsg = {
      id: "test_msg_1",
      conversationId: "conv_alice",
      senderFingerprint: "me",
      content: "Testing direct message store",
      contentType: MessageType.TEXT,
      timestamp: Date.now(),
      deliveryState: DeliveryState.SAVED_LOCALLY,
      isOutgoing: true,
    };
    chatStore.appendMessage(newMsg);
    expect(chatStore.activeMessages.some((m) => m.id === "test_msg_1")).toBe(
      true,
    );

    // Update delivery state
    chatStore.updateMessageDelivery(
      "conv_alice",
      "test_msg_1",
      DeliveryState.DELIVERED,
    );
    const updated = chatStore.activeMessages.find((m) => m.id === "test_msg_1");
    expect(updated?.deliveryState).toBe(DeliveryState.DELIVERED);

    // Select different conversation
    chatStore.selectConversation("conv_general");
    expect(chatStore.activeConversationId).toBe("conv_general");
  });

  it("identity store should manage cryptographic identity lifecycle", async () => {
    const identityStore = useIdentityStore();
    // Inject clean in-memory adapter for test isolation
    identityStore.setStorageAdapter(new InMemoryStorageAdapter());

    await identityStore.checkInitialization();
    expect(identityStore.isInitialized).toBe(false);
    expect(identityStore.isUnlocked).toBe(false);

    // Create identity
    const { identity, mnemonic } = await identityStore.createIdentity(
      "Test Scholar",
      "TestPassword123!",
    );
    expect(identity.displayName).toBe("Test Scholar");
    expect(mnemonic.split(" ")).toHaveLength(24);
    expect(identityStore.isInitialized).toBe(true);
    expect(identityStore.isUnlocked).toBe(true);
    expect(identityStore.formattedSafetyFingerprint).toBeTruthy();

    // Lock
    identityStore.lock();
    expect(identityStore.isUnlocked).toBe(false);

    // Unlock
    await identityStore.unlock("TestPassword123!");
    expect(identityStore.isUnlocked).toBe(true);
  });
});
