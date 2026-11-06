import { defineStore } from "pinia";
import { ref } from "vue";
import { SignalingState, PeerConnectionState } from "@campusmesh/shared-types";

export const useNetworkStore = defineStore("network", () => {
  const isOnline = ref(navigator.onLine);
  const signalingState = ref<SignalingState>(SignalingState.CONNECTED);
  const peerState = ref<PeerConnectionState>(PeerConnectionState.CONNECTED);
  const isDirectLan = ref(false);
  const isQuotaAlertDismissed = ref(false);

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
    window.addEventListener("online", () => setOnline(true));
    window.addEventListener("offline", () => setOnline(false));
  }

  return {
    isOnline,
    signalingState,
    peerState,
    isDirectLan,
    isQuotaAlertDismissed,
    setOnline,
    setSignalingState,
    setPeerState,
    setDirectLan,
    dismissQuotaAlert,
    initNetworkListeners,
  };
});
