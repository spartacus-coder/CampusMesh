/**
 * Holepunch Hyperswarm / HyperDHT / Autobase & Hybrid Gateway Swarm Adapter Contract.
 * Specified in docs/research/HYPERSWARM_EVALUATION.md.
 */

export interface SwarmPeerInfo {
  peerId: string;
  discoveryKey: string;
  connectionType: "direct-utp" | "webrtc-proxy" | "lan-mdns";
  latencyMs?: number | undefined;
  displayName?: string | undefined;
  isGateway?: boolean | undefined;
}

export type SwarmEventMap = {
  "peer-joined": (peer: SwarmPeerInfo) => void;
  "peer-left": (peerId: string) => void;
  data: (peerId: string, data: Uint8Array) => void;
};

export interface IPeerSwarmAdapter {
  readonly protocol: "webrtc-mesh" | "hyperswarm-dht";
  joinSwarm(topicHex: string): Promise<void>;
  leaveSwarm(topicHex: string): Promise<void>;
  broadcast(topicHex: string, data: Uint8Array): Promise<void>;
  sendDirect(peerId: string, data: Uint8Array): Promise<void>;
  on<K extends keyof SwarmEventMap>(event: K, handler: SwarmEventMap[K]): void;
  destroy(): Promise<void>;
}

/** Gateway control frames routed over WebRTC DataChannel (cm-control) to bridge Web/APK via Desktop .exe */
export interface SwarmGatewayControlPacket {
  type:
    | "swarm_gateway_hello"
    | "swarm_join"
    | "swarm_leave"
    | "swarm_publish"
    | "swarm_deliver"
    | "autobase_open"
    | "autobase_append"
    | "autobase_entry";
  topicHex?: string | undefined;
  groupId?: string | undefined;
  bootstrapKeyHex?: string | undefined;
  gatewayFingerprint?: string | undefined;
  swarmPublicKey?: string | undefined;
  senderFingerprint?: string | undefined;
  payload?: unknown;
}

/** Derives a deterministic 32-byte (64-hex) Hyperswarm topic from a namespace and identifier. */
export async function deriveTopicHex(
  namespace: string,
  identifier: string,
): Promise<string> {
  const bytes = new TextEncoder().encode(
    `cm:swarm:v1:${namespace}:${identifier}`,
  );
  if (globalThis.crypto?.subtle) {
    const hash = await globalThis.crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(hash))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }
  // Fallback deterministic 64-hex digest if SubtleCrypto unavailable in test stubs
  const out = new Uint8Array(32);
  for (let i = 0; i < bytes.length; i++) {
    const slot = i % 32;
    out[slot] = ((out[slot] ?? 0) * 31 + (bytes[i] ?? 0) + i) & 0xff;
  }
  return Array.from(out)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export interface DesktopSwarmBridge {
  joinSwarm(topicHex: string): Promise<void>;
  leaveSwarm(topicHex: string): Promise<void>;
  broadcast(topicHex: string, base64Payload: string): Promise<void>;
  sendDirect(peerId: string, base64Payload: string): Promise<void>;
  destroy(): Promise<void>;
}

export function uint8ToBase64(data: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < data.length; i++) {
    binary += String.fromCharCode(data[i] ?? 0);
  }
  if (typeof btoa === "function") return btoa(binary);
  return Buffer.from(data).toString("base64");
}

export function base64ToUint8(b64: string): Uint8Array {
  if (typeof atob === "function") {
    const raw = atob(b64);
    const out = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) {
      out[i] = raw.charCodeAt(i);
    }
    return out;
  }
  return new Uint8Array(Buffer.from(b64, "base64"));
}

/**
 * Desktop .exe Swarm Adapter bridging @campusmesh/transport cleanly to Tauri + Bare sidecar IPC.
 */
export class DesktopIpcSwarmAdapter implements IPeerSwarmAdapter {
  public readonly protocol = "hyperswarm-dht" as const;
  private bridge: DesktopSwarmBridge;
  private listeners: {
    "peer-joined": Set<SwarmEventMap["peer-joined"]>;
    "peer-left": Set<SwarmEventMap["peer-left"]>;
    data: Set<SwarmEventMap["data"]>;
  } = {
    "peer-joined": new Set(),
    "peer-left": new Set(),
    data: new Set(),
  };

  constructor(bridge: DesktopSwarmBridge) {
    this.bridge = bridge;
  }

  async joinSwarm(topicHex: string): Promise<void> {
    await this.bridge.joinSwarm(topicHex);
  }

  async leaveSwarm(topicHex: string): Promise<void> {
    await this.bridge.leaveSwarm(topicHex);
  }

  async broadcast(topicHex: string, data: Uint8Array): Promise<void> {
    await this.bridge.broadcast(topicHex, uint8ToBase64(data));
  }

  async sendDirect(peerId: string, data: Uint8Array): Promise<void> {
    await this.bridge.sendDirect(peerId, uint8ToBase64(data));
  }

  on<K extends keyof SwarmEventMap>(event: K, handler: SwarmEventMap[K]): void {
    (this.listeners[event] as Set<SwarmEventMap[K]>).add(handler);
  }

  emitPeerJoined(peer: SwarmPeerInfo): void {
    for (const cb of this.listeners["peer-joined"]) cb(peer);
  }

  emitPeerLeft(peerId: string): void {
    for (const cb of this.listeners["peer-left"]) cb(peerId);
  }

  emitData(peerId: string, data: Uint8Array): void {
    for (const cb of this.listeners.data) cb(peerId, data);
  }

  async destroy(): Promise<void> {
    this.listeners["peer-joined"].clear();
    this.listeners["peer-left"].clear();
    this.listeners.data.clear();
    await this.bridge.destroy();
  }
}

/**
 * Web PWA / Android .apk Hybrid Gateway Swarm Adapter.
 * Bridges browser/mobile clients into HyperDHT & Autobase via any connected Desktop .exe peer
 * acting as a local/P2P Hybrid Gateway, falling back to direct WebRTC peers when no gateway is active.
 */
export class WebRtcSwarmGatewayAdapter implements IPeerSwarmAdapter {
  public readonly protocol = "webrtc-mesh" as const;
  private sendControlPacket: (
    targetPeerId: string,
    packet: SwarmGatewayControlPacket,
  ) => boolean;
  private getConnectedPeers: () => string[];
  private gatewayPeerId: string | null = null;
  private joinedTopics = new Set<string>();
  private listeners: {
    "peer-joined": Set<SwarmEventMap["peer-joined"]>;
    "peer-left": Set<SwarmEventMap["peer-left"]>;
    data: Set<SwarmEventMap["data"]>;
  } = {
    "peer-joined": new Set(),
    "peer-left": new Set(),
    data: new Set(),
  };

  constructor(options: {
    sendControlPacket: (
      targetPeerId: string,
      packet: SwarmGatewayControlPacket,
    ) => boolean;
    getConnectedPeers: () => string[];
  }) {
    this.sendControlPacket = options.sendControlPacket;
    this.getConnectedPeers = options.getConnectedPeers;
  }

  public setGatewayPeer(peerId: string | null): void {
    this.gatewayPeerId = peerId;
    if (peerId) {
      for (const topicHex of this.joinedTopics) {
        this.sendControlPacket(peerId, { type: "swarm_join", topicHex });
      }
    }
  }

  public getGatewayPeer(): string | null {
    return this.gatewayPeerId;
  }

  async joinSwarm(topicHex: string): Promise<void> {
    this.joinedTopics.add(topicHex);
    if (this.gatewayPeerId) {
      this.sendControlPacket(this.gatewayPeerId, {
        type: "swarm_join",
        topicHex,
      });
    }
  }

  async leaveSwarm(topicHex: string): Promise<void> {
    this.joinedTopics.delete(topicHex);
    if (this.gatewayPeerId) {
      this.sendControlPacket(this.gatewayPeerId, {
        type: "swarm_leave",
        topicHex,
      });
    }
  }

  async broadcast(topicHex: string, data: Uint8Array): Promise<void> {
    const encoded = uint8ToBase64(data);
    if (this.gatewayPeerId) {
      this.sendControlPacket(this.gatewayPeerId, {
        type: "swarm_publish",
        topicHex,
        payload: encoded,
      });
      return;
    }
    for (const peerId of this.getConnectedPeers()) {
      this.sendControlPacket(peerId, {
        type: "swarm_deliver",
        topicHex,
        payload: encoded,
      });
    }
  }

  async sendDirect(peerId: string, data: Uint8Array): Promise<void> {
    this.sendControlPacket(peerId, {
      type: "swarm_deliver",
      payload: uint8ToBase64(data),
    });
  }

  on<K extends keyof SwarmEventMap>(event: K, handler: SwarmEventMap[K]): void {
    (this.listeners[event] as Set<SwarmEventMap[K]>).add(handler);
  }

  public handleControlPacket(
    senderPeerId: string,
    packet: SwarmGatewayControlPacket,
  ): void {
    if (packet.type === "swarm_gateway_hello") {
      this.setGatewayPeer(senderPeerId);
      for (const cb of this.listeners["peer-joined"]) {
        cb({
          peerId: senderPeerId,
          discoveryKey: packet.swarmPublicKey || senderPeerId,
          connectionType: "webrtc-proxy",
          isGateway: true,
        });
      }
    } else if (
      packet.type === "swarm_deliver" &&
      typeof packet.payload === "string"
    ) {
      const bytes = base64ToUint8(packet.payload);
      const from = packet.senderFingerprint || senderPeerId;
      for (const cb of this.listeners.data) cb(from, bytes);
    }
  }

  async destroy(): Promise<void> {
    this.joinedTopics.clear();
    this.gatewayPeerId = null;
    this.listeners["peer-joined"].clear();
    this.listeners["peer-left"].clear();
    this.listeners.data.clear();
  }
}
