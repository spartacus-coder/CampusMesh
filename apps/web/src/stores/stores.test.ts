import { describe, it, expect, beforeEach } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { useThemeStore } from "./theme";
import { useNetworkStore } from "./network";
import { useChatStore } from "./chat";
import { useIdentityStore } from "./identity";
import { useContactsStore } from "./contacts";
import { useFileTransferStore } from "./files";
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

  it("contacts store should manage contact directory and mesh groups", async () => {
    const contactsStore = useContactsStore();
    const storage = new InMemoryStorageAdapter();
    contactsStore.setStorageAdapter(storage, "fp-my-local-user");

    // Add contact
    const contact = await contactsStore.addContact({
      displayName: "Alice",
      fingerprint: "fp-peer-alice-12345",
    });
    expect(contact.displayName).toBe("Alice");
    expect(contactsStore.contacts).toHaveLength(1);

    // Verify contact
    await contactsStore.verifyContact("fp-peer-alice-12345", true);
    expect(contactsStore.contacts[0]?.isVerified).toBe(true);
    expect(contactsStore.verifiedContacts).toHaveLength(1);

    // Filter verified
    contactsStore.activeFilter = "verified";
    expect(contactsStore.filteredContacts).toHaveLength(1);

    // Block contact
    await contactsStore.blockContact("fp-peer-alice-12345", true);
    expect(contactsStore.contacts[0]?.isBlocked).toBe(true);

    contactsStore.activeFilter = "blocked";
    expect(contactsStore.filteredContacts).toHaveLength(1);

    // Create Mesh Group
    const group = await contactsStore.createGroup({
      name: "Distributed Physics Mesh",
      description: "P2P group",
      initialMemberFingerprints: ["fp-peer-alice-12345"],
    });
    expect(group.name).toBe("Distributed Physics Mesh");
    expect(group.memberFingerprints).toContain("fp-my-local-user");
    expect(group.memberFingerprints).toContain("fp-peer-alice-12345");
    expect(contactsStore.groups).toHaveLength(1);

    // Parse QR payload
    const parsed = contactsStore.parseQrPayload(
      JSON.stringify({
        v: 1,
        fp: "fp-qr-scanned-777",
        name: "Charlie",
      }),
    );
    expect(parsed?.fingerprint).toBe("fp-qr-scanned-777");

    // Delete contact
    await contactsStore.deleteContact("fp-peer-alice-12345");
    expect(contactsStore.contacts).toHaveLength(0);
  });

  it("file transfer store should orchestrate chunked attachment sending and progress tracking", async () => {
    const fileStore = useFileTransferStore();
    const chatStore = useChatStore();

    // Mock File object
    const fileContent = new Uint8Array(20000).fill(0x55);
    const mockFile = {
      name: "report.pdf",
      size: 20000,
      type: "application/pdf",
      arrayBuffer: () => Promise.resolve(fileContent.buffer),
    } as unknown as File;

    const metadata = await fileStore.sendFile(
      mockFile,
      "conv_alice",
      "fp-peer-alice",
    );

    expect(metadata.name).toBe("report.pdf");
    expect(metadata.size).toBe(20000);
    expect(fileStore.completedFiles[metadata.id]).toBeDefined();

    // Verify chatStore recorded attachment message
    const lastMsg =
      chatStore.activeMessages[chatStore.activeMessages.length - 1];
    expect(lastMsg?.contentType).toBe(MessageType.ATTACHMENT);
    expect(lastMsg?.content).toContain("report.pdf");

    // Verify progress tracking
    expect(fileStore.transfers[metadata.id]).toBeDefined();
    expect(fileStore.transfers[metadata.id]?.status).toBe("COMPLETED");

    // Reject file > 50 MB
    const oversizedFile = {
      name: "massive.dat",
      size: 60 * 1024 * 1024,
      type: "application/octet-stream",
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
    } as unknown as File;

    await expect(
      fileStore.sendFile(oversizedFile, "conv_alice"),
    ).rejects.toThrow(/maximum direct P2P size limit/);
  });
});
