import { ed25519 } from "@noble/curves/ed25519.js";

export interface Ed25519KeyPair {
  privateKey: Uint8Array;
  publicKey: Uint8Array;
}

export function generateEd25519FromSeed(seed: Uint8Array): Ed25519KeyPair {
  const privateKey = seed.slice(0, 32);
  const publicKey = ed25519.getPublicKey(privateKey);
  return { privateKey, publicKey };
}

export function signMessage(
  message: Uint8Array,
  privateKey: Uint8Array,
): Uint8Array {
  return ed25519.sign(message, privateKey);
}

export function verifySignature(
  signature: Uint8Array,
  message: Uint8Array,
  publicKey: Uint8Array,
): boolean {
  try {
    return ed25519.verify(signature, message, publicKey);
  } catch {
    return false;
  }
}
