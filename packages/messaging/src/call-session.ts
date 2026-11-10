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
  callerDisplayName?: string | undefined;
  sdp?: string | undefined;
  candidate?: RTCIceCandidateInit | undefined;
}

export interface CallSessionOptions {
  localFingerprint: string;
  localDisplayName?: string | undefined;
  sendSignal: (signal: CallSignal) => void;
  iceServers?: RTCIceServer[] | undefined;
  onStateChanged?: ((state: CallState) => void) | undefined;
  onRemoteStream?: ((stream: MediaStream) => void) | undefined;
  onLocalStream?: ((stream: MediaStream) => void) | undefined;
  onMediaError?: ((message: string) => void) | undefined;
  onConnectionStateChange?: ((state: string) => void) | undefined;
}

export const DEFAULT_CALL_STUN_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.cloudflare.com:3478" },
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

export class CallSessionManager {
  private localFingerprint: string;
  private localDisplayName: string;
  private sendSignal: (signal: CallSignal) => void;
  private iceServers: RTCIceServer[];
  private onStateChanged?: ((state: CallState) => void) | undefined;
  private onRemoteStream?: ((stream: MediaStream) => void) | undefined;
  private onLocalStream?: ((stream: MediaStream) => void) | undefined;
  private onMediaError?: ((message: string) => void) | undefined;
  private onConnectionStateChange?: ((state: string) => void) | undefined;

  private state: CallState = CallState.IDLE;
  private activeCallId: string | null = null;
  private activePeerFingerprint: string | null = null;
  private activeCallType: CallType = "AUDIO";

  private peerConnection: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private remoteStream: MediaStream | null = null;
  private remoteTracks = new Map<string, MediaStreamTrack>();

  private pendingOfferSdp: string | null = null;
  private pendingIceCandidates: RTCIceCandidateInit[] = [];
  private canSendLocalIce = false;
  private pendingLocalIceCandidates: RTCIceCandidateInit[] = [];

  private callStartTime: number | null = null;
  private isAudioMuted = false;
  private isVideoMuted = false;

  constructor(options: CallSessionOptions) {
    this.localFingerprint = options.localFingerprint;
    this.localDisplayName = options.localDisplayName ?? "";
    this.sendSignal = options.sendSignal;
    this.iceServers = options.iceServers ?? DEFAULT_CALL_STUN_SERVERS;
    this.onStateChanged = options.onStateChanged;
    this.onRemoteStream = options.onRemoteStream;
    this.onLocalStream = options.onLocalStream;
    this.onMediaError = options.onMediaError;
    this.onConnectionStateChange = options.onConnectionStateChange;
  }

  public setLocalDisplayName(name: string): void {
    this.localDisplayName = name;
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

  private createPeerConnection(
    attachLocalTracks = true,
  ): RTCPeerConnection | null {
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
          const candJson = event.candidate.toJSON();
          if (!this.canSendLocalIce) {
            this.pendingLocalIceCandidates.push(candJson);
            return;
          }
          this.sendSignal({
            type: "call_ice",
            callId: this.activeCallId,
            callType: this.activeCallType,
            callerFingerprint: this.localFingerprint,
            recipientFingerprint: this.activePeerFingerprint,
            candidate: candJson,
          });
        }
      };

      pc.ontrack = (event) => {
        const incomingTracks = event.streams[0]?.getTracks().length
          ? event.streams[0].getTracks()
          : [event.track];

        for (const t of incomingTracks) {
          this.remoteTracks.set(t.id, t);
          t.onunmute = () => {
            if (typeof MediaStream !== "undefined") {
              this.setRemoteStream(
                new MediaStream(Array.from(this.remoteTracks.values())),
              );
            }
          };
          t.onended = () => {
            this.remoteTracks.delete(t.id);
          };
        }

        const stream =
          typeof MediaStream !== "undefined"
            ? new MediaStream(Array.from(this.remoteTracks.values()))
            : event.streams[0];
        if (stream) {
          this.setRemoteStream(stream);
        }
      };

      const updateConnStatus = () => {
        const ice = pc.iceConnectionState;
        const conn = pc.connectionState || ice;
        if (
          conn === "connected" ||
          ice === "connected" ||
          ice === "completed"
        ) {
          this.onConnectionStateChange?.("connected");
          if (this.state !== CallState.CONNECTED) {
            this.setState(CallState.CONNECTED);
            if (!this.callStartTime) this.callStartTime = Date.now();
          }
        } else if (conn === "failed" || ice === "failed") {
          this.onConnectionStateChange?.("failed");
          if (this.state === CallState.CONNECTED) {
            this.endCall();
          }
        } else if (conn === "disconnected" || ice === "disconnected") {
          this.onConnectionStateChange?.("disconnected");
        } else if (conn === "closed") {
          this.onConnectionStateChange?.("closed");
          if (this.state === CallState.CONNECTED) {
            this.endCall();
          }
        } else {
          this.onConnectionStateChange?.("connecting");
        }
      };

      pc.onconnectionstatechange = updateConnStatus;
      pc.oniceconnectionstatechange = updateConnStatus;

      // Bind all acquired local audio/video tracks to peer connection
      if (attachLocalTracks) {
        this.attachLocalTracksToPeer(pc);
      }

      this.peerConnection = pc;
      return pc;
    } catch (err) {
      console.warn("Failed creating RTCPeerConnection:", err);
      return null;
    }
  }

  private attachLocalTracksToPeer(pc: RTCPeerConnection): void {
    if (!this.localStream) return;
    const existingSenders = pc.getSenders ? pc.getSenders() : [];
    for (const track of this.localStream.getTracks()) {
      if (existingSenders.some((s) => s.track?.id === track.id)) continue;
      try {
        pc.addTrack(track, this.localStream);
      } catch {
        // Ignore duplicate track addition
      }
    }
  }

  private flushLocalIceCandidates(): void {
    if (!this.activeCallId || !this.activePeerFingerprint) {
      this.pendingLocalIceCandidates = [];
      return;
    }
    this.canSendLocalIce = true;
    while (this.pendingLocalIceCandidates.length > 0) {
      const candidate = this.pendingLocalIceCandidates.shift();
      if (candidate) {
        this.sendSignal({
          type: "call_ice",
          callId: this.activeCallId,
          callType: this.activeCallType,
          callerFingerprint: this.localFingerprint,
          recipientFingerprint: this.activePeerFingerprint,
          candidate,
        });
      }
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
    this.canSendLocalIce = false;
    this.pendingLocalIceCandidates = [];
    this.setState(CallState.OUTGOING_RINGING);

    // Acquire local media stream if navigator.mediaDevices exists
    await this.acquireLocalMedia(type);

    // Abort if caller cancelled/ended the call while waiting on permissions
    if (this.activeCallId !== callId) {
      this.stopLocalMediaStream();
      return callId;
    }

    const pc = this.createPeerConnection(true);
    let sdpOffer: string | undefined;

    if (pc) {
      try {
        // Guarantee receive transceivers exist even if local mic/camera acquisition failed
        const hasAudio = (this.localStream?.getAudioTracks().length ?? 0) > 0;
        const hasVideo = (this.localStream?.getVideoTracks().length ?? 0) > 0;
        if (!hasAudio) {
          pc.addTransceiver?.("audio", { direction: "recvonly" });
        }
        if (type === "VIDEO" && !hasVideo) {
          pc.addTransceiver?.("video", { direction: "recvonly" });
        }

        const offer = await pc.createOffer({
          offerToReceiveAudio: true,
          offerToReceiveVideo: type === "VIDEO",
        });
        await pc.setLocalDescription(offer);
        sdpOffer = pc.localDescription?.sdp || offer.sdp;
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
      ...(this.localDisplayName
        ? { callerDisplayName: this.localDisplayName }
        : {}),
      sdp: sdpOffer,
    });

    this.flushLocalIceCandidates();
    return callId;
  }

  public async acceptCall(callId: string): Promise<void> {
    if (
      this.state !== CallState.INCOMING_RINGING ||
      this.activeCallId !== callId
    ) {
      throw new Error("No pending incoming call to accept");
    }

    this.canSendLocalIce = false;
    this.pendingLocalIceCandidates = [];

    await this.acquireLocalMedia(this.activeCallType);

    if (
      this.activeCallId !== callId ||
      this.state !== CallState.INCOMING_RINGING
    ) {
      this.stopLocalMediaStream();
      return;
    }

    // Create PC without local tracks first so setRemoteDescription creates exact m-line transceivers
    const pc = this.createPeerConnection(false);
    let sdpAnswer: string | undefined;

    if (pc && this.pendingOfferSdp) {
      try {
        await pc.setRemoteDescription(
          new RTCSessionDescription({
            type: "offer",
            sdp: this.pendingOfferSdp,
          }),
        );

        // Attach local tracks after setting remote description for Unified Plan mid alignment
        this.attachLocalTracksToPeer(pc);

        // Flush any queued ICE candidates that arrived before remote description
        while (this.pendingIceCandidates.length > 0) {
          const cand = this.pendingIceCandidates.shift();
          if (cand) {
            await pc.addIceCandidate(new RTCIceCandidate(cand)).catch(() => {});
          }
        }

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        sdpAnswer = pc.localDescription?.sdp || answer.sdp;
      } catch (err) {
        console.warn("Failed creating SDP answer for call:", err);
      }
    } else if (pc) {
      this.attachLocalTracksToPeer(pc);
    }

    this.setState(CallState.CONNECTED);
    this.callStartTime = Date.now();
    this.onConnectionStateChange?.("connecting");

    if (this.activePeerFingerprint) {
      this.sendSignal({
        type: "call_answer",
        callId,
        callType: this.activeCallType,
        callerFingerprint: this.localFingerprint,
        recipientFingerprint: this.activePeerFingerprint,
        sdp: sdpAnswer,
      });
    }

    this.flushLocalIceCandidates();
  }

  public rejectCall(callId: string): void {
    if (this.activeCallId === callId && this.activePeerFingerprint) {
      this.sendSignal({
        type: "call_reject",
        callId,
        callType: this.activeCallType,
        callerFingerprint: this.localFingerprint,
        recipientFingerprint: this.activePeerFingerprint,
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
        if (this.activeCallId === signal.callId) {
          // Ignore duplicate offer delivery for the same active call
          return;
        }
        if (this.isBusy()) {
          // Busy: Already in another call
          this.sendSignal({
            type: "call_busy",
            callId: signal.callId,
            callType: signal.callType,
            callerFingerprint: this.localFingerprint,
            recipientFingerprint: signal.callerFingerprint,
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
          this.onConnectionStateChange?.("connecting");
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
      const audioConstraints: MediaTrackConstraints = {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      };
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: audioConstraints,
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
        if (type === "VIDEO") {
          // Fallback to audio-only if webcam is unavailable or permission declined for camera
          try {
            const audioOnly = await navigator.mediaDevices.getUserMedia({
              audio: audioConstraints,
              video: false,
            });
            this.localStream = audioOnly;
            this.onLocalStream?.(audioOnly);
            this.onMediaError?.(
              "Camera unavailable — continuing with voice audio.",
            );
            return;
          } catch (audioErr) {
            console.warn("Audio fallback getUserMedia failed:", audioErr);
          }
        }
        const message =
          err instanceof Error && err.name === "NotAllowedError"
            ? "Microphone/camera permission denied. Allow access in your browser/app settings so the peer can hear you."
            : "Could not access microphone. You can still listen to incoming audio.";
        this.onMediaError?.(message);
        console.warn("getUserMedia failed or denied:", err);
      }
    }
  }

  private stopLocalMediaStream(): void {
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => track.stop());
      this.localStream = null;
    }
  }

  private setState(newState: CallState): void {
    this.state = newState;
    this.onStateChanged?.(newState);
  }

  private cleanup(terminalState: CallState): void {
    this.stopLocalMediaStream();
    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }
    this.remoteStream = null;
    this.remoteTracks.clear();
    this.pendingOfferSdp = null;
    this.pendingIceCandidates = [];
    this.canSendLocalIce = false;
    this.pendingLocalIceCandidates = [];
    this.callStartTime = null;
    this.activeCallId = null;
    this.activePeerFingerprint = null;
    this.setState(terminalState);
  }
}
