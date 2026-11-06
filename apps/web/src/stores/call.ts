import { defineStore } from "pinia";
import { ref, computed } from "vue";
import {
  CallSessionManager,
  CallState,
  type CallType,
  type CallSignal,
} from "@campusmesh/messaging";

export const useCallStore = defineStore("call", () => {
  const callState = ref<CallState>(CallState.IDLE);
  const callType = ref<CallType>("AUDIO");
  const peerFingerprint = ref<string | null>(null);
  const peerName = ref<string>("Peer");
  const durationSeconds = ref(0);
  const isAudioMuted = ref(false);
  const isVideoMuted = ref(false);

  let timerInterval: ReturnType<typeof setInterval> | null = null;

  // Mock or real WebRTC signal dispatcher
  let signalDispatcher: ((signal: CallSignal) => void) | null = null;

  const sessionManager = new CallSessionManager({
    localFingerprint: "me",
    sendSignal: (signal) => {
      signalDispatcher?.(signal);
    },
    onStateChanged: (st) => {
      callState.value = st;
      if (st === CallState.CONNECTED) {
        startTimer();
      } else if (
        st === CallState.ENDED ||
        st === CallState.REJECTED ||
        st === CallState.BUSY ||
        st === CallState.IDLE
      ) {
        stopTimer();
      }
    },
  });

  function setSignalDispatcher(fn: (signal: CallSignal) => void) {
    signalDispatcher = fn;
  }

  function startTimer() {
    stopTimer();
    durationSeconds.value = 0;
    timerInterval = setInterval(() => {
      durationSeconds.value++;
    }, 1000);
  }

  function stopTimer() {
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
  }

  async function startCall(
    recipientFingerprint: string,
    name: string,
    type: CallType = "AUDIO",
  ): Promise<string> {
    peerFingerprint.value = recipientFingerprint;
    peerName.value = name;
    callType.value = type;
    isAudioMuted.value = false;
    isVideoMuted.value = false;

    return sessionManager.initiateCall(recipientFingerprint, type);
  }

  async function acceptCall(): Promise<void> {
    const callId = sessionManager.getActiveCallId();
    if (callId) {
      await sessionManager.acceptCall(callId);
    }
  }

  function rejectCall(): void {
    const callId = sessionManager.getActiveCallId();
    if (callId) {
      sessionManager.rejectCall(callId);
    }
    callState.value = CallState.IDLE;
    peerFingerprint.value = null;
  }

  function endCall(): void {
    sessionManager.endCall();
    callState.value = CallState.IDLE;
    peerFingerprint.value = null;
    stopTimer();
  }

  function toggleAudio(): boolean {
    const active = sessionManager.toggleAudio();
    isAudioMuted.value = !active;
    return active;
  }

  function toggleVideo(): boolean {
    const active = sessionManager.toggleVideo();
    isVideoMuted.value = !active;
    return active;
  }

  function receiveSignal(signal: CallSignal, callerName = "Peer"): void {
    if (signal.type === "call_offer") {
      peerName.value = callerName;
      peerFingerprint.value = signal.callerFingerprint;
      callType.value = signal.callType;
    }
    sessionManager.handleIncomingSignal(signal);
  }

  const formattedDuration = computed(() => {
    const mins = Math.floor(durationSeconds.value / 60)
      .toString()
      .padStart(2, "0");
    const secs = (durationSeconds.value % 60).toString().padStart(2, "0");
    return `${mins}:${secs}`;
  });

  const isCallActive = computed(() => {
    return (
      callState.value === CallState.OUTGOING_RINGING ||
      callState.value === CallState.CONNECTED
    );
  });

  return {
    callState,
    callType,
    peerFingerprint,
    peerName,
    durationSeconds,
    formattedDuration,
    isAudioMuted,
    isVideoMuted,
    isCallActive,
    setSignalDispatcher,
    startCall,
    acceptCall,
    rejectCall,
    endCall,
    toggleAudio,
    toggleVideo,
    receiveSignal,
  };
});

