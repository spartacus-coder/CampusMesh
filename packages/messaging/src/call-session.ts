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
  iceServers?: RTCIceServer[] | undefined;
  onStateChanged?: ((state: CallState) => void) | undefined;
  onRemoteStream?: ((stream: MediaStream) => void) | undefined;
  onLocalStream?: ((stream: MediaStream) => void) | undefined;
}

export const DEFAULT_CALL_STUN_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.cloudflare.com:3478" },
  { urls: "stun:stun.l.google.com:19302" },
];

export class CallSessionManager {
  private localFingerprint: string;
  private sendSignal: (signal: CallSignal) => void;
  private iceServers: RTCIceServer[];
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

  private pendingOfferSdp: string | null = null;
  private pendingIceCandidates: RTCIceCandidateInit[] = [];

  private callStartTime: number | null = null;
  private isAudioMuted = false;
  private isVideoMuted = false;

  constructor(options: CallSessionOptions) {
    this.localFingerprint = options.localFingerprint;
    this.sendSignal = options.sendSignal;
    this.iceServers = options.iceServers ?? DEFAULT_CALL_STUN_SERVERS;
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

  private createPeerConnection(): RTCPeerConnection | null {
    if (typeof RTCPeerConnection === "undefined") return null;

    try {
      const pc = new RTCPeerConnection({
        iceServers: this.iceServers,
      });

      pc.onicecandidate = (event) => {
        if (
          event.candidate &&
          this.activeCallId &&
          this.activePeerFingerprint
        ) {
          this.sendSignal({
            type: "call_ice",
            callId: this.activeCallId,
            callType: this.activeCallType,
            callerFingerprint: this.localFingerprint,
            recipientFingerprint: this.activePeerFingerprint,
            candidate: event.candidate.toJSON(),
          });
        }
      };

      pc.ontrack = (event) => {
        const stream = event.streams[0] || new MediaStream([event.track]);
        this.setRemoteStream(stream);
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "connected") {
          if (this.state !== CallState.CONNECTED) {
            this.setState(CallState.CONNECTED);
            this.callStartTime = Date.now();
          }
        } else if (
          pc.connectionState === "failed" ||
          pc.connectionState === "closed"
        ) {
          if (this.state === CallState.CONNECTED) {
            this.endCall();
          }
        }
      };

      // Bind all acquired local audio/video tracks to peer connection
      if (this.localStream) {
        this.localStream.getTracks().forEach((track) => {
          try {
            pc.addTrack(track, this.localStream!);
          } catch {
            // Ignore duplicate track addition
          }
        });
      }

      this.peerConnection = pc;
      return pc;
    } catch (err) {
      console.warn("Failed creating RTCPeerConnection:", err);
      return null;
    }
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
    this.pendingOfferSdp = null;
    this.pendingIceCandidates = [];
    this.setState(CallState.OUTGOING_RINGING);

    // Acquire local media stream if navigator.mediaDevices exists
    await this.acquireLocalMedia(type);

    const pc = this.createPeerConnection();
    let sdpOffer: string | undefined;

    if (pc) {
      try {
        const offer = await pc.createOffer({
          offerToReceiveAudio: true,
          offerToReceiveVideo: type === "VIDEO",
        });
        await pc.setLocalDescription(offer);
        sdpOffer = offer.sdp;
      } catch (err) {
        console.warn("Failed creating SDP offer for call:", err);
      }
    }

    this.sendSignal({
      type: "call_offer",
      callId,
      callType: type,
      callerFingerprint: this.localFingerprint,
      recipientFingerprint,
      sdp: sdpOffer,
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
    const pc = this.createPeerConnection();
    let sdpAnswer: string | undefined;

    if (pc && this.pendingOfferSdp) {
      try {
        await pc.setRemoteDescription(
          new RTCSessionDescription({
            type: "offer",
            sdp: this.pendingOfferSdp,
          }),
        );

        // Flush any queued ICE candidates that arrived before remote description
        while (this.pendingIceCandidates.length > 0) {
          const cand = this.pendingIceCandidates.shift();
          if (cand) {
            await pc.addIceCandidate(new RTCIceCandidate(cand)).catch(() => {});
          }
        }

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        sdpAnswer = answer.sdp;
      } catch (err) {
        console.warn("Failed creating SDP answer for call:", err);
      }
    }

    this.setState(CallState.CONNECTED);
    this.callStartTime = Date.now();

    if (this.activePeerFingerprint) {
      this.sendSignal({
        type: "call_answer",
        callId,
        callType: this.activeCallType,
        callerFingerprint: this.activePeerFingerprint,
        recipientFingerprint: this.localFingerprint,
        sdp: sdpAnswer,
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

  public async handleIncomingSignal(signal: CallSignal): Promise<void> {
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
        this.pendingOfferSdp = signal.sdp || null;
        this.pendingIceCandidates = [];
        this.setState(CallState.INCOMING_RINGING);
        break;

      case "call_answer":
        if (
          this.state === CallState.OUTGOING_RINGING &&
          this.activeCallId === signal.callId
        ) {
          if (this.peerConnection && signal.sdp) {
            try {
              await this.peerConnection.setRemoteDescription(
                new RTCSessionDescription({
                  type: "answer",
                  sdp: signal.sdp,
                }),
              );
              while (this.pendingIceCandidates.length > 0) {
                const cand = this.pendingIceCandidates.shift();
                if (cand) {
                  await this.peerConnection
                    .addIceCandidate(new RTCIceCandidate(cand))
                    .catch(() => {});
                }
              }
            } catch (err) {
              console.warn("Failed setting remote answer SDP:", err);
            }
          }
          this.setState(CallState.CONNECTED);
          this.callStartTime = Date.now();
        }
        break;

      case "call_ice":
        if (this.activeCallId === signal.callId && signal.candidate) {
          if (this.peerConnection && this.peerConnection.remoteDescription) {
            try {
              await this.peerConnection.addIceCandidate(
                new RTCIceCandidate(signal.candidate),
              );
            } catch (err) {
              console.warn("Failed adding ICE candidate:", err);
            }
          } else {
            this.pendingIceCandidates.push(signal.candidate);
          }
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
    this.isAudioMuted = enabled !== undefined ? !enabled : !this.isAudioMuted;
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach((track) => {
        track.enabled = !this.isAudioMuted;
      });
    }
    return !this.isAudioMuted;
  }

  public toggleVideo(enabled?: boolean): boolean {
    this.isVideoMuted = enabled !== undefined ? !enabled : !this.isVideoMuted;
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
      } catch (err) {
        console.warn("getUserMedia failed or denied:", err);
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
    this.pendingOfferSdp = null;
    this.pendingIceCandidates = [];
    this.callStartTime = null;
    this.activeCallId = null;
    this.activePeerFingerprint = null;
    this.setState(terminalState);
  }
}
