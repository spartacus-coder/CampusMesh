import { describe, it, expect } from "vitest";
import {
  createSignedEnvelope,
  verifyEnvelopeSignature,
  serializeEnvelope,
  deserializeEnvelope,
} from "./index";
import { generateEd25519FromSeed } from "@campusmesh/crypto";
import { MessageType } from "@campusmesh/shared-types";

describe("@campusmesh/protocol envelope suite", () => {
  const seed = new Uint8Array(32).fill(0x33);
  const keyPair = generateEd25519FromSeed(seed);

  it("should create signed envelope and verify signature successfully", () => {
    const envelope = createSignedEnvelope({
      type: MessageType.TEXT,
      conversationId: "conv-cs101",
      senderFingerprint: "fp-alice-1234",
      sequenceNumber: 1,
      payloadCiphertext: "encrypted-hex-data",
      authTag: "auth-tag-hex",
      privateSigningKey: keyPair.privateKey,
    });

    expect(envelope.id).toBeDefined();
    expect(envelope.signature).toBeDefined();
    expect(verifyEnvelopeSignature(envelope, keyPair.publicKey)).toBe(true);

    // Serialization & deserialization roundtrip
    const serialized = serializeEnvelope(envelope);
    const deserialized = deserializeEnvelope(serialized);
    expect(deserialized.id).toBe(envelope.id);
    expect(verifyEnvelopeSignature(deserialized, keyPair.publicKey)).toBe(true);
  });

  it("should reject envelope if content or metadata is tampered with", () => {
    const envelope = createSignedEnvelope({
      type: MessageType.TEXT,
      conversationId: "conv-cs101",
      senderFingerprint: "fp-alice-1234",
      sequenceNumber: 2,
      payloadCiphertext: "original-ciphertext",
      authTag: "auth-tag-hex",
      privateSigningKey: keyPair.privateKey,
    });

    // Tamper ciphertext
    const tampered = { ...envelope, payloadCiphertext: "tampered-ciphertext" };
    expect(verifyEnvelopeSignature(tampered, keyPair.publicKey)).toBe(false);

    // Tamper sequence number
    const tamperedSeq = { ...envelope, sequenceNumber: 999 };
    expect(verifyEnvelopeSignature(tamperedSeq, keyPair.publicKey)).toBe(false);
  });

  it("should reject malformed raw JSON strings on deserialization", () => {
    expect(() => deserializeEnvelope("{}")).toThrow("missing required fields");
    expect(() => deserializeEnvelope("not-json")).toThrow();
  });
});
