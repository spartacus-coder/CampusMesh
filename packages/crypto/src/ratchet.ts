import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, hexToBytes, randomBytes } from "@noble/hashes/utils.js";
import {
  generateX25519FromSeed,
  computeX25519SharedSecret,
  type X25519KeyPair,
} from "./x25519";

export const RATCHET_DOMAIN_STRINGS = {
  ROOT_KDF: "CampusMesh-Ratchet-RootKDF-v1",
  CHAIN_KDF: "CampusMesh-Ratchet-ChainKDF-v1",
  MESSAGE_KEY: "CampusMesh-Ratchet-MessageKey-v1",
} as const;

export interface RatchetHeader {
  dhPublicKey: string; // hex
  previousChainLength: number;
  messageIndex: number;
}

export interface EncryptedMessagePayload {
  header: RatchetHeader;
  ciphertext: string; // hex
  iv: string; // hex
}

const MAX_SKIPPED_KEYS = 50;

/**
 * Root KDF deriving new root key and chain key from current root key and DH shared secret.
 */
export function kdfRk(
  rootKey: Uint8Array,
  dhSharedSecret: Uint8Array,
): { nextRootKey: Uint8Array; chainKey: Uint8Array } {
  const derived = hkdf(
    sha256,
    dhSharedSecret,
    rootKey,
    new TextEncoder().encode(RATCHET_DOMAIN_STRINGS.ROOT_KDF),
    64,
  );
  return {
    nextRootKey: derived.slice(0, 32),
    chainKey: derived.slice(32, 64),
  };
}

/**
 * Chain KDF deriving next chain key and message key.
 */
export function kdfCk(chainKey: Uint8Array): {
  nextChainKey: Uint8Array;
  messageKey: Uint8Array;
} {
  const derived = hkdf(
    sha256,
    chainKey,
    undefined,
    new TextEncoder().encode(RATCHET_DOMAIN_STRINGS.CHAIN_KDF),
    64,
  );
  return {
    nextChainKey: derived.slice(0, 32),
    messageKey: derived.slice(32, 64),
  };
}

export class DoubleRatchetSession {
  private dhs: X25519KeyPair; // Our current ratchet DH keypair
  private dhr: Uint8Array | null = null; // Remote peer's current ratchet DH public key
  private rk: Uint8Array; // 32-byte root key
  private cks: Uint8Array | null = null; // Sending chain key
  private ckr: Uint8Array | null = null; // Receiving chain key
  private ns = 0; // Sending message sequence number
  private nr = 0; // Receiving message sequence number
  private pn = 0; // Previous sending chain length
  private skippedMessageKeys = new Map<string, Uint8Array>();

  constructor(
    rootKey: Uint8Array,
    localDhKeyPair: X25519KeyPair,
    remoteDhPublicKey?: Uint8Array,
    isAlice = false,
  ) {
    this.rk = new Uint8Array(rootKey);
    this.dhs = localDhKeyPair;

    if (remoteDhPublicKey) {
      this.dhr = new Uint8Array(remoteDhPublicKey);
      if (isAlice) {
        // Alice initiates the ratchet step immediately
        const dhSecret = computeX25519SharedSecret(
          this.dhs.privateKey,
          this.dhr,
        );
        const { nextRootKey, chainKey } = kdfRk(this.rk, dhSecret);
        this.rk = nextRootKey;
        this.cks = chainKey;
      }
    }
  }

  public getDhPublicKey(): Uint8Array {
    return this.dhs.publicKey;
  }

  /**
   * Encrypts plaintext message using current sending ratchet chain.
   */
  public async encrypt(
    plaintext: Uint8Array,
    associatedData?: Uint8Array,
  ): Promise<EncryptedMessagePayload> {
    if (!this.cks) {
      if (!this.dhr) {
        throw new Error(
          "Cannot encrypt: remote ratchet public key is not established",
        );
      }
      const dhSecret = computeX25519SharedSecret(this.dhs.privateKey, this.dhr);
      const { nextRootKey, chainKey } = kdfRk(this.rk, dhSecret);
      this.rk = nextRootKey;
      this.cks = chainKey;
    }

    const { nextChainKey, messageKey } = kdfCk(this.cks);
    this.cks = nextChainKey;

    const header: RatchetHeader = {
      dhPublicKey: bytesToHex(this.dhs.publicKey),
      previousChainLength: this.pn,
      messageIndex: this.ns,
    };
    this.ns++;

    const iv = randomBytes(12);
    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      messageKey as unknown as ArrayBuffer,
      { name: "AES-GCM" },
      false,
      ["encrypt"],
    );

    const encryptedBuffer = await crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv: iv as unknown as ArrayBuffer,
        additionalData: associatedData as unknown as ArrayBuffer,
      },
      cryptoKey,
      plaintext as unknown as ArrayBuffer,
    );

    // Forward secrecy: zero out messageKey immediately
    messageKey.fill(0);

    return {
      header,
      ciphertext: bytesToHex(new Uint8Array(encryptedBuffer)),
      iv: bytesToHex(iv),
    };
  }

  /**
   * Decrypts incoming message payload and steps the ratchet if necessary.
   */
  public async decrypt(
    payload: EncryptedMessagePayload,
    associatedData?: Uint8Array,
  ): Promise<Uint8Array> {
    const { header, ciphertext, iv } = payload;
    const remoteDhBytes = hexToBytes(header.dhPublicKey);
    const skippedKeyId = `${header.dhPublicKey}:${header.messageIndex}`;

    // 1. Check if message key was previously skipped
    const skippedKey = this.skippedMessageKeys.get(skippedKeyId);
    if (skippedKey) {
      this.skippedMessageKeys.delete(skippedKeyId);
      return this.aesDecrypt(
        skippedKey,
        hexToBytes(ciphertext),
        hexToBytes(iv),
        associatedData,
      );
    }

    // 2. If new remote DH public key received, perform DH ratchet step
    if (!this.dhr || bytesToHex(this.dhr) !== header.dhPublicKey) {
      this.skipMessageKeys(header.previousChainLength);
      this.dhRatchetStep(remoteDhBytes);
    }

    // 3. Skip any missed messages in current receiving chain
    this.skipMessageKeys(header.messageIndex);

    // 4. Derive current message key
    if (!this.ckr) {
      throw new Error("Receiving chain key is not initialized");
    }

    const { nextChainKey, messageKey } = kdfCk(this.ckr);
    this.ckr = nextChainKey;
    this.nr++;

    return this.aesDecrypt(
      messageKey,
      hexToBytes(ciphertext),
      hexToBytes(iv),
      associatedData,
    );
  }

  private skipMessageKeys(untilIndex: number) {
    if (!this.ckr || !this.dhr) return;

    if (this.nr + MAX_SKIPPED_KEYS < untilIndex) {
      throw new Error(
        "Too many skipped messages: threshold exceeded to prevent DoS",
      );
    }

    while (this.nr < untilIndex) {
      const { nextChainKey, messageKey } = kdfCk(this.ckr);
      this.ckr = nextChainKey;
      const keyId = `${bytesToHex(this.dhr)}:${this.nr}`;
      this.skippedMessageKeys.set(keyId, messageKey);
      this.nr++;

      // Enforce bounded skipped keys limit
      if (this.skippedMessageKeys.size > MAX_SKIPPED_KEYS) {
        const oldestKey = this.skippedMessageKeys.keys().next().value;
        if (oldestKey) {
          const keyToZero = this.skippedMessageKeys.get(oldestKey);
          if (keyToZero) keyToZero.fill(0);
          this.skippedMessageKeys.delete(oldestKey);
        }
      }
    }
  }

  private dhRatchetStep(newRemoteDhPublicKey: Uint8Array) {
    this.pn = this.ns;
    this.ns = 0;
    this.nr = 0;
    this.dhr = newRemoteDhPublicKey;

    // Receive ratchet step
    const dhReceive = computeX25519SharedSecret(this.dhs.privateKey, this.dhr);
    const step1 = kdfRk(this.rk, dhReceive);
    this.rk = step1.nextRootKey;
    this.ckr = step1.chainKey;

    // Generate new ephemeral DH keypair for sending ratchet step
    this.dhs = generateX25519FromSeed(randomBytes(32));

    const dhSend = computeX25519SharedSecret(this.dhs.privateKey, this.dhr);
    const step2 = kdfRk(this.rk, dhSend);
    this.rk = step2.nextRootKey;
    this.cks = step2.chainKey;
  }

  private async aesDecrypt(
    keyBytes: Uint8Array,
    ciphertext: Uint8Array,
    iv: Uint8Array,
    associatedData?: Uint8Array,
  ): Promise<Uint8Array> {
    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      keyBytes as unknown as ArrayBuffer,
      { name: "AES-GCM" },
      false,
      ["decrypt"],
    );

    try {
      const decrypted = await crypto.subtle.decrypt(
        {
          name: "AES-GCM",
          iv: iv as unknown as ArrayBuffer,
          additionalData: associatedData as unknown as ArrayBuffer,
        },
        cryptoKey,
        ciphertext as unknown as ArrayBuffer,
      );
      // Zero out key
      keyBytes.fill(0);
      return new Uint8Array(decrypted);
    } catch {
      keyBytes.fill(0);
      throw new Error(
        "Decryption failed: corrupted ciphertext or invalid message key",
      );
    }
  }
}
