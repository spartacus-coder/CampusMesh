import { describe, it, expect, beforeEach } from "vitest";
import "fake-indexeddb/auto";
import {
  DexieStorageAdapter,
  InMemoryStorageAdapter,
  type IStoragePort,
  CampusMeshDatabase,
} from "./index";
import { DeliveryState, MessageType } from "@campusmesh/shared-types";

describe("@campusmesh/storage persistence suite", () => {
  const adapters: Array<{ name: string; create: () => IStoragePort }> = [
    {
      name: "DexieStorageAdapter",
      create: () =>
        new DexieStorageAdapter(
          new CampusMeshDatabase(`TestDB-${Math.random()}`),
        ),
    },
    {
      name: "InMemoryStorageAdapter",
      create: () => new InMemoryStorageAdapter(),
    },
  ];

  adapters.forEach(({ name, create }) => {
    describe(`Implementation: ${name}`, () => {
      let storage: IStoragePort;

      beforeEach(async () => {
        storage = create();
        await storage.clearAll();
      });

      it("should save and retrieve identity profile", async () => {
        expect(await storage.getIdentity()).toBeNull();

        const identity = {
          id: "user-1",
          fingerprint: "fp-1234-5678",
          displayName: "Alice Student",
          ed25519PublicKey: "ed-key-base64",
          x25519PublicKey: "x-key-base64",
          createdAt: Date.now(),
        };

        await storage.saveIdentity(identity);
        const retrieved = await storage.getIdentity();
        expect(retrieved).toEqual(identity);
      });

      it("should save and retrieve encrypted keystore blob", async () => {
        expect(await storage.getKeystore()).toBeNull();

        const keystoreRecord = {
          id: "primary",
          blob: {
            version: 1 as const,
            kdf: "PBKDF2-HMAC-SHA256" as const,
            iterations: 100000,
            salt: "deadbeef",
            iv: "cafebabe",
            ciphertext: "0102030405",
          },
          updatedAt: Date.now(),
        };

        await storage.saveKeystore(keystoreRecord);
        const retrieved = await storage.getKeystore();
        expect(retrieved).toEqual(keystoreRecord);
      });

      it("should save and search contacts by fingerprint", async () => {
        const contact = {
          id: "c1",
          fingerprint: "fp-bob-4321",
          displayName: "Bob Campus",
          safetyNumber: "11111 22222 33333 44444 55555 66666",
          isVerified: true,
          isBlocked: false,
        };

        await storage.saveContact(contact);
        const allContacts = await storage.getContacts();
        expect(allContacts).toHaveLength(1);
        expect(allContacts[0]?.displayName).toBe("Bob Campus");

        const found = await storage.getContactByFingerprint("fp-bob-4321");
        expect(found).toEqual(contact);

        const notFound = await storage.getContactByFingerprint("non-existent");
        expect(notFound).toBeNull();
      });

      it("should manage conversations and order by lastMessageTimestamp", async () => {
        const c1 = {
          id: "conv-1",
          isGroup: false,
          name: "Bob",
          lastMessageTimestamp: 1000,
          unreadCount: 0,
          isPinned: false,
          isArchived: false,
        };
        const c2 = {
          id: "conv-2",
          isGroup: true,
          name: "Computer Science Study Group",
          lastMessageTimestamp: 2000,
          unreadCount: 2,
          isPinned: true,
          isArchived: false,
        };

        await storage.saveConversation(c1);
        await storage.saveConversation(c2);

        const list = await storage.getConversations();
        expect(list).toHaveLength(2);
        // c2 should be first because lastMessageTimestamp is 2000 > 1000
        expect(list[0]?.id).toBe("conv-2");
        expect(list[1]?.id).toBe("conv-1");
      });

      it("should store messages and update delivery state", async () => {
        const msg1 = {
          id: "msg-1",
          conversationId: "conv-1",
          senderFingerprint: "me",
          content: "Hello World",
          contentType: MessageType.TEXT,
          timestamp: 1000,
          deliveryState: DeliveryState.SAVED_LOCALLY,
          isOutgoing: true,
        };
        const msg2 = {
          id: "msg-2",
          conversationId: "conv-1",
          senderFingerprint: "me",
          content: "Second message",
          contentType: MessageType.TEXT,
          timestamp: 2000,
          deliveryState: DeliveryState.SAVED_LOCALLY,
          isOutgoing: true,
        };

        await storage.saveMessage(msg1);
        await storage.saveMessage(msg2);

        const messages = await storage.getMessages("conv-1");
        expect(messages).toHaveLength(2);
        expect(messages[0]?.id).toBe("msg-1");
        expect(messages[1]?.id).toBe("msg-2");

        await storage.updateMessageDeliveryState(
          "msg-1",
          DeliveryState.DELIVERED,
        );
        const updated = await storage.getMessages("conv-1");
        expect(updated[0]?.deliveryState).toBe(DeliveryState.DELIVERED);
      });

      it("should queue, retrieve, and delete outbox messages", async () => {
        const queued = {
          id: "out-1",
          envelope: {
            version: 1 as const,
            id: "env-1",
            type: MessageType.TEXT,
            conversationId: "conv-1",
            senderFingerprint: "me",
            timestamp: Date.now(),
            sequenceNumber: 1,
            payloadCiphertext: "encrypted",
            authTag: "tag",
            signature: "sig",
          },
          recipientFingerprint: "fp-bob",
          createdAt: 100,
          retryCount: 0,
          nextRetryAt: 100,
        };

        await storage.queueOutboxMessage(queued);
        let pending = await storage.getPendingOutboxMessages();
        expect(pending).toHaveLength(1);
        expect(pending[0]?.id).toBe("out-1");

        await storage.removeOutboxMessage("out-1");
        pending = await storage.getPendingOutboxMessages();
        expect(pending).toHaveLength(0);
      });
    });
  });
});
