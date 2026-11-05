import { describe, it, expect } from "vitest";
import { IdentityManager } from "./index";

describe("@campusmesh/identity", () => {
  it("should create an identity profile with display name", async () => {
    const manager = new IdentityManager();
    const profile = await manager.createIdentity("Bob");
    expect(profile.displayName).toBe("Bob");
    expect(profile.ed25519PublicKey).toBeDefined();
    expect(manager.validateFingerprint(profile.fingerprint)).toBe(true);
  });
});
