import { describe, it, expect } from "vitest";
import { BasicCryptoEngine, DOMAIN_STRINGS } from "./index";

describe("@campusmesh/crypto", () => {
  it("should define domain separation strings", () => {
    expect(DOMAIN_STRINGS.IDENTITY_ED25519).toBe(
      "CampusMesh-Ed25519-IdentityKey-v1",
    );
    expect(DOMAIN_STRINGS.IDENTITY_X25519).toBe(
      "CampusMesh-X25519-SignedPreKey-v1",
    );
  });

  it("should generate secure random bytes", () => {
    const engine = new BasicCryptoEngine();
    const bytes = engine.generateRandomBytes(32);
    expect(bytes).toHaveLength(32);
  });

  it("should compute SHA-256 hash", async () => {
    const engine = new BasicCryptoEngine();
    const data = new TextEncoder().encode("CampusMesh");
    const hash = await engine.hashSha256(data);
    expect(hash).toHaveLength(32);
  });
});
