export * from "./db";
export * from "./dexie-adapter";

import type {
  Contact,
  Conversation,
  IdentityProfile,
  DeliveryState,
  MeshGroup,
} from "@campusmesh/shared-types";
import type { IStoragePort } from "./dexie-adapter";
import type { StoredKeystoreRecord, StoredMessage, QueuedMessage } from "./db";

export class InMemoryStorageAdapter implements IStoragePort {
  private identity: IdentityProfile | null = null;
  private keystores: Map<string, StoredKeystoreRecord> = new Map();
  private contacts: Map<string, Contact> = new Map();
  private groups: Map<string, MeshGroup> = new Map();
  private conversations: Map<string, Conversation> = new Map();
  private messages: Map<string, StoredMessage> = new Map();
  private outbox: Map<string, QueuedMessage> = new Map();

  async saveIdentity(identity: IdentityProfile): Promise<void> {
    this.identity = identity;
  }

  async getIdentity(): Promise<IdentityProfile | null> {
    return this.identity;
  }

  async saveKeystore(record: StoredKeystoreRecord): Promise<void> {
    this.keystores.set(record.id, record);
  }

  async getKeystore(id = "primary"): Promise<StoredKeystoreRecord | null> {
    return this.keystores.get(id) ?? null;
  }

  async saveContact(contact: Contact): Promise<void> {
    this.contacts.set(contact.id, contact);
  }

  async getContacts(): Promise<Contact[]> {
    return Array.from(this.contacts.values());
  }

  async getContactByFingerprint(fingerprint: string): Promise<Contact | null> {
    for (const c of this.contacts.values()) {
      if (c.fingerprint === fingerprint) return c;
    }
    return null;
  }

  async deleteContact(id: string): Promise<void> {
    this.contacts.delete(id);
  }

  async saveGroup(group: MeshGroup): Promise<void> {
    this.groups.set(group.id, group);
  }

  async getGroups(): Promise<MeshGroup[]> {
    return Array.from(this.groups.values()).sort(
      (a, b) => b.createdAt - a.createdAt,
    );
  }

  async getGroup(id: string): Promise<MeshGroup | null> {
    return this.groups.get(id) ?? null;
  }

  async deleteGroup(id: string): Promise<void> {
    this.groups.delete(id);
  }

  async saveConversation(conversation: Conversation): Promise<void> {
    this.conversations.set(conversation.id, conversation);
  }

  async getConversations(): Promise<Conversation[]> {
    return Array.from(this.conversations.values()).sort(
      (a, b) => (b.lastMessageTimestamp || 0) - (a.lastMessageTimestamp || 0),
    );
  }

  async getConversation(id: string): Promise<Conversation | null> {
    return this.conversations.get(id) ?? null;
  }

  async saveMessage(message: StoredMessage): Promise<void> {
    this.messages.set(message.id, message);
  }

  async getMessages(
    conversationId: string,
    limit = 50,
    beforeTimestamp?: number,
  ): Promise<StoredMessage[]> {
    return Array.from(this.messages.values())
      .filter(
        (m) =>
          m.conversationId === conversationId &&
          (beforeTimestamp === undefined || m.timestamp < beforeTimestamp),
      )
      .sort((a, b) => a.timestamp - b.timestamp)
      .slice(-limit);
  }

  async updateMessageDeliveryState(
    id: string,
    state: DeliveryState,
  ): Promise<void> {
    const msg = this.messages.get(id);
    if (msg) {
      msg.deliveryState = state;
    }
  }

  async queueOutboxMessage(message: QueuedMessage): Promise<void> {
    this.outbox.set(message.id, message);
  }

  async getPendingOutboxMessages(limit = 20): Promise<QueuedMessage[]> {
    return Array.from(this.outbox.values())
      .sort((a, b) => a.createdAt - b.createdAt)
      .slice(0, limit);
  }

  async removeOutboxMessage(id: string): Promise<void> {
    this.outbox.delete(id);
  }

  async clearAll(): Promise<void> {
    this.identity = null;
    this.keystores.clear();
    this.contacts.clear();
    this.groups.clear();
    this.conversations.clear();
    this.messages.clear();
    this.outbox.clear();
  }
}
