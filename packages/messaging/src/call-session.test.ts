import { describe, it, expect, vi } from "vitest";
import {
  CallSessionManager,
  CallState,
  type CallSignal,
} from "./call-session";

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
    expect(signals[0]?.type).toBe("call_answer");
  });

  it("should handle call rejection and termination", () => {
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
    expect(signals[0]?.type).toBe("call_reject");
  });

  it("should send busy response when call offer arrives during active call", async () => {
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
    expect(busySignal?.recipientFingerprint).toBe("fp-bob");
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
});

