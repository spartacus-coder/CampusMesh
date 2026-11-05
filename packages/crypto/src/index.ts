/**
 * @campusmesh/crypto
 * Cryptographic engine interface and domain separation constants.
 */

export const DOMAIN_STRINGS = {
  IDENTITY_ED25519: "CampusMesh-Ed25519-IdentityKey-v1",
  IDENTITY_X25519: "CampusMesh-X25519-SignedPreKey-v1",
  DEVICE_BINDING: "CampusMesh-Device-Binding-v1",
  ONE_TIME_PREKEY: "CampusMesh-OneTimePreKey-Batch-v1",
} as const;

export interface ICryptoEngine {
  generateRandomBytes(length: number): Uint8Array;
  hashSha256(data: Uint8Array): Promise<Uint8Array>;
}

export class BasicCryptoEngine implements ICryptoEngine {
  generateRandomBytes(length: number): Uint8Array {
    const bytes = new Uint8Array(length);
    crypto.getRandomValues(bytes);
    return bytes;
  }

  async hashSha256(data: Uint8Array): Promise<Uint8Array> {
    const buffer = await crypto.subtle.digest(
      "SHA-256",
      data as unknown as ArrayBuffer,
    );
    return new Uint8Array(buffer);
  }
}
