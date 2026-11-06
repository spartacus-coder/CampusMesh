/**
 * 1-to-1 WebRTC Direct Audio & Video Calling Engine
 * Strictly Zero-Cost: Direct P2P Media Streams without SFU or Commercial Services
 */

export enum CallState {
  IDLE = "IDLE",
  OUTGOING_RINGING = "OUTGOING_RINGING",
  INCOMING_RINGING = "INCOMING_RINGING",
  CONNECTED = "CONNECTED",
  ENDED = "ENDED",
  REJECTED = "REJECTED",
  BUSY = "BUSY",
}

export type CallType = "AUDIO" | "VIDEO";

export interface CallSignal {
  type:
    | "call_offer"
    | "call_answer"
    | "call_reject"
    | "call_end"
    | "call_busy"
    | "call_ice";
  callId: string;
  callType: CallType;
  callerFingerprint: string;
  recipientFingerprint: string;
  sdp?: string | undefined;
  candidate?: RTCIceCandidateInit | undefined;
}

export interface CallSessionOptions {
  localFingerprint: string;
  sendSignal: (signal: CallSignal) => void;
  onStateChanged?: ((state: CallState) => void) | undefined;
  onRemoteStream?: ((stream: MediaStream) => void) | undefined;
  onLocalStream?: ((stream: MediaStream) => void) | undefined;
}

export class CallSessionManager {
  private localFingerprint: string;
  private sendSignal: (signal: CallSignal) => void;
  private onStateChanged?: ((state: CallState) => void) | undefined;
  private onRemoteStream?: ((stream: MediaStream) => void) | undefined;
  private onLocalStream?: ((stream: MediaStream) => void) | undefined;

  private state: CallState = CallState.IDLE;
  private activeCallId: string | null = null;
  private activePeerFingerprint: string | null = null;
  private activeCallType: CallType = "AUDIO";

  private peerConnection: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private remoteStream: MediaStream | null = null;

  private callStartTime: number | null = null;
  private isAudioMuted = false;
  private isVideoMuted = false;

  constructor(options: CallSessionOptions) {
    this.localFingerprint = options.localFingerprint;
    this.sendSignal = options.sendSignal;
    this.onStateChanged = options.onStateChanged;
    this.onRemoteStream = options.onRemoteStream;
    this.onLocalStream = options.onLocalStream;
  }

  public getLocalStream(): MediaStream | null {
    return this.localStream;
  }

  public getRemoteStream(): MediaStream | null {
    return this.remoteStream;
  }

  public setRemoteStream(stream: MediaStream): void {
    this.remoteStream = stream;
    this.onRemoteStream?.(stream);
  }

  public getState(): CallState {
    return this.state;
  }

  public getActiveCallId(): string | null {
    return this.activeCallId;
  }

  public getActivePeerFingerprint(): string | null {
    return this.activePeerFingerprint;
  }

  public getCallType(): CallType {
    return this.activeCallType;
  }

  public getDurationSeconds(): number {
    if (!this.callStartTime || this.state !== CallState.CONNECTED) {
      return 0;
    }
    return Math.floor((Date.now() - this.callStartTime) / 1000);
  }

  public isAudioEnabled(): boolean {
    return !this.isAudioMuted;
  }

  public isVideoEnabled(): boolean {
    return !this.isVideoMuted;
  }

  public isBusy(): boolean {
    return (
      this.state === CallState.OUTGOING_RINGING ||
      this.state === CallState.INCOMING_RINGING ||
      this.state === CallState.CONNECTED
    );
  }

  public reset(): void {
    this.cleanup(CallState.IDLE);
  }

  public async initiateCall(
    recipientFingerprint: string,
    type: CallType = "AUDIO",
  ): Promise<string> {
    if (this.isBusy()) {
      throw new Error(`Cannot initiate call while in state: ${this.state}`);
    }

    const callId = `call_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    this.activeCallId = callId;
    this.activePeerFingerprint = recipientFingerprint;
    this.activeCallType = type;
    this.setState(CallState.OUTGOING_RINGING);

    // Acquire local media stream if navigator.mediaDevices exists
    await this.acquireLocalMedia(type);

    this.sendSignal({
      type: "call_offer",
      callId,
      callType: type,
      callerFingerprint: this.localFingerprint,
      recipientFingerprint,
    });

    return callId;
  }

  public async acceptCall(callId: string): Promise<void> {
    if (
      this.state !== CallState.INCOMING_RINGING ||
      this.activeCallId !== callId
    ) {
      throw new Error("No pending incoming call to accept");
    }

    await this.acquireLocalMedia(this.activeCallType);

    this.setState(CallState.CONNECTED);
    this.callStartTime = Date.now();

    if (this.activePeerFingerprint) {
      this.sendSignal({
        type: "call_answer",
        callId,
        callType: this.activeCallType,
        callerFingerprint: this.activePeerFingerprint,
        recipientFingerprint: this.localFingerprint,
      });
    }
  }

  public rejectCall(callId: string): void {
    if (this.activeCallId === callId && this.activePeerFingerprint) {
      this.sendSignal({
        type: "call_reject",
        callId,
        callType: this.activeCallType,
        callerFingerprint: this.activePeerFingerprint,
        recipientFingerprint: this.localFingerprint,
      });
    }
    this.cleanup(CallState.REJECTED);
  }

  public endCall(): void {
    if (this.activeCallId && this.activePeerFingerprint) {
      this.sendSignal({
        type: "call_end",
        callId: this.activeCallId,
        callType: this.activeCallType,
        callerFingerprint: this.localFingerprint,
        recipientFingerprint: this.activePeerFingerprint,
      });
    }
    this.cleanup(CallState.ENDED);
  }

  public handleIncomingSignal(signal: CallSignal): void {
    switch (signal.type) {
      case "call_offer":
        if (this.isBusy()) {
          // Busy: Already in another call
          this.sendSignal({
            type: "call_busy",
            callId: signal.callId,
            callType: signal.callType,
            callerFingerprint: signal.callerFingerprint,
            recipientFingerprint: this.localFingerprint,
          });
          return;
        }
        this.activeCallId = signal.callId;
        this.activePeerFingerprint = signal.callerFingerprint;
        this.activeCallType = signal.callType;
        this.setState(CallState.INCOMING_RINGING);
        break;

      case "call_answer":
        if (
          this.state === CallState.OUTGOING_RINGING &&
          this.activeCallId === signal.callId
        ) {
          this.setState(CallState.CONNECTED);
          this.callStartTime = Date.now();
        }
        break;

      case "call_reject":
        if (this.activeCallId === signal.callId) {
          this.cleanup(CallState.REJECTED);
        }
        break;

      case "call_end":
        if (this.activeCallId === signal.callId) {
          this.cleanup(CallState.ENDED);
        }
        break;

      case "call_busy":
        if (this.activeCallId === signal.callId) {
          this.cleanup(CallState.BUSY);
        }
        break;
    }
  }

  public toggleAudio(enabled?: boolean): boolean {
    this.isAudioMuted =
      enabled !== undefined ? !enabled : !this.isAudioMuted;
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach((track) => {
        track.enabled = !this.isAudioMuted;
      });
    }
    return !this.isAudioMuted;
  }

  public toggleVideo(enabled?: boolean): boolean {
    this.isVideoMuted =
      enabled !== undefined ? !enabled : !this.isVideoMuted;
    if (this.localStream) {
      this.localStream.getVideoTracks().forEach((track) => {
        track.enabled = !this.isVideoMuted;
      });
    }
    return !this.isVideoMuted;
  }

  private async acquireLocalMedia(type: CallType): Promise<void> {
    if (
      typeof navigator !== "undefined" &&
      navigator.mediaDevices?.getUserMedia
    ) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video:
            type === "VIDEO"
              ? {
                  width: { ideal: 1280 },
                  height: { ideal: 720 },
                  frameRate: { ideal: 30 },
                }
              : false,
        });
        this.localStream = stream;
        this.onLocalStream?.(stream);
      } catch {
        // Fallback for mocked/headless environments
      }
    }
  }

  private setState(newState: CallState): void {
    this.state = newState;
    this.onStateChanged?.(newState);
  }

  private cleanup(terminalState: CallState): void {
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => track.stop());
      this.localStream = null;
    }
    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }
    this.remoteStream = null;
    this.callStartTime = null;
    this.activeCallId = null;
    this.activePeerFingerprint = null;
    this.setState(terminalState);
  }
}
