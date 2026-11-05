import { describe, it, expect } from "vitest";
import { MockTransportAdapter, DEFAULT_STUN_SERVERS } from "./index";

describe("@campusmesh/transport", () => {
  it("should define official free STUN servers", () => {
    expect(DEFAULT_STUN_SERVERS).toContain("stun:stun.cloudflare.com:3478");
    expect(DEFAULT_STUN_SERVERS).toContain("stun:stun.l.google.com:19302");
  });

  it("should transition connection state in mock transport", async () => {
    const transport = new MockTransportAdapter();
    expect(transport.getConnectionState("peer_1")).toBe("NEW");
    await transport.connect("peer_1");
    expect(transport.getConnectionState("peer_1")).toBe("CONNECTED");
    await transport.disconnect("peer_1");
    expect(transport.getConnectionState("peer_1")).toBe("CLOSED");
  });
});
