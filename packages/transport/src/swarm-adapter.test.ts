import { describe, it, expect, vi } from "vitest";
import {
  DesktopIpcSwarmAdapter,
  WebRtcSwarmGatewayAdapter,
  deriveTopicHex,
  uint8ToBase64,
  base64ToUint8,
} from "./swarm-adapter";

describe("@campusmesh/transport IPeerSwarmAdapter suite", () => {
  it("should derive deterministic 64-hex Hyperswarm topics", async () => {
    const t1 = await deriveTopicHex("cm:campus", "global");
    const t2 = await deriveTopicHex("cm:campus", "global");
    const t3 = await deriveTopicHex("cm:peer", "fp-alice");

    expect(t1).toMatch(/^[a-f0-9]{64}$/);
    expect(t1).toBe(t2);
    expect(t1).not.toBe(t3);
  });

  it("should bridge DesktopIpcSwarmAdapter commands and events cleanly", async () => {
    const bridge = {
      joinSwarm: vi.fn().mockResolvedValue(undefined),
      leaveSwarm: vi.fn().mockResolvedValue(undefined),
      broadcast: vi.fn().mockResolvedValue(undefined),
      sendDirect: vi.fn().mockResolvedValue(undefined),
      destroy: vi.fn().mockResolvedValue(undefined),
    };

    const adapter = new DesktopIpcSwarmAdapter(bridge);
    expect(adapter.protocol).toBe("hyperswarm-dht");

    const onPeer = vi.fn();
    const onData = vi.fn();
    adapter.on("peer-joined", onPeer);
    adapter.on("data", onData);

    await adapter.joinSwarm("ab".repeat(32));
    expect(bridge.joinSwarm).toHaveBeenCalledWith("ab".repeat(32));

    const msgBytes = new TextEncoder().encode("hello swarm");
    await adapter.broadcast("ab".repeat(32), msgBytes);
    expect(bridge.broadcast).toHaveBeenCalledWith(
      "ab".repeat(32),
      uint8ToBase64(msgBytes),
    );

    adapter.emitPeerJoined({
      peerId: "fp-bob",
      discoveryKey: "dk-1",
      connectionType: "direct-utp",
    });
    expect(onPeer).toHaveBeenCalledWith(
      expect.objectContaining({
        peerId: "fp-bob",
        connectionType: "direct-utp",
      }),
    );

    adapter.emitData("fp-bob", msgBytes);
    expect(onData).toHaveBeenCalledWith("fp-bob", msgBytes);

    await adapter.destroy();
    expect(bridge.destroy).toHaveBeenCalled();
  });

  it("should route Web/APK swarm traffic through Desktop Hybrid Gateway when connected", async () => {
    const sent: Array<{ target: string; packet: unknown }> = [];
    const gatewayAdapter = new WebRtcSwarmGatewayAdapter({
      sendControlPacket: (target, packet) => {
        sent.push({ target, packet });
        return true;
      },
      getConnectedPeers: () => ["fp-peer-1"],
    });

    expect(gatewayAdapter.protocol).toBe("webrtc-mesh");

    // Join topic before gateway hello
    await gatewayAdapter.joinSwarm("cc".repeat(32));

    const joined = vi.fn();
    const received = vi.fn();
    gatewayAdapter.on("peer-joined", joined);
    gatewayAdapter.on("data", received);

    // Desktop peer announces Hybrid Gateway capability
    gatewayAdapter.handleControlPacket("fp-desktop-gw", {
      type: "swarm_gateway_hello",
      gatewayFingerprint: "fp-desktop-gw",
      swarmPublicKey: "pk-dht-123",
    });

    expect(gatewayAdapter.getGatewayPeer()).toBe("fp-desktop-gw");
    expect(joined).toHaveBeenCalledWith(
      expect.objectContaining({ peerId: "fp-desktop-gw", isGateway: true }),
    );
    // Automatically replays previously joined topic to gateway
    expect(sent.some((s) => s.target === "fp-desktop-gw")).toBe(true);

    // Publishing routes via gateway rather than fanning out N-to-N
    sent.length = 0;
    const payload = new TextEncoder().encode("via gateway");
    await gatewayAdapter.broadcast("cc".repeat(32), payload);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      target: "fp-desktop-gw",
      packet: {
        type: "swarm_publish",
        topicHex: "cc".repeat(32),
      },
    });

    // Receiving relayed data decodes original sender fingerprint
    gatewayAdapter.handleControlPacket("fp-desktop-gw", {
      type: "swarm_deliver",
      senderFingerprint: "fp-remote-utp-peer",
      payload: uint8ToBase64(payload),
    });
    expect(received).toHaveBeenCalledTimes(1);
    const [from, bytes] = received.mock.calls[0]!;
    expect(from).toBe("fp-remote-utp-peer");
    expect(new TextDecoder().decode(bytes)).toBe("via gateway");
    expect(base64ToUint8(uint8ToBase64(payload))).toEqual(payload);
  });
});
