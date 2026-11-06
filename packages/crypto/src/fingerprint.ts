import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";

/**
 * Computes canonical SHA-256 fingerprint from an Ed25519 public key.
 */
export function computeFingerprint(publicKey: Uint8Array): string {
  const hash = sha256(publicKey);
  return bytesToHex(hash);
}

/**
 * Formats a public key fingerprint into human-readable Safety Numbers (6 blocks of 4 digits).
 */
export function formatSafetyNumber(
  publicKeyA: Uint8Array,
  publicKeyB: Uint8Array,
): string {
  // Sort keys lexicographically so both parties compute identical safety numbers
  const sorted = [publicKeyA, publicKeyB].sort((a, b) => {
    for (let i = 0; i < Math.min(a.length, b.length); i++) {
      if (a[i] !== b[i]) return (a[i] ?? 0) - (b[i] ?? 0);
    }
    return a.length - b.length;
  });

  const combined = new Uint8Array(sorted[0]!.length + sorted[1]!.length);
  combined.set(sorted[0]!, 0);
  combined.set(sorted[1]!, sorted[0]!.length);

  const hash = sha256(combined);
  const numbers: string[] = [];

  // Generate 6 segments of 4-digit numbers (0000-9999)
  for (let i = 0; i < 6; i++) {
    const val =
      ((hash[i * 4]! << 24) |
        (hash[i * 4 + 1]! << 16) |
        (hash[i * 4 + 2]! << 8) |
        hash[i * 4 + 3]!) >>>
      0;
    const segment = (val % 10000).toString().padStart(4, "0");
    numbers.push(segment);
  }

  return numbers.join(" ");
}

/**
 * Generates human-readable Safety Numbers from public keys or fingerprint strings.
 */
export function generateSafetyNumber(
  identifierA: string | Uint8Array,
  identifierB: string | Uint8Array,
): string {
  const bytesA =
    typeof identifierA === "string"
      ? new TextEncoder().encode(identifierA)
      : identifierA;
  const bytesB =
    typeof identifierB === "string"
      ? new TextEncoder().encode(identifierB)
      : identifierB;
  return formatSafetyNumber(bytesA, bytesB);
}
