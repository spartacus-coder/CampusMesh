import { describe, it, expect } from "vitest";
import { MessagingEngine } from "./index";
import { DeliveryState, MessageType } from "@campusmesh/shared-types";

describe("@campusmesh/messaging", () => {
  it("should track 6 delivery states starting from SAVED_LOCALLY", () => {
    const engine = new MessagingEngine();
    const msg = engine.createOutgoingMessage("conv_1", "fp_me", "Hello World");
    expect(msg.state).toBe(DeliveryState.SAVED_LOCALLY);

    engine.updateDeliveryState(msg.id, DeliveryState.CONNECTING);
    expect(engine.getMessage(msg.id)?.state).toBe(DeliveryState.CONNECTING);

    engine.updateDeliveryState(msg.id, DeliveryState.SENT);
    expect(engine.getMessage(msg.id)?.state).toBe(DeliveryState.SENT);

    engine.updateDeliveryState(msg.id, DeliveryState.DELIVERED);
    expect(engine.getMessage(msg.id)?.state).toBe(DeliveryState.DELIVERED);

    engine.updateDeliveryState(msg.id, DeliveryState.READ);
    expect(engine.getMessage(msg.id)?.state).toBe(DeliveryState.READ);
  });

  it("should validate incoming envelope format", () => {
    const engine = new MessagingEngine();
    const valid = engine.processIncomingEnvelope({
      version: 1,
      id: "env_1",
      type: MessageType.TEXT,
      conversationId: "conv_1",
      senderFingerprint: "fp_other",
      timestamp: Date.now(),
      sequenceNumber: 1,
      payloadCiphertext: "enc_data",
      authTag: "tag",
      signature: "sig",
    });
    expect(valid).toBe(true);
  });
});
