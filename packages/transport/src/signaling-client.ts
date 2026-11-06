import { SignalingState } from "@campusmesh/shared-types";

export interface SignalingFrame {
  type:
    | "offer"
    | "answer"
    | "candidate"
    | "join"
    | "leave"
    | "ping"
    | "pong"
    | "error";
  senderFingerprint: string;
  targetFingerprint?: string;
  roomId?: string;
  data?: unknown;
  error?: string;
}

export interface SignalingClientOptions {
  serverUrl?: string; // e.g. wss://signaling.campusmesh.workers.dev
  maxReconnectAttempts?: number;
}

export class SignalingClient {
  private ws: WebSocket | null = null;
  private state: SignalingState = SignalingState.IDLE;
  private roomId: string | null = null;
  private localFingerprint: string | null = null;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private isExplicitlyClosed = false;
  private pingInterval: ReturnType<typeof setInterval> | null = null;

  public onOffer?: (
    senderFingerprint: string,
    offer: RTCSessionDescriptionInit,
  ) => void;
  public onAnswer?: (
    senderFingerprint: string,
    answer: RTCSessionDescriptionInit,
  ) => void;
  public onCandidate?: (
    senderFingerprint: string,
    candidate: RTCIceCandidateInit,
  ) => void;
  public onPeerJoined?: (peerFingerprint: string) => void;
  public onPeerLeft?: (peerFingerprint: string) => void;
  public onStateChange?: (state: SignalingState) => void;

  constructor(private options: SignalingClientOptions = {}) {}

  public getState(): SignalingState {
    return this.state;
  }

  private setState(newState: SignalingState) {
    if (this.state !== newState) {
      this.state = newState;
      this.onStateChange?.(newState);
    }
  }

  public async connect(
    roomId: string,
    localFingerprint: string,
    customUrl?: string,
  ): Promise<void> {
    this.roomId = roomId;
    this.localFingerprint = localFingerprint;
    this.isExplicitlyClosed = false;
    this.setState(SignalingState.CONNECTING);

    const baseUrl =
      customUrl ||
      this.options.serverUrl ||
      (typeof window !== "undefined" && window.location
        ? `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}`
        : "wss://signaling.campusmesh.workers.dev");

    const cleanBase = baseUrl.replace(/\/+$/, "");
    const wsUrl = `${cleanBase}/api/room/${encodeURIComponent(roomId)}/ws?fp=${encodeURIComponent(
      localFingerprint,
    )}`;

    try {
      this.ws = new WebSocket(wsUrl);
      this.setupWebSocketListeners();
    } catch {
      this.setState(SignalingState.FAILED);
      this.scheduleReconnect();
    }
  }

  private setupWebSocketListeners() {
    if (!this.ws) return;

    this.ws.onopen = () => {
      this.reconnectAttempts = 0;
      this.setState(SignalingState.CONNECTED);
      this.startHeartbeat();

      // Announce join
      if (this.roomId && this.localFingerprint) {
        this.sendFrame({
          type: "join",
          senderFingerprint: this.localFingerprint,
          roomId: this.roomId,
        });
      }
    };

    this.ws.onmessage = (event) => {
      try {
        const frame: SignalingFrame = JSON.parse(event.data);
        this.handleIncomingFrame(frame);
      } catch (err) {
        console.warn("Received malformed signaling frame:", err);
      }
    };

    this.ws.onerror = () => {
      if (this.state !== SignalingState.UNAVAILABLE_QUOTA) {
        this.setState(SignalingState.FAILED);
      }
    };

    this.ws.onclose = (event) => {
      this.stopHeartbeat();
      if (this.isExplicitlyClosed) {
        this.setState(SignalingState.DISCONNECTED);
        return;
      }

      // Check if closed due to serverless quota protection (status code 4429)
      if (event.code === 4429) {
        this.setState(SignalingState.UNAVAILABLE_QUOTA);
        return;
      }

      this.setState(SignalingState.DISCONNECTED);
      this.scheduleReconnect();
    };
  }

  private handleIncomingFrame(frame: SignalingFrame) {
    if (frame.error === "QUOTA_EXHAUSTION_PROTECTION") {
      this.setState(SignalingState.UNAVAILABLE_QUOTA);
      this.disconnect();
      return;
    }

    switch (frame.type) {
      case "offer":
        if (frame.data) {
          this.onOffer?.(
            frame.senderFingerprint,
            frame.data as RTCSessionDescriptionInit,
          );
        }
        break;
      case "answer":
        if (frame.data) {
          this.onAnswer?.(
            frame.senderFingerprint,
            frame.data as RTCSessionDescriptionInit,
          );
        }
        break;
      case "candidate":
        if (frame.data) {
          this.onCandidate?.(
            frame.senderFingerprint,
            frame.data as RTCIceCandidateInit,
          );
        }
        break;
      case "join":
        this.onPeerJoined?.(frame.senderFingerprint);
        break;
      case "leave":
        this.onPeerLeft?.(frame.senderFingerprint);
        break;
      case "ping":
        this.sendFrame({
          type: "pong",
          senderFingerprint: this.localFingerprint || "",
        });
        break;
    }
  }

  private scheduleReconnect() {
    if (
      this.isExplicitlyClosed ||
      this.state === SignalingState.UNAVAILABLE_QUOTA
    )
      return;

    const maxAttempts = this.options.maxReconnectAttempts ?? 8;
    if (this.reconnectAttempts >= maxAttempts) {
      this.setState(SignalingState.FAILED);
      return;
    }

    this.reconnectAttempts++;
    // Exponential backoff: 1s, 2s, 4s, 8s, up to 30s + jitter
    const baseDelay = Math.min(
      30000,
      1000 * Math.pow(2, this.reconnectAttempts - 1),
    );
    const jitter = baseDelay * (0.8 + Math.random() * 0.4);

    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
      if (this.roomId && this.localFingerprint && !this.isExplicitlyClosed) {
        this.connect(this.roomId, this.localFingerprint);
      }
    }, jitter);
  }

  private startHeartbeat() {
    this.stopHeartbeat();
    this.pingInterval = setInterval(() => {
      if (
        this.ws &&
        this.ws.readyState === WebSocket.OPEN &&
        this.localFingerprint
      ) {
        this.sendFrame({
          type: "ping",
          senderFingerprint: this.localFingerprint,
        });
      }
    }, 25000);
  }

  private stopHeartbeat() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  public sendOffer(
    targetFingerprint: string,
    offer: RTCSessionDescriptionInit,
  ) {
    if (!this.localFingerprint || !this.roomId) return;
    this.sendFrame({
      type: "offer",
      senderFingerprint: this.localFingerprint,
      targetFingerprint,
      roomId: this.roomId,
      data: offer,
    });
  }

  public sendAnswer(
    targetFingerprint: string,
    answer: RTCSessionDescriptionInit,
  ) {
    if (!this.localFingerprint || !this.roomId) return;
    this.sendFrame({
      type: "answer",
      senderFingerprint: this.localFingerprint,
      targetFingerprint,
      roomId: this.roomId,
      data: answer,
    });
  }

  public sendCandidate(
    targetFingerprint: string,
    candidate: RTCIceCandidateInit,
  ) {
    if (!this.localFingerprint || !this.roomId) return;
    this.sendFrame({
      type: "candidate",
      senderFingerprint: this.localFingerprint,
      targetFingerprint,
      roomId: this.roomId,
      data: candidate,
    });
  }

  private sendFrame(frame: SignalingFrame) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(frame));
    }
  }

  public disconnect() {
    this.isExplicitlyClosed = true;
    this.stopHeartbeat();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      if (
        this.localFingerprint &&
        this.roomId &&
        this.ws.readyState === WebSocket.OPEN
      ) {
        try {
          this.ws.send(
            JSON.stringify({
              type: "leave",
              senderFingerprint: this.localFingerprint,
              roomId: this.roomId,
            }),
          );
        } catch {
          // Ignore close send errors
        }
      }
      this.ws.close();
      this.ws = null;
    }
    this.setState(SignalingState.DISCONNECTED);
  }
}
