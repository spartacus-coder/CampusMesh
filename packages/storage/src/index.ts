import type {
  Contact,
  Conversation,
  IdentityProfile,
} from "@campusmesh/shared-types";

export interface IStoragePort {
  saveIdentity(identity: IdentityProfile): Promise<void>;
  getIdentity(): Promise<IdentityProfile | null>;
  saveContact(contact: Contact): Promise<void>;
  getContacts(): Promise<Contact[]>;
  saveConversation(conversation: Conversation): Promise<void>;
  getConversations(): Promise<Conversation[]>;
}

export class InMemoryStorageAdapter implements IStoragePort {
  private identity: IdentityProfile | null = null;
  private contacts: Map<string, Contact> = new Map();
  private conversations: Map<string, Conversation> = new Map();

  async saveIdentity(identity: IdentityProfile): Promise<void> {
    this.identity = identity;
  }

  async getIdentity(): Promise<IdentityProfile | null> {
    return this.identity;
  }

  async saveContact(contact: Contact): Promise<void> {
    this.contacts.set(contact.id, contact);
  }

  async getContacts(): Promise<Contact[]> {
    return Array.from(this.contacts.values());
  }

  async saveConversation(conversation: Conversation): Promise<void> {
    this.conversations.set(conversation.id, conversation);
  }

  async getConversations(): Promise<Conversation[]> {
    return Array.from(this.conversations.values());
  }
}
