import { describe, it, expect, vi } from "vitest";
import { CallSessionManager, CallState, type CallSignal } from "./call-session";

describe("CallSessionManager WebRTC Calling Suite", () => {
  it("should initiate call, transition state, and dispatch call_offer signal", async () => {
    const signals: CallSignal[] = [];
    const stateChanges: CallState[] = [];

    const manager = new CallSessionManager({
      localFingerprint: "fp-alice",
      sendSignal: (sig) => signals.push(sig),
      onStateChanged: (st) => stateChanges.push(st),
    });

    expect(manager.getState()).toBe(CallState.IDLE);

    const callId = await manager.initiateCall("fp-bob", "VIDEO");

    expect(callId).toBeDefined();
    expect(manager.getState()).toBe(CallState.OUTGOING_RINGING);
    expect(manager.getActiveCallId()).toBe(callId);
    expect(manager.getActivePeerFingerprint()).toBe("fp-bob");
    expect(manager.getCallType()).toBe("VIDEO");

    expect(signals).toHaveLength(1);
    expect(signals[0]).toMatchObject({
      type: "call_offer",
      callId,
      callType: "VIDEO",
      callerFingerprint: "fp-alice",
      recipientFingerprint: "fp-bob",
    });
  });

  it("should handle incoming call offer and accept it", async () => {
    const signals: CallSignal[] = [];
    const manager = new CallSessionManager({
      localFingerprint: "fp-bob",
      sendSignal: (sig) => signals.push(sig),
    });

    // Bob receives call offer from Alice
    manager.handleIncomingSignal({
      type: "call_offer",
      callId: "call-123",
      callType: "AUDIO",
      callerFingerprint: "fp-alice",
      recipientFingerprint: "fp-bob",
    });

    expect(manager.getState()).toBe(CallState.INCOMING_RINGING);
    expect(manager.getActiveCallId()).toBe("call-123");
    expect(manager.getActivePeerFingerprint()).toBe("fp-alice");

    // Bob accepts the call
    await manager.acceptCall("call-123");
    expect(manager.getState()).toBe(CallState.CONNECTED);
    expect(manager.getDurationSeconds()).toBe(0);

    expect(signals).toHaveLength(1);
    expect(signals[0]).toMatchObject({
      type: "call_answer",
      callId: "call-123",
      callerFingerprint: "fp-bob",
      recipientFingerprint: "fp-alice",
    });
  });

  it("should handle call rejection and route call_reject to caller", () => {
    const signals: CallSignal[] = [];
    const manager = new CallSessionManager({
      localFingerprint: "fp-bob",
      sendSignal: (sig) => signals.push(sig),
    });

    manager.handleIncomingSignal({
      type: "call_offer",
      callId: "call-999",
      callType: "AUDIO",
      callerFingerprint: "fp-alice",
      recipientFingerprint: "fp-bob",
    });

    manager.rejectCall("call-999");
    expect(manager.getState()).toBe(CallState.REJECTED);
    expect(signals[0]).toMatchObject({
      type: "call_reject",
      callId: "call-999",
      callerFingerprint: "fp-bob",
      recipientFingerprint: "fp-alice",
    });
  });

  it("should send busy response to second caller when call offer arrives during active call", async () => {
    const signals: CallSignal[] = [];
    const manager = new CallSessionManager({
      localFingerprint: "fp-bob",
      sendSignal: (sig) => signals.push(sig),
    });

    await manager.initiateCall("fp-alice", "AUDIO");

    // Third party Eve calls while Bob is ringing
    manager.handleIncomingSignal({
      type: "call_offer",
      callId: "call-eve",
      callType: "AUDIO",
      callerFingerprint: "fp-eve",
      recipientFingerprint: "fp-bob",
    });

    const busySignal = signals.find((s) => s.type === "call_busy");
    expect(busySignal).toBeDefined();
    expect(busySignal?.callerFingerprint).toBe("fp-bob");
    expect(busySignal?.recipientFingerprint).toBe("fp-eve");
  });

  it("should toggle audio and video mute states", () => {
    const manager = new CallSessionManager({
      localFingerprint: "fp-alice",
      sendSignal: vi.fn(),
    });

    expect(manager.isAudioEnabled()).toBe(true);
    expect(manager.isVideoEnabled()).toBe(true);

    manager.toggleAudio();
    expect(manager.isAudioEnabled()).toBe(false);

    manager.toggleVideo();
    expect(manager.isVideoEnabled()).toBe(false);
  });

  it("should exchange ICE candidates and transition to CONNECTED on answer", async () => {
    const signals: CallSignal[] = [];
    const alice = new CallSessionManager({
      localFingerprint: "fp-alice",
      sendSignal: (sig) => signals.push(sig),
    });

    const callId = await alice.initiateCall("fp-bob", "AUDIO");
    expect(alice.getState()).toBe(CallState.OUTGOING_RINGING);

    // Alice receives ICE candidate before or during ringing
    alice.handleIncomingSignal({
      type: "call_ice",
      callId,
      callType: "AUDIO",
      callerFingerprint: "fp-bob",
      recipientFingerprint: "fp-alice",
      candidate: {
        candidate: "candidate:1 1 UDP 2122252543 192.168.1.100 50000 typ host",
        sdpMid: "0",
        sdpMLineIndex: 0,
      },
    });

    // Bob answers with SDP
    alice.handleIncomingSignal({
      type: "call_answer",
      callId,
      callType: "AUDIO",
      callerFingerprint: "fp-bob",
      recipientFingerprint: "fp-alice",
      sdp: "v=0\r\no=- 12345 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\nm=audio 50000 UDP/TLS/RTP/SAVPF 111\r\n",
    });

    expect(alice.getState()).toBe(CallState.CONNECTED);
  });

  it("should deliver signals end-to-end between two CallSessionManager peers via recipientFingerprint", async () => {
    const router = (sig: CallSignal) => {
      if (sig.recipientFingerprint === "fp-alice") {
        void alice.handleIncomingSignal(sig);
      } else if (sig.recipientFingerprint === "fp-bob") {
        void bob.handleIncomingSignal(sig);
      }
    };

    const alice = new CallSessionManager({
      localFingerprint: "fp-alice",
      localDisplayName: "Alice",
      sendSignal: router,
    });
    const bob = new CallSessionManager({
      localFingerprint: "fp-bob",
      localDisplayName: "Bob",
      sendSignal: router,
    });

    const callId = await alice.initiateCall("fp-bob", "AUDIO");
    expect(alice.getState()).toBe(CallState.OUTGOING_RINGING);
    expect(bob.getState()).toBe(CallState.INCOMING_RINGING);

    await bob.acceptCall(callId);
    expect(bob.getState()).toBe(CallState.CONNECTED);
    expect(alice.getState()).toBe(CallState.CONNECTED);

    alice.endCall();
    expect(alice.getState()).toBe(CallState.ENDED);
    expect(bob.getState()).toBe(CallState.ENDED);
  });
});
