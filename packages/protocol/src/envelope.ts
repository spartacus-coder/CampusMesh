import type { WireEnvelope, MessageType } from "@campusmesh/shared-types";
import {
  signMessage,
  verifySignature,
  type RatchetHeader,
} from "@campusmesh/crypto";

export function computeCanonicalEnvelopeString(
  envelope: Omit<WireEnvelope, "signature">,
): string {
  const ratchetPart = envelope.ratchetHeader
    ? `${envelope.ratchetHeader.dhPublicKey}:${envelope.ratchetHeader.previousChainLength}:${envelope.ratchetHeader.messageIndex}`
    : "";
  return [
    envelope.version,
    envelope.id,
    envelope.type,
    envelope.conversationId,
    envelope.senderFingerprint,
    envelope.timestamp,
    envelope.sequenceNumber,
    ratchetPart,
    envelope.payloadCiphertext,
    envelope.authTag,
  ].join("|");
}

export function createSignedEnvelope(params: {
  id?: string;
  type: MessageType;
  conversationId: string;
  senderFingerprint: string;
  timestamp?: number;
  sequenceNumber: number;
  ratchetHeader?: RatchetHeader;
  payloadCiphertext: string;
  authTag: string;
  privateSigningKey: Uint8Array;
}): WireEnvelope {
  const id =
    params.id ||
    `env_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  const timestamp = params.timestamp || Date.now();

  const unsignedEnvelope: Omit<WireEnvelope, "signature"> = {
    version: 1,
    id,
    type: params.type,
    conversationId: params.conversationId,
    senderFingerprint: params.senderFingerprint,
    timestamp,
    sequenceNumber: params.sequenceNumber,
    payloadCiphertext: params.payloadCiphertext,
    authTag: params.authTag,
    ...(params.ratchetHeader ? { ratchetHeader: params.ratchetHeader } : {}),
  };

  const canonicalStr = computeCanonicalEnvelopeString(unsignedEnvelope);
  const signatureBytes = signMessage(
    new TextEncoder().encode(canonicalStr),
    params.privateSigningKey,
  );

  let binary = "";
  for (let i = 0; i < signatureBytes.length; i++) {
    const b = signatureBytes[i];
    if (b !== undefined) {
      binary += String.fromCharCode(b);
    }
  }
  const signature = btoa(binary);

  return {
    ...unsignedEnvelope,
    signature,
  };
}

export function verifyEnvelopeSignature(
  envelope: WireEnvelope,
  senderEd25519PublicKey: Uint8Array,
): boolean {
  if (envelope.version !== 1 || !envelope.signature) return false;

  const unsigned: Omit<WireEnvelope, "signature"> = {
    version: envelope.version,
    id: envelope.id,
    type: envelope.type,
    conversationId: envelope.conversationId,
    senderFingerprint: envelope.senderFingerprint,
    timestamp: envelope.timestamp,
    sequenceNumber: envelope.sequenceNumber,
    payloadCiphertext: envelope.payloadCiphertext,
    authTag: envelope.authTag,
    ...(envelope.ratchetHeader
      ? { ratchetHeader: envelope.ratchetHeader }
      : {}),
  };

  const canonicalStr = computeCanonicalEnvelopeString(unsigned);
  try {
    const binary = atob(envelope.signature);
    const signatureBytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      signatureBytes[i] = binary.charCodeAt(i);
    }
    return verifySignature(
      signatureBytes,
      new TextEncoder().encode(canonicalStr),
      senderEd25519PublicKey,
    );
  } catch {
    return false;
  }
}
