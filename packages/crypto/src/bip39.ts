import {
  generateMnemonic,
  mnemonicToSeed,
  validateMnemonic,
} from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";

/**
 * Generates a 24-word BIP-39 recovery mnemonic (256 bits of cryptographic entropy).
 */
export function generate24WordMnemonic(): string {
  return generateMnemonic(wordlist, 256);
}

/**
 * Validates a BIP-39 recovery mnemonic against the standard English wordlist.
 */
export function isValidMnemonic(mnemonic: string): boolean {
  return validateMnemonic(mnemonic.trim(), wordlist);
}

/**
 * Derives a 512-bit master seed from a BIP-39 mnemonic using PBKDF2-HMAC-SHA512.
 */
export async function mnemonicToMasterSeed(
  mnemonic: string,
  passphrase = "",
): Promise<Uint8Array> {
  if (!isValidMnemonic(mnemonic)) {
    throw new Error("Invalid BIP-39 recovery mnemonic");
  }
  return await mnemonicToSeed(mnemonic.trim(), passphrase);
}
