import { describe, it, expect, beforeEach } from "vitest";
import { ContactManager, ContactBook } from "./index";
import { InMemoryStorageAdapter } from "@campusmesh/storage";
import { ContactVerificationStatus } from "@campusmesh/shared-types";

describe("@campusmesh/contacts suite", () => {
  let storage: InMemoryStorageAdapter;
  let manager: ContactManager;
  const myFingerprint = "fp-local-user-alice-0123456789";

  beforeEach(() => {
    storage = new InMemoryStorageAdapter();
    manager = new ContactManager(storage, myFingerprint);
  });

  it("should add a contact and automatically compute safety number", async () => {
    const peerFp = "fp-peer-bob-9876543210";
    const contact = await manager.addContact({
      fingerprint: peerFp,
      displayName: "Bob Engineer",
    });

    expect(contact.id).toBeDefined();
    expect(contact.fingerprint).toBe(peerFp);
    expect(contact.displayName).toBe("Bob Engineer");
    expect(contact.isVerified).toBe(false);
    expect(contact.isBlocked).toBe(false);
    expect(contact.safetyNumber).toMatch(
      /^\d{4} \d{4} \d{4} \d{4} \d{4} \d{4}$/,
    );

    const retrieved = await manager.getContact(peerFp);
    expect(retrieved).not.toBeNull();
    expect(retrieved?.displayName).toBe("Bob Engineer");
  });

  it("should update existing contact details when adding same fingerprint", async () => {
    const peerFp = "fp-peer-charlie";
    const c1 = await manager.addContact({
      fingerprint: peerFp,
      displayName: "Charlie",
    });

    await manager.verifySafetyNumber(peerFp, true);

    const c2 = await manager.addContact({
      fingerprint: peerFp,
      displayName: "Charlie Brown",
      avatarUrl: "https://example.com/charlie.png",
    });

    expect(c2.id).toBe(c1.id);
    expect(c2.displayName).toBe("Charlie Brown");
    expect(c2.isVerified).toBe(true);
    expect(c2.avatarUrl).toBe("https://example.com/charlie.png");
  });

  it("should parse QR payload formats correctly", () => {
    // 1. JSON
    const jsonPayload = JSON.stringify({
      v: 1,
      fp: "fp-qr-user-12345",
      name: "Dave",
      ed25519: "ed-key-abc",
      x25519: "x-key-def",
    });
    const parsedJson = manager.parseContactQrPayload(jsonPayload);
    expect(parsedJson).toEqual({
      fingerprint: "fp-qr-user-12345",
      displayName: "Dave",
      ed25519PublicKey: "ed-key-abc",
      x25519PublicKey: "x-key-def",
    });

    // 2. URL
    const urlPayload =
      "campusmesh://invite?fp=fp-url-user-99999&name=Eve&ed=ed-xyz";
    const parsedUrl = manager.parseContactQrPayload(urlPayload);
    expect(parsedUrl).toEqual({
      fingerprint: "fp-url-user-99999",
      displayName: "Eve",
      ed25519PublicKey: "ed-xyz",
    });

    // 3. Raw prefix
    const rawPayload = "cm:fp:fp-raw-code-77777";
    const parsedRaw = manager.parseContactQrPayload(rawPayload);
    expect(parsedRaw?.fingerprint).toBe("fp-raw-code-77777");

    // 4. Invalid payload
    expect(manager.parseContactQrPayload("invalid string")).toBeNull();
    expect(manager.parseContactQrPayload("")).toBeNull();
  });

  it("should verify and block contacts", async () => {
    const peerFp = "fp-test-status-peer";
    await manager.addContact({
      fingerprint: peerFp,
      displayName: "Frank",
    });

    // Verify
    const verified = await manager.verifySafetyNumber(peerFp, true);
    expect(verified.isVerified).toBe(true);
    expect(verified.verificationStatus).toBe(
      ContactVerificationStatus.VERIFIED,
    );

    // Block
    const blocked = await manager.blockContact(peerFp, true);
    expect(blocked.isBlocked).toBe(true);

    // List blocked
    const blockedList = await manager.listContacts({ isBlocked: true });
    expect(blockedList).toHaveLength(1);
    expect(blockedList[0]?.fingerprint).toBe(peerFp);

    // Unblock
    await manager.blockContact(peerFp, false);
    const unblockedList = await manager.listContacts({ isBlocked: true });
    expect(unblockedList).toHaveLength(0);
  });

  it("should filter contacts by search and verification state", async () => {
    await manager.addContact({
      fingerprint: "fp-alpha",
      displayName: "Alpha Student",
    });
    await manager.addContact({
      fingerprint: "fp-beta",
      displayName: "Beta Student",
    });
    await manager.verifySafetyNumber("fp-beta", true);

    const verifiedOnly = await manager.listContacts({ isVerified: true });
    expect(verifiedOnly).toHaveLength(1);
    expect(verifiedOnly[0]?.displayName).toBe("Beta Student");

    const searchResult = await manager.listContacts({ search: "Alpha" });
    expect(searchResult).toHaveLength(1);
    expect(searchResult[0]?.displayName).toBe("Alpha Student");
  });

  it("should delete contact", async () => {
    const peerFp = "fp-to-delete";
    await manager.addContact({
      fingerprint: peerFp,
      displayName: "Temporary Contact",
    });

    expect(await manager.getContact(peerFp)).not.toBeNull();
    await manager.deleteContact(peerFp);
    expect(await manager.getContact(peerFp)).toBeNull();
  });

  it("should maintain ContactBook compatibility", () => {
    const book = new ContactBook();
    const contact = {
      id: "c-legacy",
      fingerprint: "fp-leg",
      displayName: "Legacy",
      safetyNumber: "12345",
      isVerified: false,
      isBlocked: false,
    };
    book.addContact(contact);
    expect(book.getContact("c-legacy")).toEqual(contact);
    book.verifySafetyNumber("c-legacy");
    expect(book.getContact("c-legacy")?.isVerified).toBe(true);
    book.blockContact("c-legacy");
    expect(book.getContact("c-legacy")?.isBlocked).toBe(true);
  });
});
