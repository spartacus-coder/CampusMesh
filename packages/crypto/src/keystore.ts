import { pbkdf2 } from "@noble/hashes/pbkdf2.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, hexToBytes, randomBytes } from "@noble/hashes/utils.js";

export interface EncryptedKeystoreBlob {
  version: 1;
  kdf: "PBKDF2-HMAC-SHA256";
  iterations: number;
  salt: string; // hex
  iv: string; // hex
  ciphertext: string; // hex
}

/**
 * Encrypts master identity seed with user passphrase using WebCrypto AES-GCM.
 */
export async function encryptKeystore(
  masterSeed: Uint8Array,
  passphrase: string,
  iterations = 100000,
): Promise<EncryptedKeystoreBlob> {
  const salt = randomBytes(16);
  const iv = randomBytes(12);

  // Derive 256-bit encryption key
  const derivedKeyBytes = pbkdf2(sha256, passphrase, salt, {
    c: iterations,
    dkLen: 32,
  });

  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    derivedKeyBytes as unknown as ArrayBuffer,
    { name: "AES-GCM" },
    false,
    ["encrypt"],
  );

  const encryptedBuffer = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv as unknown as ArrayBuffer },
    cryptoKey,
    masterSeed as unknown as ArrayBuffer,
  );

  return {
    version: 1,
    kdf: "PBKDF2-HMAC-SHA256",
    iterations,
    salt: bytesToHex(salt),
    iv: bytesToHex(iv),
    ciphertext: bytesToHex(new Uint8Array(encryptedBuffer)),
  };
}

/**
 * Decrypts master identity seed from Encrypted Keystore Blob.
 */
export async function decryptKeystore(
  blob: EncryptedKeystoreBlob,
  passphrase: string,
): Promise<Uint8Array> {
  if (blob.version !== 1) {
    throw new Error(`Unsupported keystore version: ${blob.version}`);
  }

  const salt = hexToBytes(blob.salt);
  const iv = hexToBytes(blob.iv);
  const ciphertext = hexToBytes(blob.ciphertext);

  const derivedKeyBytes = pbkdf2(sha256, passphrase, salt, {
    c: blob.iterations,
    dkLen: 32,
  });

  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    derivedKeyBytes as unknown as ArrayBuffer,
    { name: "AES-GCM" },
    false,
    ["decrypt"],
  );

  try {
    const decryptedBuffer = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: iv as unknown as ArrayBuffer },
      cryptoKey,
      ciphertext as unknown as ArrayBuffer,
    );
    return new Uint8Array(decryptedBuffer);
  } catch {
    throw new Error("Invalid passphrase or corrupted keystore");
  }
}
