import {
  type Contact,
  ContactVerificationStatus,
} from "@campusmesh/shared-types";
import type { IStoragePort } from "@campusmesh/storage";
import { generateSafetyNumber } from "@campusmesh/crypto";

export interface AddContactInput {
  fingerprint: string;
  displayName: string;
  safetyNumber?: string | undefined;
  ed25519PublicKey?: string | undefined;
  x25519PublicKey?: string | undefined;
  avatarUrl?: string | undefined;
}

export interface ParsedContactPayload {
  fingerprint: string;
  displayName: string;
  ed25519PublicKey?: string | undefined;
  x25519PublicKey?: string | undefined;
}

export class ContactManager {
  private storage: IStoragePort;
  private localFingerprint?: string | undefined;

  constructor(storage: IStoragePort, localFingerprint?: string) {
    this.storage = storage;
    this.localFingerprint = localFingerprint;
  }

  public setLocalFingerprint(fingerprint: string): void {
    this.localFingerprint = fingerprint;
  }

  public computeSafetyNumber(peerFingerprint: string): string {
    if (!this.localFingerprint) {
      throw new Error("Local fingerprint not configured on ContactManager");
    }
    return generateSafetyNumber(this.localFingerprint, peerFingerprint);
  }

  public parseContactQrPayload(rawText: string): ParsedContactPayload | null {
    if (!rawText || typeof rawText !== "string") {
      return null;
    }

    const trimmed = rawText.trim();

    // 1. Check for JSON format
    if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
      try {
        const parsed = JSON.parse(trimmed) as Record<string, unknown>;
        const fp = (parsed.fingerprint ?? parsed.fp) as string | undefined;
        const name = (parsed.displayName ?? parsed.name ?? "Peer") as string;
        const ed = (parsed.ed25519PublicKey ??
          parsed.ed25519 ??
          parsed.edPk) as string | undefined;
        const x = (parsed.x25519PublicKey ?? parsed.x25519 ?? parsed.xPk) as
          string | undefined;

        if (fp && typeof fp === "string" && fp.length >= 8) {
          return {
            fingerprint: fp,
            displayName: name,
            ...(ed ? { ed25519PublicKey: ed } : {}),
            ...(x ? { x25519PublicKey: x } : {}),
          };
        }
      } catch {
        // Fall through
      }
    }

    // 2. Check for URL schema: campusmesh://identity?... or campusmesh://invite?... or https://...?fp=...
    if (
      trimmed.startsWith("campusmesh:") ||
      trimmed.startsWith("http://") ||
      trimmed.startsWith("https://")
    ) {
      try {
        const url = new URL(trimmed);
        const fp =
          url.searchParams.get("fp") || url.searchParams.get("fingerprint");
        const name =
          url.searchParams.get("name") ||
          url.searchParams.get("displayName") ||
          "Peer";
        const ed =
          url.searchParams.get("edPk") ||
          url.searchParams.get("ed") ||
          url.searchParams.get("ed25519PublicKey") ||
          undefined;
        const x =
          url.searchParams.get("xPk") ||
          url.searchParams.get("x") ||
          url.searchParams.get("x25519PublicKey") ||
          undefined;

        if (fp && fp.length >= 8) {
          let decodedName = name;
          try {
            decodedName = decodeURIComponent(name);
          } catch {
            decodedName = name;
          }
          return {
            fingerprint: fp,
            displayName: decodedName,
            ...(ed ? { ed25519PublicKey: ed } : {}),
            ...(x ? { x25519PublicKey: x } : {}),
          };
        }
      } catch {
        // Fall through
      }
    }

    // 3. Check for raw fingerprint prefix format: cm:fp:... or raw hex/base64
    if (trimmed.startsWith("cm:fp:")) {
      const fp = trimmed.replace("cm:fp:", "").trim();
      if (fp.length >= 8) {
        return {
          fingerprint: fp,
          displayName: `Peer (${fp.slice(0, 8)})`,
        };
      }
    }

    // 4. Raw fingerprint format: fp_... or bare hex/base64 (8 to 128 characters)
    if (trimmed.startsWith("fp_") || /^[a-zA-Z0-9_-]{8,128}$/.test(trimmed)) {
      return {
        fingerprint: trimmed,
        displayName: `Peer (${trimmed.slice(0, 8)})`,
      };
    }

    return null;
  }

  public async addContact(input: AddContactInput): Promise<Contact> {
    const existing = await this.storage.getContactByFingerprint(
      input.fingerprint,
    );

    let safetyNumber = input.safetyNumber;
    if (!safetyNumber && this.localFingerprint) {
      safetyNumber = this.computeSafetyNumber(input.fingerprint);
    }
    if (!safetyNumber) {
      safetyNumber = "0000 0000 0000 0000 0000 0000";
    }

    const contact: Contact = {
      id:
        existing?.id ??
        `contact-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      fingerprint: input.fingerprint,
      displayName: input.displayName.trim() || "Anonymous Peer",
      safetyNumber,
      isVerified: existing?.isVerified ?? false,
      verificationStatus:
        existing?.verificationStatus ?? ContactVerificationStatus.UNVERIFIED,
      isBlocked: existing?.isBlocked ?? false,
      ...(input.avatarUrl !== undefined
        ? { avatarUrl: input.avatarUrl }
        : existing?.avatarUrl !== undefined
          ? { avatarUrl: existing.avatarUrl }
          : {}),
      ...(input.ed25519PublicKey !== undefined
        ? { ed25519PublicKey: input.ed25519PublicKey }
        : existing?.ed25519PublicKey !== undefined
          ? { ed25519PublicKey: existing.ed25519PublicKey }
          : {}),
      ...(input.x25519PublicKey !== undefined
        ? { x25519PublicKey: input.x25519PublicKey }
        : existing?.x25519PublicKey !== undefined
          ? { x25519PublicKey: existing.x25519PublicKey }
          : {}),
      addedAt: existing?.addedAt ?? Date.now(),
      lastSeen: existing?.lastSeen,
    };

    await this.storage.saveContact(contact);
    return contact;
  }

  public async getContact(idOrFingerprint: string): Promise<Contact | null> {
    const byFingerprint =
      await this.storage.getContactByFingerprint(idOrFingerprint);
    if (byFingerprint) {
      return byFingerprint;
    }

    const contacts = await this.storage.getContacts();
    return contacts.find((c) => c.id === idOrFingerprint) ?? null;
  }

  public async listContacts(filter?: {
    isBlocked?: boolean | undefined;
    isVerified?: boolean | undefined;
    search?: string | undefined;
  }): Promise<Contact[]> {
    let contacts = await this.storage.getContacts();

    if (filter?.isBlocked !== undefined) {
      contacts = contacts.filter((c) => c.isBlocked === filter.isBlocked);
    }
    if (filter?.isVerified !== undefined) {
      contacts = contacts.filter((c) => c.isVerified === filter.isVerified);
    }
    if (filter?.search) {
      const q = filter.search.toLowerCase();
      contacts = contacts.filter(
        (c) =>
          c.displayName.toLowerCase().includes(q) ||
          c.fingerprint.toLowerCase().includes(q),
      );
    }

    return contacts;
  }

  public async verifySafetyNumber(
    fingerprint: string,
    isVerified = true,
  ): Promise<Contact> {
    const contact = await this.storage.getContactByFingerprint(fingerprint);
    if (!contact) {
      throw new Error(`Contact not found for fingerprint: ${fingerprint}`);
    }

    contact.isVerified = isVerified;
    contact.verificationStatus = isVerified
      ? ContactVerificationStatus.VERIFIED
      : ContactVerificationStatus.UNVERIFIED;

    await this.storage.saveContact(contact);
    return contact;
  }

  public async blockContact(
    fingerprint: string,
    isBlocked = true,
  ): Promise<Contact> {
    const contact = await this.storage.getContactByFingerprint(fingerprint);
    if (!contact) {
      throw new Error(`Contact not found for fingerprint: ${fingerprint}`);
    }

    contact.isBlocked = isBlocked;
    await this.storage.saveContact(contact);
    return contact;
  }

  public async deleteContact(fingerprint: string): Promise<void> {
    const contact = await this.storage.getContactByFingerprint(fingerprint);
    if (contact) {
      await this.storage.deleteContact(contact.id);
    }
  }
}
