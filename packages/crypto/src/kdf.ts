import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";

export const DOMAIN_STRINGS = {
  IDENTITY_ED25519: "CampusMesh-Ed25519-IdentityKey-v1",
  IDENTITY_X25519: "CampusMesh-X25519-SignedPreKey-v1",
  DEVICE_BINDING: "CampusMesh-Device-Binding-v1",
  ONE_TIME_PREKEYS: "CampusMesh-OneTimePreKey-Batch-v1",
} as const;

export const DOMAIN_SEPARATION = {
  ED25519_IDENTITY: DOMAIN_STRINGS.IDENTITY_ED25519,
  X25519_SIGNED_PREKEY: DOMAIN_STRINGS.IDENTITY_X25519,
  DEVICE_BINDING: DOMAIN_STRINGS.DEVICE_BINDING,
  ONE_TIME_PREKEYS: DOMAIN_STRINGS.ONE_TIME_PREKEYS,
} as const;

/**
 * Derives a 32-byte domain-separated subkey from master seed using HKDF-SHA256.
 */
export function deriveSubkey(
  masterSeed: Uint8Array,
  domainString: string,
  salt?: Uint8Array,
  length = 32,
): Uint8Array {
  const info = new TextEncoder().encode(domainString);
  return hkdf(sha256, masterSeed, salt, info, length);
}
