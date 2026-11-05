import { describe, it, expect } from "vitest";
import {
  DeliveryState,
  SignalingState,
  PeerConnectionState,
  MessageType,
} from "./index";

describe("@campusmesh/shared-types", () => {
  it("should export all 6 delivery states", () => {
    expect(DeliveryState.SAVED_LOCALLY).toBe("SAVED_LOCALLY");
    expect(DeliveryState.CONNECTING).toBe("CONNECTING");
    expect(DeliveryState.SENT).toBe("SENT");
    expect(DeliveryState.DELIVERED).toBe("DELIVERED");
    expect(DeliveryState.READ).toBe("READ");
    expect(DeliveryState.FAILED).toBe("FAILED");
  });

  it("should export signaling states with quota alert", () => {
    expect(SignalingState.UNAVAILABLE_QUOTA).toBe("UNAVAILABLE_QUOTA");
  });

  it("should export peer connection states", () => {
    expect(PeerConnectionState.CONNECTED).toBe("CONNECTED");
  });

  it("should export message types", () => {
    expect(MessageType.TEXT).toBe("TEXT");
    expect(MessageType.ACK).toBe("ACK");
  });
});
