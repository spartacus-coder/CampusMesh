import type { IdentityProfile } from "@campusmesh/shared-types";

export interface IIdentityManager {
  createIdentity(displayName: string): Promise<IdentityProfile>;
  validateFingerprint(fingerprint: string): boolean;
}

export class IdentityManager implements IIdentityManager {
  async createIdentity(displayName: string): Promise<IdentityProfile> {
    const id = `usr_${Date.now()}`;
    return {
      id,
      fingerprint: `fp_${id}`,
      displayName,
      ed25519PublicKey: "mock_ed25519_pk",
      x25519PublicKey: "mock_x25519_pk",
      createdAt: Date.now(),
    };
  }

  validateFingerprint(fingerprint: string): boolean {
    return typeof fingerprint === "string" && fingerprint.length > 0;
  }
}
