import Dexie, { type EntityTable } from "dexie";
import type {
  IdentityProfile,
  Contact,
  Conversation,
  DeliveryState,
  MessageType,
  WireEnvelope,
} from "@campusmesh/shared-types";
import type { EncryptedKeystoreBlob } from "@campusmesh/crypto";

export interface StoredKeystoreRecord {
  id: string; // 'primary'
  blob: EncryptedKeystoreBlob;
  updatedAt: number;
}

export interface StoredMessage {
  id: string;
  conversationId: string;
  senderFingerprint: string;
  recipientFingerprint?: string;
  content: string;
  contentType: MessageType;
  timestamp: number;
  deliveryState: DeliveryState;
  isOutgoing: boolean;
}

export interface QueuedMessage {
  id: string;
  envelope: WireEnvelope;
  recipientFingerprint: string;
  createdAt: number;
  retryCount: number;
  nextRetryAt: number;
}

export class CampusMeshDatabase extends Dexie {
  identities!: EntityTable<IdentityProfile, "id">;
  keystores!: EntityTable<StoredKeystoreRecord, "id">;
  contacts!: EntityTable<Contact, "id">;
  conversations!: EntityTable<Conversation, "id">;
  messages!: EntityTable<StoredMessage, "id">;
  outbox!: EntityTable<QueuedMessage, "id">;

  constructor(dbName = "CampusMeshDB") {
    super(dbName);
    this.version(1).stores({
      identities: "id, fingerprint, createdAt",
      keystores: "id, updatedAt",
      contacts: "id, fingerprint, displayName, isBlocked",
      conversations:
        "id, isGroup, peerFingerprint, lastMessageTimestamp, unreadCount, isPinned, isArchived",
      messages:
        "id, conversationId, senderFingerprint, timestamp, deliveryState, [conversationId+timestamp]",
      outbox: "id, recipientFingerprint, createdAt, nextRetryAt",
    });
  }
}
