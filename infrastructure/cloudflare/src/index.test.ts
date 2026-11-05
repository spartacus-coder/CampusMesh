import { describe, it, expect } from "vitest";
import { validateSignalingMessage, SIGNALING_LIMITS } from "./index";

describe("@campusmesh/cloudflare-signaling", () => {
  it("should validate signaling limits", () => {
    expect(SIGNALING_LIMITS.MAX_CLIENTS_PER_ROOM).toBe(8);
    expect(SIGNALING_LIMITS.ROOM_EXPIRATION_SECONDS).toBe(900);
  });

  it("should validate well-formed signaling messages", () => {
    expect(
      validateSignalingMessage({
        type: "offer",
        senderFingerprint: "fp_123",
      }),
    ).toBe(true);

    expect(validateSignalingMessage(null)).toBe(false);
    expect(validateSignalingMessage({ type: "offer" })).toBe(false);
  });
});
