import type { PeerConnectionState } from "@campusmesh/shared-types";

export const DEFAULT_STUN_SERVERS = [
  "stun:stun.cloudflare.com:3478",
  "stun:stun.l.google.com:19302",
] as const;

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
