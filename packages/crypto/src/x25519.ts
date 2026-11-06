import { x25519 } from "@noble/curves/ed25519.js";

export interface X25519KeyPair {
  privateKey: Uint8Array;
  publicKey: Uint8Array;
}

export function generateX25519FromSeed(seed: Uint8Array): X25519KeyPair {
  const privateKey = seed.slice(0, 32);
  const publicKey = x25519.getPublicKey(privateKey);
  return { privateKey, publicKey };
}

export function computeX25519SharedSecret(
  privateKey: Uint8Array,
  peerPublicKey: Uint8Array,
): Uint8Array {
  return x25519.getSharedSecret(privateKey, peerPublicKey);
}
