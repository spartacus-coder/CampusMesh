import { defineStore } from "pinia";
import { ref, computed } from "vue";
import {
  CallSessionManager,
  CallState,
  type CallType,
  type CallSignal,
} from "@campusmesh/messaging";
import {
  initCallAudioUnlock,
  startIncomingRingtone,
  startOutgoingRingtone,
  stopAllRingtones,
  startTitleFlash,
} from "../services/ringtone";
import { nativeService } from "../services/native";

export const useCallStore = defineStore("call", () => {
  initCallAudioUnlock();

  const callState = ref<CallState>(CallState.IDLE);
  const callType = ref<CallType>("AUDIO");
  const peerFingerprint = ref<string | null>(null);
  const peerName = ref<string>("Peer");
  const durationSeconds = ref(0);
  const isAudioMuted = ref(false);
  const isVideoMuted = ref(false);
  const mediaError = ref<string | null>(null);
  const connectionStatus = ref<string>("connecting");

  const localStream = ref<MediaStream | null>(null);
  const remoteStream = ref<MediaStream | null>(null);

  let timerInterval: ReturnType<typeof setInterval> | null = null;

  // Real WebRTC signal dispatcher via signalingClient / P2P DataChannel
  let signalDispatcher: ((signal: CallSignal) => void) | null = null;

  const sessionManager = new CallSessionManager({
    localFingerprint: "me",
    sendSignal: (signal) => {
      signalDispatcher?.(signal);
    },
    onLocalStream: (stream) => {
      localStream.value = stream;
    },
    onRemoteStream: (stream) => {
      remoteStream.value = stream;
    },
    onMediaError: (err) => {
      mediaError.value = err;
    },
    onConnectionStateChange: (status) => {
      connectionStatus.value = status;
    },
    onStateChanged: (st) => {
      callState.value = st;
      if (st === CallState.INCOMING_RINGING) {
        startIncomingRingtone();
        startTitleFlash(
          `📞 Incoming ${callType.value === "VIDEO" ? "Video" : "Voice"} Call — ${peerName.value}`,
        );
      } else if (st === CallState.OUTGOING_RINGING) {
        startOutgoingRingtone();
      } else if (st === CallState.CONNECTED) {
        stopAllRingtones();
        void nativeService.dismissIncomingCallNotification();
        startTimer();
      } else if (
        st === CallState.ENDED ||
        st === CallState.REJECTED ||
        st === CallState.BUSY ||
        st === CallState.IDLE
      ) {
        stopAllRingtones();
        void nativeService.dismissIncomingCallNotification();
        stopTimer();
        localStream.value = null;
        remoteStream.value = null;
        mediaError.value = null;
        connectionStatus.value = "connecting";
      }
    },
  });

  function setLocalFingerprint(fp: string) {
    (
      sessionManager as unknown as { localFingerprint: string }
    ).localFingerprint = fp;
  }

  function setLocalDisplayName(name: string) {
    sessionManager.setLocalDisplayName(name);
  }

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
    void nativeService.requestNotificationPermission();
    peerFingerprint.value = recipientFingerprint;
    peerName.value = name;
    callType.value = type;
    isAudioMuted.value = false;
    isVideoMuted.value = false;
    mediaError.value = null;
    connectionStatus.value = "connecting";

    return sessionManager.initiateCall(recipientFingerprint, type);
  }

  async function acceptCall(): Promise<void> {
    void nativeService.requestNotificationPermission();
    const callId = sessionManager.getActiveCallId();
    if (callId) {
      mediaError.value = null;
      connectionStatus.value = "connecting";
      await sessionManager.acceptCall(callId);
    }
  }

  function rejectCall(): void {
    const callId = sessionManager.getActiveCallId();
    if (callId) {
      sessionManager.rejectCall(callId);
    }
    stopAllRingtones();
    void nativeService.dismissIncomingCallNotification();
    callState.value = CallState.IDLE;
    peerFingerprint.value = null;
    localStream.value = null;
    remoteStream.value = null;
    mediaError.value = null;
    stopTimer();
  }

  function endCall(): void {
    sessionManager.endCall();
    stopAllRingtones();
    void nativeService.dismissIncomingCallNotification();
    callState.value = CallState.IDLE;
    peerFingerprint.value = null;
    localStream.value = null;
    remoteStream.value = null;
    mediaError.value = null;
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

  async function receiveSignal(
    signal: CallSignal,
    callerName = "Peer",
  ): Promise<void> {
    if (signal.type === "call_offer") {
      peerName.value = signal.callerDisplayName || callerName;
      peerFingerprint.value = signal.callerFingerprint;
      callType.value = signal.callType;
    }
    await sessionManager.handleIncomingSignal(signal);
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
    mediaError,
    connectionStatus,
    localStream,
    remoteStream,
    isCallActive,
    setLocalFingerprint,
    setLocalDisplayName,
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
