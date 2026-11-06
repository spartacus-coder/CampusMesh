/**
 * @campusmesh/transport
 * WebRTC DataChannels, STUN peer connection engine, manual Base45 signaling, and serverless signaling client.
 */

export * from "./base45";
export * from "./manual-signaling";
export * from "./signaling-client";
export * from "./webrtc-transport";

import type { PeerConnectionState } from "@campusmesh/shared-types";

export interface ITransportAdapter {
  connect(peerId: string): Promise<void>;
  disconnect(peerId: string): Promise<void>;
  send(peerId: string, payload: Uint8Array): Promise<void>;
  getConnectionState(peerId: string): PeerConnectionState;
}

export class MockTransportAdapter implements ITransportAdapter {
  private states = new Map<string, PeerConnectionState>();

  async connect(peerId: string): Promise<void> {
    this.states.set(peerId, "CONNECTED" as PeerConnectionState);
  }

  async disconnect(peerId: string): Promise<void> {
    this.states.set(peerId, "CLOSED" as PeerConnectionState);
  }

  async send(_peerId: string, _payload: Uint8Array): Promise<void> {
    // Mock delivery
  }

  getConnectionState(peerId: string): PeerConnectionState {
    return this.states.get(peerId) ?? ("NEW" as PeerConnectionState);
  }
}
