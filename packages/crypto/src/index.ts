/**
 * @campusmesh/crypto
 * Cryptographic engine, BIP-39 recovery, domain separation, Ed25519/X25519, and encrypted keystores.
 */

export * from "./bip39";
export * from "./kdf";
export * from "./ed25519";
export * from "./x25519";
export * from "./fingerprint";
export * from "./keystore";

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
