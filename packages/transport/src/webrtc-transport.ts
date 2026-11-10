import { PeerConnectionState } from "@campusmesh/shared-types";

export const DEFAULT_STUN_SERVERS = [
  "stun:stun.cloudflare.com:3478",
  "stun:stun.l.google.com:19302",
] as const;

export const DATA_CHANNEL_LABELS = {
  CONTROL: "cm-control",
  MESSAGES: "cm-messages",
  BINARY: "cm-binary",
} as const;

export interface WebRtcTransportOptions {
  iceServers?: RTCIceServer[];
  maxPeers?: number;
}

export interface PeerSession {
  peerFingerprint: string;
  pc: RTCPeerConnection;
  controlChannel?: RTCDataChannel;
  messagesChannel?: RTCDataChannel;
  binaryChannel?: RTCDataChannel;
  state: PeerConnectionState;
  lastActivity: number;
}

export class WebRtcPeerTransport {
  private peers = new Map<string, PeerSession>();
  private maxPeers: number;
  private iceServers: RTCIceServer[];

  public onStateChange?: (
    peerFingerprint: string,
    state: PeerConnectionState,
  ) => void;
  public onDataMessage?: (
    peerFingerprint: string,
    channelLabel: string,
    data: Uint8Array,
  ) => void;
  public onIceCandidate?: (
    peerFingerprint: string,
    candidate: RTCIceCandidateInit,
  ) => void;
  public onControlChannelOpen?: (peerFingerprint: string) => void;

  constructor(options: WebRtcTransportOptions = {}) {
    this.maxPeers = options.maxPeers ?? 8;
    this.iceServers = options.iceServers ?? [
      { urls: [...DEFAULT_STUN_SERVERS] },
    ];
  }

  public getPeerSession(peerFingerprint: string): PeerSession | undefined {
    return this.peers.get(peerFingerprint);
  }

  public getPeerState(peerFingerprint: string): PeerConnectionState {
    return this.peers.get(peerFingerprint)?.state ?? PeerConnectionState.NEW;
  }

  public getActivePeers(): string[] {
    return Array.from(this.peers.keys());
  }

  private enforcePeerLimit(excludePeer?: string) {
    if (this.peers.size >= this.maxPeers) {
      // Find least recently active peer to close
      let oldestFp: string | null = null;
      let oldestTime = Infinity;

      for (const [fp, session] of this.peers.entries()) {
        if (fp === excludePeer) continue;
        if (session.lastActivity < oldestTime) {
          oldestTime = session.lastActivity;
          oldestFp = fp;
        }
      }

      if (oldestFp) {
        this.closePeer(oldestFp);
      }
    }
  }

  public async createPeerConnection(
    peerFingerprint: string,
    isInitiator: boolean,
  ): Promise<PeerSession> {
    const existing = this.peers.get(peerFingerprint);
    if (existing) {
      if (
        existing.state === PeerConnectionState.CONNECTED ||
        existing.state === PeerConnectionState.CONNECTING
      ) {
        return existing;
      }
      this.closePeer(peerFingerprint);
    }

    this.enforcePeerLimit(peerFingerprint);

    const config: RTCConfiguration = {
      iceServers: this.iceServers,
      iceTransportPolicy: "all", // No paid TURN! Fail-closed direct P2P
    };

    const pc = new RTCPeerConnection(config);
    const session: PeerSession = {
      peerFingerprint,
      pc,
      state: PeerConnectionState.CONNECTING,
      lastActivity: Date.now(),
    };
    this.peers.set(peerFingerprint, session);
    this.updateState(session, PeerConnectionState.CONNECTING);

    this.setupPcListeners(session);

    if (isInitiator) {
      // Initiator creates data channels upfront
      session.controlChannel = pc.createDataChannel(
        DATA_CHANNEL_LABELS.CONTROL,
        {
          ordered: true,
        },
      );
      session.messagesChannel = pc.createDataChannel(
        DATA_CHANNEL_LABELS.MESSAGES,
        {
          ordered: true,
        },
      );
      session.binaryChannel = pc.createDataChannel(DATA_CHANNEL_LABELS.BINARY, {
        ordered: false,
        maxRetransmits: 3,
      });

      this.setupChannelListeners(session, session.controlChannel);
      this.setupChannelListeners(session, session.messagesChannel);
      this.setupChannelListeners(session, session.binaryChannel);
    } else {
      // Responder waits for ondatachannel
      pc.ondatachannel = (event) => {
        const channel = event.channel;
        if (channel.label === DATA_CHANNEL_LABELS.CONTROL) {
          session.controlChannel = channel;
        } else if (channel.label === DATA_CHANNEL_LABELS.MESSAGES) {
          session.messagesChannel = channel;
        } else if (channel.label === DATA_CHANNEL_LABELS.BINARY) {
          session.binaryChannel = channel;
        }
        this.setupChannelListeners(session, channel);
      };
    }

    return session;
  }

  private setupPcListeners(session: PeerSession) {
    const { pc, peerFingerprint } = session;

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.onIceCandidate?.(peerFingerprint, event.candidate.toJSON());
      }
    };

    pc.onconnectionstatechange = () => {
      session.lastActivity = Date.now();
      switch (pc.connectionState) {
        case "connected":
          this.updateState(session, PeerConnectionState.CONNECTED);
          break;
        case "connecting":
          this.updateState(session, PeerConnectionState.CONNECTING);
          break;
        case "disconnected":
          this.updateState(session, PeerConnectionState.DISCONNECTED);
          break;
        case "failed":
          this.updateState(session, PeerConnectionState.FAILED);
          break;
        case "closed":
          this.updateState(session, PeerConnectionState.CLOSED);
          break;
      }
    };
  }

  private setupChannelListeners(session: PeerSession, channel: RTCDataChannel) {
    channel.binaryType = "arraybuffer";

    channel.onopen = () => {
      session.lastActivity = Date.now();
      if (channel.label === DATA_CHANNEL_LABELS.CONTROL) {
        this.onControlChannelOpen?.(session.peerFingerprint);
      }
      if (
        session.controlChannel?.readyState === "open" ||
        session.messagesChannel?.readyState === "open"
      ) {
        this.updateState(session, PeerConnectionState.CONNECTED);
      }
    };

    channel.onmessage = (event) => {
      session.lastActivity = Date.now();
      let bytes: Uint8Array;
      if (event.data instanceof ArrayBuffer) {
        bytes = new Uint8Array(event.data);
      } else if (typeof event.data === "string") {
        bytes = new TextEncoder().encode(event.data);
      } else {
        return;
      }
      this.onDataMessage?.(session.peerFingerprint, channel.label, bytes);
    };

    channel.onclose = () => {
      // Check if all channels closed
      if (
        session.controlChannel?.readyState === "closed" &&
        session.messagesChannel?.readyState === "closed"
      ) {
        this.updateState(session, PeerConnectionState.DISCONNECTED);
      }
    };
  }

  private updateState(session: PeerSession, state: PeerConnectionState) {
    session.state = state;
    this.onStateChange?.(session.peerFingerprint, state);
  }

  public async createOffer(
    peerFingerprint: string,
  ): Promise<RTCSessionDescriptionInit> {
    const session = await this.createPeerConnection(peerFingerprint, true);
    const offer = await session.pc.createOffer();
    await session.pc.setLocalDescription(offer);
    return offer;
  }

  public async handleOffer(
    peerFingerprint: string,
    offer: RTCSessionDescriptionInit,
  ): Promise<RTCSessionDescriptionInit> {
    const session = await this.createPeerConnection(peerFingerprint, false);
    await session.pc.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await session.pc.createAnswer();
    await session.pc.setLocalDescription(answer);
    return answer;
  }

  public async handleAnswer(
    peerFingerprint: string,
    answer: RTCSessionDescriptionInit,
  ): Promise<void> {
    const session = this.peers.get(peerFingerprint);
    if (!session) {
      throw new Error(
        `Cannot handle answer: no peer session found for ${peerFingerprint}`,
      );
    }
    await session.pc.setRemoteDescription(new RTCSessionDescription(answer));
  }

  public async addIceCandidate(
    peerFingerprint: string,
    candidate: RTCIceCandidateInit,
  ): Promise<void> {
    const session = this.peers.get(peerFingerprint);
    if (!session) return;
    try {
      await session.pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (err) {
      console.warn(`Failed to add ICE candidate for ${peerFingerprint}:`, err);
    }
  }

  public sendData(
    peerFingerprint: string,
    channelLabel: "cm-control" | "cm-messages" | "cm-binary",
    data: Uint8Array,
  ): boolean {
    const session = this.peers.get(peerFingerprint);
    if (!session) return false;

    let targetChannel: RTCDataChannel | undefined;
    if (channelLabel === DATA_CHANNEL_LABELS.CONTROL) {
      targetChannel = session.controlChannel;
    } else if (channelLabel === DATA_CHANNEL_LABELS.MESSAGES) {
      targetChannel = session.messagesChannel;
    } else {
      targetChannel = session.binaryChannel;
    }

    if (targetChannel && targetChannel.readyState === "open") {
      targetChannel.send(data as unknown as ArrayBuffer);
      session.lastActivity = Date.now();
      return true;
    }

    return false;
  }

  public closePeer(peerFingerprint: string) {
    const session = this.peers.get(peerFingerprint);
    if (session) {
      try {
        session.controlChannel?.close();
        session.messagesChannel?.close();
        session.binaryChannel?.close();
        session.pc.close();
      } catch {
        // Ignore close errors
      }
      this.updateState(session, PeerConnectionState.CLOSED);
      this.peers.delete(peerFingerprint);
    }
  }

  public closeAll() {
    for (const fp of this.peers.keys()) {
      this.closePeer(fp);
    }
  }
}
