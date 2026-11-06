import { describe, it, expect, beforeEach } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { useThemeStore } from "./theme";
import { useNetworkStore } from "./network";
import { useChatStore } from "./chat";
import { SignalingState, PeerConnectionState } from "@campusmesh/shared-types";

describe("Web Stores (Phase 1)", () => {
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
  });

  it("chat store should handle conversation selection and clear unread counts", () => {
    const chatStore = useChatStore();
    expect(chatStore.conversations.length).toBeGreaterThan(0);

    const convAlice = chatStore.conversations.find(
      (c) => c.id === "conv_alice",
    );
    expect(convAlice?.unreadCount).toBe(2);

    chatStore.selectConversation("conv_alice");
    expect(chatStore.activeConversationId).toBe("conv_alice");
    expect(convAlice?.unreadCount).toBe(0);
  });
});
