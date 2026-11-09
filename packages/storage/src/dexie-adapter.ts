import {
  CampusMeshDatabase,
  type StoredKeystoreRecord,
  type StoredMessage,
  type QueuedMessage,
} from "./db";
import type {
  Contact,
  Conversation,
  IdentityProfile,
  DeliveryState,
  MeshGroup,
} from "@campusmesh/shared-types";

export interface IStoragePort {
  saveIdentity(identity: IdentityProfile): Promise<void>;
  getIdentity(): Promise<IdentityProfile | null>;
  saveKeystore(record: StoredKeystoreRecord): Promise<void>;
  getKeystore(id?: string): Promise<StoredKeystoreRecord | null>;
  saveContact(contact: Contact): Promise<void>;
  getContacts(): Promise<Contact[]>;
  getContactByFingerprint(fingerprint: string): Promise<Contact | null>;
  deleteContact(id: string): Promise<void>;
  saveGroup(group: MeshGroup): Promise<void>;
  getGroups(): Promise<MeshGroup[]>;
  getGroup(id: string): Promise<MeshGroup | null>;
  deleteGroup(id: string): Promise<void>;
  saveConversation(conversation: Conversation): Promise<void>;
  getConversations(): Promise<Conversation[]>;
  getConversation(id: string): Promise<Conversation | null>;
  saveMessage(message: StoredMessage): Promise<void>;
  getMessages(
    conversationId: string,
    limit?: number,
    beforeTimestamp?: number,
  ): Promise<StoredMessage[]>;
  updateMessageDeliveryState(id: string, state: DeliveryState): Promise<void>;
  queueOutboxMessage(message: QueuedMessage): Promise<void>;
  getPendingOutboxMessages(limit?: number): Promise<QueuedMessage[]>;
  removeOutboxMessage(id: string): Promise<void>;
  clearAll(): Promise<void>;
}

export class DexieStorageAdapter implements IStoragePort {
  private db: CampusMeshDatabase;

  constructor(dbOrName?: CampusMeshDatabase | string) {
    if (dbOrName instanceof CampusMeshDatabase) {
      this.db = dbOrName;
    } else {
      this.db = new CampusMeshDatabase(dbOrName || "CampusMeshDB");
    }
  }

  async saveIdentity(identity: IdentityProfile): Promise<void> {
    await this.db.identities.put(identity);
  }

  async getIdentity(): Promise<IdentityProfile | null> {
    const list = await this.db.identities.toArray();
    return list[0] ?? null;
  }

  async saveKeystore(record: StoredKeystoreRecord): Promise<void> {
    await this.db.keystores.put(record);
  }

  async getKeystore(id = "primary"): Promise<StoredKeystoreRecord | null> {
    const record = await this.db.keystores.get(id);
    return record ?? null;
  }

  async saveContact(contact: Contact): Promise<void> {
    await this.db.contacts.put(contact);
  }

  async getContacts(): Promise<Contact[]> {
    return this.db.contacts.toArray();
  }

  async getContactByFingerprint(fingerprint: string): Promise<Contact | null> {
    const contact = await this.db.contacts
      .where("fingerprint")
      .equals(fingerprint)
      .first();
    return contact ?? null;
  }

  async deleteContact(id: string): Promise<void> {
    await this.db.contacts.delete(id);
  }

  async saveGroup(group: MeshGroup): Promise<void> {
    await this.db.groups.put(group);
  }

  async getGroups(): Promise<MeshGroup[]> {
    return this.db.groups.orderBy("createdAt").reverse().toArray();
  }

  async getGroup(id: string): Promise<MeshGroup | null> {
    const group = await this.db.groups.get(id);
    return group ?? null;
  }

  async deleteGroup(id: string): Promise<void> {
    await this.db.groups.delete(id);
  }

  async saveConversation(conversation: Conversation): Promise<void> {
    await this.db.conversations.put(conversation);
  }

  async getConversations(): Promise<Conversation[]> {
    return this.db.conversations
      .orderBy("lastMessageTimestamp")
      .reverse()
      .toArray();
  }

  async getConversation(id: string): Promise<Conversation | null> {
    const conversation = await this.db.conversations.get(id);
    if (conversation) return conversation;
    const altId = id.startsWith("conv-") ? id.slice(5) : `conv-${id}`;
    const alt = await this.db.conversations.get(altId);
    return alt ?? null;
  }

  async saveMessage(message: StoredMessage): Promise<void> {
    await this.db.messages.put(message);
  }

  async getMessages(
    conversationId: string,
    limit = 50,
    beforeTimestamp?: number,
  ): Promise<StoredMessage[]> {
    const altId = conversationId.startsWith("conv-")
      ? conversationId.slice(5)
      : `conv-${conversationId}`;
    let collection = this.db.messages
      .where("conversationId")
      .anyOf([conversationId, altId]);
    if (beforeTimestamp !== undefined) {
      collection = collection.filter((m) => m.timestamp < beforeTimestamp);
    }
    const msgs = await collection.sortBy("timestamp");
    return msgs.slice(-limit);
  }

  async updateMessageDeliveryState(
    id: string,
    state: DeliveryState,
  ): Promise<void> {
    await this.db.messages.update(id, { deliveryState: state });
  }

  async queueOutboxMessage(message: QueuedMessage): Promise<void> {
    await this.db.outbox.put(message);
  }

  async getPendingOutboxMessages(limit = 20): Promise<QueuedMessage[]> {
    return this.db.outbox.orderBy("createdAt").limit(limit).toArray();
  }

  async removeOutboxMessage(id: string): Promise<void> {
    await this.db.outbox.delete(id);
  }

  async clearAll(): Promise<void> {
    await this.db.transaction(
      "rw",
      [
        this.db.identities,
        this.db.keystores,
        this.db.contacts,
        this.db.groups,
        this.db.conversations,
        this.db.messages,
        this.db.outbox,
      ],
      async () => {
        await Promise.all([
          this.db.identities.clear(),
          this.db.keystores.clear(),
          this.db.contacts.clear(),
          this.db.groups.clear(),
          this.db.conversations.clear(),
          this.db.messages.clear(),
          this.db.outbox.clear(),
        ]);
      },
    );
  }
}
