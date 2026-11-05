import { describe, it, expect } from "vitest";
import { serializeEnvelope, deserializeEnvelope } from "./index";
import { MessageType, type WireEnvelope } from "@campusmesh/shared-types";

describe("@campusmesh/protocol", () => {
  it("should round-trip serialize and deserialize an envelope", () => {
    const envelope: WireEnvelope = {
      version: 1,
      id: "env_1",
      type: MessageType.TEXT,
      conversationId: "conv_1",
      senderFingerprint: "fp_abc",
      timestamp: Date.now(),
      sequenceNumber: 1,
      payloadCiphertext: "ciphertext",
      authTag: "tag",
      signature: "sig",
    };

    const raw = serializeEnvelope(envelope);
    const decoded = deserializeEnvelope(raw);
    expect(decoded).toEqual(envelope);
  });
});
