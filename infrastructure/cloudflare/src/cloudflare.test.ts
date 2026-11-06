import { describe, it, expect, vi } from "vitest";
import worker, { RoomCoordinator, validateSignalingMessage } from "./index";

describe("Cloudflare Signaling Infrastructure", () => {
  it("should validate signaling messages strictly", () => {
    expect(
      validateSignalingMessage({
        type: "offer",
        senderFingerprint: "fp-1234",
      }),
    ).toBe(true);

    expect(validateSignalingMessage(null)).toBe(false);
    expect(validateSignalingMessage({})).toBe(false);
    expect(validateSignalingMessage({ type: "offer" })).toBe(false);
  });

  it("worker should return health and budget information", async () => {
    const request = new Request(
      "https://signaling.campusmesh.workers.dev/api/health",
    );
    const env = {
      ROOM_COORDINATOR: {
        idFromName: () => "mock-id",
        get: () => ({ fetch: async () => new Response(null) }),
      },
    };
    const response = await worker.fetch(request, env);

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      status: string;
      budget: string;
      limits: { maxClientsPerRoom: number };
    };
    expect(body.status).toBe("ok");
    expect(body.budget).toBe("$0.00/month");
    expect(body.limits.maxClientsPerRoom).toBe(8);
  });

  it("RoomCoordinator should relay messages and enforce message handling", () => {
    const coordinator = new RoomCoordinator(null, {});

    const mockSocketA = {
      readyState: 1,
      send: vi.fn(),
      addEventListener: vi.fn(),
    } as unknown as WebSocket;
    const mockSocketB = {
      readyState: 1,
      send: vi.fn(),
      addEventListener: vi.fn(),
    } as unknown as WebSocket;

    // Inject active peer sockets
    const socketsMap = (
      coordinator as unknown as { sockets: Map<string, WebSocket> }
    ).sockets;
    socketsMap.set("fp-peer-a", mockSocketA);
    socketsMap.set("fp-peer-b", mockSocketB);

    // 1. Peer A sends ping -> receives pong
    coordinator.handleMessage(
      "fp-peer-a",
      JSON.stringify({ type: "ping", senderFingerprint: "fp-peer-a" }),
    );
    expect(mockSocketA.send).toHaveBeenCalledWith(
      expect.stringContaining('"type":"pong"'),
    );

    // 2. Peer A sends targeted message to Peer B
    coordinator.handleMessage(
      "fp-peer-a",
      JSON.stringify({
        type: "offer",
        senderFingerprint: "fp-peer-a",
        targetFingerprint: "fp-peer-b",
        data: { sdp: "mock-sdp" },
      }),
    );
    expect(mockSocketB.send).toHaveBeenCalledWith(
      expect.stringContaining('"targetFingerprint":"fp-peer-b"'),
    );

    // 3. Peer A leaves -> Peer B receives departure notification
    coordinator.handleClose("fp-peer-a");
    expect(coordinator.getClientCount()).toBe(1);
    expect(mockSocketB.send).toHaveBeenCalledWith(
      expect.stringContaining('"type":"leave"'),
    );
  });
});
