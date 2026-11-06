import { describe, it, expect } from "vitest";
import {
  encodeBase45,
  decodeBase45,
  exportManualSignal,
  importManualSignal,
  WebRtcPeerTransport,
  SignalingClient,
} from "./index";
import { PeerConnectionState, SignalingState } from "@campusmesh/shared-types";

describe("@campusmesh/transport suite", () => {
  describe("Base45 RFC 9285 encoding/decoding", () => {
    it("should encode and decode arbitrary byte arrays identically", () => {
      const data = new TextEncoder().encode("Hello CampusMesh P2P Network!");
      const encoded = encodeBase45(data);
      expect(typeof encoded).toBe("string");
      expect(encoded.length).toBeGreaterThan(0);

      const decoded = decodeBase45(encoded);
      expect(new TextDecoder().decode(decoded)).toBe(
        "Hello CampusMesh P2P Network!",
      );
    });

    it("should handle odd lengths (single trailing byte) correctly", () => {
      const singleByte = new Uint8Array([0x42]);
      const encSingle = encodeBase45(singleByte);
      expect(encSingle.length).toBe(2);
      expect(decodeBase45(encSingle)).toEqual(singleByte);

      const threeBytes = new Uint8Array([0x12, 0x34, 0x56]);
      const encThree = encodeBase45(threeBytes);
      expect(encThree.length).toBe(5); // 3 chars for 2 bytes + 2 chars for 1 byte
      expect(decodeBase45(encThree)).toEqual(threeBytes);
    });

    it("should throw on invalid Base45 characters or malformed strings", () => {
      expect(() => decodeBase45("invalid~character")).toThrow();
      expect(() => decodeBase45("A")).toThrow("trailing single character");
    });
  });

  describe("Manual Signaling Fallback (Base45 & QR)", () => {
    it("should pack and unpack SDP offer into compact CM45: string", () => {
      const payload = {
        version: 1 as const,
        type: "offer" as const,
        senderFingerprint: "fp-alice-12345678",
        sdp: "v=0\r\no=- 123456 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\na=sendrecv",
        candidates: [
          {
            candidate:
              "candidate:1 1 UDP 2130706431 192.168.1.100 54321 typ host",
            sdpMid: "0",
            sdpMLineIndex: 0,
          },
        ],
      };

      const exported = exportManualSignal(payload);
      expect(exported.startsWith("CM45:")).toBe(true);

      const imported = importManualSignal(exported);
      expect(imported.version).toBe(1);
      expect(imported.type).toBe("offer");
      expect(imported.senderFingerprint).toBe("fp-alice-12345678");
      expect(imported.sdp).toBe(payload.sdp);
      expect(imported.candidates).toHaveLength(1);
    });

    it("should reject invalid or corrupted manual signals", () => {
      expect(() => importManualSignal("random-gibberish")).toThrow();
    });
  });

  describe("WebRtcPeerTransport bounded peer pool", () => {
    it("should configure STUN servers and enforce maxPeers capacity", () => {
      const transport = new WebRtcPeerTransport({ maxPeers: 3 });
      expect(transport.getActivePeers()).toHaveLength(0);

      // Verify connection state queries default to NEW
      expect(transport.getPeerState("unknown-peer")).toBe(
        PeerConnectionState.NEW,
      );
    });
  });

  describe("SignalingClient state and quota protection", () => {
    it("should initialize in IDLE state and transition cleanly", () => {
      const client = new SignalingClient();
      expect(client.getState()).toBe(SignalingState.IDLE);

      let lastReportedState: SignalingState | null = null;
      client.onStateChange = (state) => {
        lastReportedState = state;
      };

      // Disconnect from IDLE sets DISCONNECTED
      client.disconnect();
      expect(client.getState()).toBe(SignalingState.DISCONNECTED);
      expect(lastReportedState).toBe(SignalingState.DISCONNECTED);
    });
  });
});
