export * from "./contact-manager";

import type { Contact } from "@campusmesh/shared-types";

export class ContactBook {
  private contacts = new Map<string, Contact>();

  addContact(contact: Contact): void {
    this.contacts.set(contact.id, contact);
  }

  getContact(id: string): Contact | undefined {
    return this.contacts.get(id);
  }

  verifySafetyNumber(id: string): void {
    const contact = this.contacts.get(id);
    if (contact) {
      contact.isVerified = true;
    }
  }

  blockContact(id: string): void {
    const contact = this.contacts.get(id);
    if (contact) {
      contact.isBlocked = true;
    }
  }
}
