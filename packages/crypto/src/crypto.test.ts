import { describe, it, expect } from "vitest";
import {
  generate24WordMnemonic,
  isValidMnemonic,
  mnemonicToMasterSeed,
  deriveSubkey,
  DOMAIN_SEPARATION,
  generateEd25519FromSeed,
  signMessage,
  verifySignature,
  generateX25519FromSeed,
  computeX25519SharedSecret,
  computeFingerprint,
  formatSafetyNumber,
  encryptKeystore,
  decryptKeystore,
} from "./index";

describe("@campusmesh/crypto - Comprehensive Cryptographic Suite", () => {
  it("should generate and validate 24-word BIP-39 recovery mnemonic", async () => {
    const mnemonic = generate24WordMnemonic();
    const words = mnemonic.trim().split(/\s+/);
    expect(words).toHaveLength(24);
    expect(isValidMnemonic(mnemonic)).toBe(true);
    expect(isValidMnemonic("invalid word sequence")).toBe(false);

    const seed = await mnemonicToMasterSeed(mnemonic, "optional-passphrase");
    expect(seed).toHaveLength(64); // 512-bit seed
  });

  it("should derive non-colliding subkeys using HKDF domain separation", () => {
    const masterSeed = new Uint8Array(64).fill(0xaa);
    const edKeySeed = deriveSubkey(
      masterSeed,
      DOMAIN_SEPARATION.ED25519_IDENTITY,
    );
    const xKeySeed = deriveSubkey(
      masterSeed,
      DOMAIN_SEPARATION.X25519_SIGNED_PREKEY,
    );
    const deviceKeySeed = deriveSubkey(
      masterSeed,
      DOMAIN_SEPARATION.DEVICE_BINDING,
    );

    expect(edKeySeed).toHaveLength(32);
    expect(xKeySeed).toHaveLength(32);
    expect(deviceKeySeed).toHaveLength(32);

    // Ensure strict domain separation: keys are distinct
    expect(edKeySeed).not.toEqual(xKeySeed);
    expect(edKeySeed).not.toEqual(deviceKeySeed);
    expect(xKeySeed).not.toEqual(deviceKeySeed);
  });

  it("should sign and verify messages with Ed25519 and reject tampered data", () => {
    const seed = new Uint8Array(32).fill(0x42);
    const keyPair = generateEd25519FromSeed(seed);
    const message = new TextEncoder().encode("CampusMesh E2EE Payload");

    const signature = signMessage(message, keyPair.privateKey);
    expect(signature).toHaveLength(64);

    const valid = verifySignature(signature, message, keyPair.publicKey);
    expect(valid).toBe(true);

    // Tampered message
    const tamperedMessage = new TextEncoder().encode("Tampered Payload");
    expect(verifySignature(signature, tamperedMessage, keyPair.publicKey)).toBe(
      false,
    );
  });

  it("should perform X25519 Diffie-Hellman key exchange and compute matching shared secrets", () => {
    const aliceSeed = new Uint8Array(32).fill(0x01);
    const bobSeed = new Uint8Array(32).fill(0x02);

    const aliceKeyPair = generateX25519FromSeed(aliceSeed);
    const bobKeyPair = generateX25519FromSeed(bobSeed);

    const aliceSharedSecret = computeX25519SharedSecret(
      aliceKeyPair.privateKey,
      bobKeyPair.publicKey,
    );
    const bobSharedSecret = computeX25519SharedSecret(
      bobKeyPair.privateKey,
      aliceKeyPair.publicKey,
    );

    expect(aliceSharedSecret).toHaveLength(32);
    expect(bobSharedSecret).toHaveLength(32);
    expect(aliceSharedSecret).toEqual(bobSharedSecret);
  });

  it("should compute fingerprint and matching 6-block safety numbers regardless of order", () => {
    const keyA = new Uint8Array(32).fill(0x01);
    const keyB = new Uint8Array(32).fill(0x02);

    const fp = computeFingerprint(keyA);
    expect(fp).toHaveLength(64); // 32-byte hex string

    const safetyA = formatSafetyNumber(keyA, keyB);
    const safetyB = formatSafetyNumber(keyB, keyA);

    // Must match symmetrically
    expect(safetyA).toEqual(safetyB);
    expect(safetyA.split(" ")).toHaveLength(6);
  });

  it("should encrypt and decrypt master seed keystore with passphrase and reject wrong passphrase", async () => {
    const masterSeed = new Uint8Array(64).fill(0x77);
    const passphrase = "Correct-Horse-Battery-Staple-99";

    const blob = await encryptKeystore(masterSeed, passphrase, 5000); // 5000 iterations for fast test
    expect(blob.version).toBe(1);
    expect(blob.ciphertext).toBeDefined();

    // Decrypt with correct passphrase
    const decrypted = await decryptKeystore(blob, passphrase);
    expect(decrypted).toEqual(masterSeed);

    // Decrypt with wrong passphrase must throw
    await expect(decryptKeystore(blob, "WrongPassword")).rejects.toThrow();
  });
});
