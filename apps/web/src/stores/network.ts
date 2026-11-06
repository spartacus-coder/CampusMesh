import { defineStore } from "pinia";
import { ref } from "vue";
import { SignalingState, PeerConnectionState } from "@campusmesh/shared-types";
import {
  SignalingClient,
  WebRtcPeerTransport,
  exportManualSignal,
  importManualSignal,
} from "@campusmesh/transport";

export const useNetworkStore = defineStore("network", () => {
  const isOnline = ref(
    typeof navigator !== "undefined" ? navigator.onLine : true,
  );
  const signalingState = ref<SignalingState>(SignalingState.CONNECTED);
  const peerState = ref<PeerConnectionState>(PeerConnectionState.CONNECTED);
  const isDirectLan = ref(false);
  const isQuotaAlertDismissed = ref(false);
  const activeRoomId = ref<string | null>(null);

  let signalingClient: SignalingClient | null = null;
  let peerTransport: WebRtcPeerTransport | null = null;

  function setOnline(online: boolean) {
    isOnline.value = online;
  }

  function setSignalingState(state: SignalingState) {
    signalingState.value = state;
  }

  function setPeerState(state: PeerConnectionState) {
    peerState.value = state;
  }

  function setDirectLan(enabled: boolean) {
    isDirectLan.value = enabled;
  }

  function dismissQuotaAlert() {
    isQuotaAlertDismissed.value = true;
  }

  function initNetworkListeners() {
    if (typeof window !== "undefined") {
      window.addEventListener("online", () => setOnline(true));
      window.addEventListener("offline", () => setOnline(false));
    }
  }

  function initTransport() {
    if (typeof RTCPeerConnection === "undefined") return;

    if (!peerTransport) {
      peerTransport = new WebRtcPeerTransport();
      peerTransport.onStateChange = (_fp, state) => {
        peerState.value = state;
      };
      peerTransport.onIceCandidate = (peerFp, candidate) => {
        if (
          signalingClient &&
          signalingState.value === SignalingState.CONNECTED
        ) {
          signalingClient.sendCandidate(peerFp, candidate);
        }
      };
    }

    if (!signalingClient) {
      signalingClient = new SignalingClient({
        serverUrl: import.meta.env.VITE_SIGNALING_URL,
      });
      signalingClient.onStateChange = (state) => {
        signalingState.value = state;
        if (state === SignalingState.UNAVAILABLE_QUOTA) {
          isQuotaAlertDismissed.value = false;
        }
      };

      signalingClient.onOffer = async (senderFp, offer) => {
        if (peerTransport) {
          const answer = await peerTransport.handleOffer(senderFp, offer);
          signalingClient?.sendAnswer(senderFp, answer);
        }
      };

      signalingClient.onAnswer = async (senderFp, answer) => {
        if (peerTransport) {
          await peerTransport.handleAnswer(senderFp, answer);
        }
      };

      signalingClient.onCandidate = async (senderFp, candidate) => {
        if (peerTransport) {
          await peerTransport.addIceCandidate(senderFp, candidate);
        }
      };
    }
  }

  async function connectSignaling(roomId: string, localFingerprint: string) {
    initTransport();
    activeRoomId.value = roomId;
    if (signalingClient) {
      await signalingClient.connect(roomId, localFingerprint);
    }
  }

  function disconnectSignaling() {
    if (signalingClient) {
      signalingClient.disconnect();
    }
    activeRoomId.value = null;
  }

  async function connectToPeer(peerFingerprint: string) {
    initTransport();
    if (peerTransport && signalingClient) {
      const offer = await peerTransport.createOffer(peerFingerprint);
      signalingClient.sendOffer(peerFingerprint, offer);
    }
  }

  // Manual Out-of-band / Air-gapped Signaling (RFC 9285 Base45)
  async function createManualOffer(
    peerFingerprint: string,
    localFingerprint: string,
  ): Promise<string> {
    initTransport();
    if (!peerTransport)
      throw new Error("WebRTC not supported on this platform");
    const offer = await peerTransport.createOffer(peerFingerprint);
    return exportManualSignal({
      version: 1,
      type: "offer",
      senderFingerprint: localFingerprint,
      sdp: offer.sdp || "",
    });
  }

  async function acceptManualOffer(
    offerString: string,
    localFingerprint: string,
  ): Promise<{ answerString: string; senderFingerprint: string }> {
    initTransport();
    if (!peerTransport)
      throw new Error("WebRTC not supported on this platform");
    const payload = importManualSignal(offerString);
    if (payload.type !== "offer") {
      throw new Error("Expected an offer payload, got " + payload.type);
    }
    const answer = await peerTransport.handleOffer(payload.senderFingerprint, {
      type: "offer",
      sdp: payload.sdp,
    });
    const answerString = exportManualSignal({
      version: 1,
      type: "answer",
      senderFingerprint: localFingerprint,
      sdp: answer.sdp || "",
    });
    return {
      answerString,
      senderFingerprint: payload.senderFingerprint,
    };
  }

  async function acceptManualAnswer(answerString: string): Promise<void> {
    initTransport();
    if (!peerTransport)
      throw new Error("WebRTC not supported on this platform");
    const payload = importManualSignal(answerString);
    if (payload.type !== "answer") {
      throw new Error("Expected an answer payload, got " + payload.type);
    }
    await peerTransport.handleAnswer(payload.senderFingerprint, {
      type: "answer",
      sdp: payload.sdp,
    });
  }

  return {
    isOnline,
    signalingState,
    peerState,
    isDirectLan,
    isQuotaAlertDismissed,
    activeRoomId,
    setOnline,
    setSignalingState,
    setPeerState,
    setDirectLan,
    dismissQuotaAlert,
    initNetworkListeners,
    connectSignaling,
    disconnectSignaling,
    connectToPeer,
    createManualOffer,
    acceptManualOffer,
    acceptManualAnswer,
  };
});
