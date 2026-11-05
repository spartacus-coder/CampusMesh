import { describe, it, expect, beforeEach } from "vitest";
import { InMemoryStorageAdapter } from "./index";
import type { IdentityProfile } from "@campusmesh/shared-types";

describe("@campusmesh/storage", () => {
  let storage: InMemoryStorageAdapter;

  beforeEach(() => {
    storage = new InMemoryStorageAdapter();
  });

  it("should store and retrieve an identity profile", async () => {
    const profile: IdentityProfile = {
      id: "usr_1",
      fingerprint: "fp_123",
      displayName: "Alice",
      ed25519PublicKey: "pk_ed",
      x25519PublicKey: "pk_x",
      createdAt: Date.now(),
    };

    await storage.saveIdentity(profile);
    const retrieved = await storage.getIdentity();
    expect(retrieved).toEqual(profile);
  });
});
