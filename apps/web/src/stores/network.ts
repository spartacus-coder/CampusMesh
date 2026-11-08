import { defineStore } from "pinia";
import { ref } from "vue";
import {
  SignalingState,
  PeerConnectionState,
  DeliveryState,
  MessageType,
} from "@campusmesh/shared-types";
import type { StoredMessage } from "@campusmesh/storage";
import { useChatStore } from "./chat";
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
      peerTransport.onDataMessage = (peerFp, channel, data) => {
        if (channel === "cm-messages") {
          try {
            const text = new TextDecoder().decode(data);
            const msg = JSON.parse(text);
            const chatStore = useChatStore();
            chatStore.appendMessage({
              id: msg.id || `m_${Date.now()}`,
              conversationId: msg.conversationId || `conv-${peerFp}`,
              senderFingerprint: peerFp,
              recipientFingerprint: msg.recipientFingerprint,
              content: msg.content,
              contentType: msg.contentType || MessageType.TEXT,
              timestamp: msg.timestamp || Date.now(),
              deliveryState: DeliveryState.DELIVERED,
              isOutgoing: false,
            });
            if (typeof navigator !== "undefined" && "vibrate" in navigator) {
              navigator.vibrate(40);
            }
          } catch (err) {
            console.warn("Failed to process incoming P2P message:", err);
          }
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

      signalingClient.onPeerJoined = async (peerFp) => {
        if (peerTransport) {
          const offer = await peerTransport.createOffer(peerFp);
          signalingClient?.sendOffer(peerFp, offer);
        }
      };

      signalingClient.onRoomPeers = async (peers) => {
        for (const peerFp of peers) {
          if (peerTransport) {
            const offer = await peerTransport.createOffer(peerFp);
            signalingClient?.sendOffer(peerFp, offer);
          }
        }
      };

      signalingClient.onChatMessage = (_senderFp, data) => {
        try {
          const msg =
            typeof data === "string"
              ? JSON.parse(data)
              : (data as Record<string, unknown>);
          const chatStore = useChatStore();
          chatStore.appendMessage({
            id: (msg.id as string) || `m_${Date.now()}`,
            conversationId:
              (msg.conversationId as string) || `conv-${msg.senderFingerprint}`,
            senderFingerprint: (msg.senderFingerprint as string) || _senderFp,
            recipientFingerprint: msg.recipientFingerprint as
              string | undefined,
            content: (msg.content as string) || "",
            contentType: (msg.contentType as MessageType) || MessageType.TEXT,
            timestamp: (msg.timestamp as number) || Date.now(),
            deliveryState: DeliveryState.DELIVERED,
            isOutgoing: false,
          });
          if (typeof navigator !== "undefined" && "vibrate" in navigator) {
            navigator.vibrate(40);
          }
        } catch (err) {
          console.warn(
            "Failed to process incoming signaling chat message:",
            err,
          );
        }
      };

      signalingClient.onMailboxMessages = (records) => {
        const chatStore = useChatStore();
        for (const rec of records) {
          try {
            const r = rec as { envelope?: string; senderFingerprint?: string };
            if (!r.envelope) continue;
            const msg = JSON.parse(r.envelope) as Record<string, unknown>;
            chatStore.appendMessage({
              id: (msg.id as string) || `m_${Date.now()}`,
              conversationId:
                (msg.conversationId as string) ||
                `conv-${msg.senderFingerprint || r.senderFingerprint}`,
              senderFingerprint:
                (msg.senderFingerprint as string) ||
                r.senderFingerprint ||
                "peer",
              recipientFingerprint: msg.recipientFingerprint as
                string | undefined,
              content: (msg.content as string) || "",
              contentType: (msg.contentType as MessageType) || MessageType.TEXT,
              timestamp: (msg.timestamp as number) || Date.now(),
              deliveryState: DeliveryState.DELIVERED,
              isOutgoing: false,
            });
          } catch {
            // Ignore malformed mailbox record
          }
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

  async function connectUserSignaling(localFingerprint: string) {
    const userRoom = `user_${localFingerprint}`;
    if (
      activeRoomId.value === userRoom &&
      signalingState.value === SignalingState.CONNECTED
    ) {
      return;
    }
    await connectSignaling(userRoom, localFingerprint);
  }

  async function connectSignaling(roomId: string, localFingerprint: string) {
    initTransport();
    activeRoomId.value = roomId;
    if (signalingClient) {
      await signalingClient.connect(roomId, localFingerprint);
      // Retrieve any offline messages from room mailbox
      setTimeout(() => {
        signalingClient?.fetchMailbox();
      }, 500);
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

  function sendChatMessage(
    recipientFingerprint: string,
    conversationId: string,
    text: string,
    localFingerprint: string,
  ): StoredMessage {
    const messageId = `m_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const timestamp = Date.now();
    const payload = {
      id: messageId,
      conversationId,
      content: text,
      contentType: MessageType.TEXT,
      timestamp,
      senderFingerprint: localFingerprint,
      recipientFingerprint,
    };

    let delivered = false;
    const bytes = new TextEncoder().encode(JSON.stringify(payload));
    if (peerTransport) {
      delivered = peerTransport.sendData(
        recipientFingerprint,
        "cm-messages",
        bytes,
      );
    }

    // Also transmit via signaling gateway to guarantee delivery over 4G/5G mobile carrier NAT
    if (signalingClient && signalingState.value === SignalingState.CONNECTED) {
      signalingClient.sendChatMessage(recipientFingerprint, payload);
    }

    const storedMsg: StoredMessage = {
      id: messageId,
      conversationId,
      senderFingerprint: localFingerprint,
      recipientFingerprint,
      content: text,
      contentType: MessageType.TEXT,
      timestamp,
      deliveryState: delivered ? DeliveryState.DELIVERED : DeliveryState.SENT,
      isOutgoing: true,
    };

    const chatStore = useChatStore();
    chatStore.appendMessage(storedMsg);
    return storedMsg;
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
    connectUserSignaling,
    connectSignaling,
    disconnectSignaling,
    connectToPeer,
    createManualOffer,
    acceptManualOffer,
    acceptManualAnswer,
    sendChatMessage,
  };
});
