import { describe, it, expect } from "vitest";
import { ContactBook } from "./index";
import type { Contact } from "@campusmesh/shared-types";

describe("@campusmesh/contacts", () => {
  it("should add, verify, and block a contact", () => {
    const book = new ContactBook();
    const contact: Contact = {
      id: "c_1",
      fingerprint: "fp_c1",
      displayName: "Charlie",
      safetyNumber: "12345 67890",
      isVerified: false,
      isBlocked: false,
    };

    book.addContact(contact);
    expect(book.getContact("c_1")?.isVerified).toBe(false);

    book.verifySafetyNumber("c_1");
    expect(book.getContact("c_1")?.isVerified).toBe(true);

    book.blockContact("c_1");
    expect(book.getContact("c_1")?.isBlocked).toBe(true);
  });
});
