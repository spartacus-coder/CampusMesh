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
  nativeService,
  type LanPeer,
  type WifiDirectPeer,
  type BlePeer,
} from "../services/native";
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
  const isAirGappedMeshActive = ref(false);
  const isQuotaAlertDismissed = ref(false);
  const activeRoomId = ref<string | null>(null);
  const lanPeers = ref<Record<string, LanPeer>>({});
  const wifiDirectPeers = ref<WifiDirectPeer[]>([]);
  const blePeers = ref<Record<string, BlePeer>>({});
  let lanInterval: ReturnType<typeof setInterval> | null = null;

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
        if (channel === "cm-control") {
          try {
            const text = new TextDecoder().decode(data);
            const ack = JSON.parse(text);
            if (ack.type === "chat_ack" && ack.messageId && ack.deliveryState) {
              const chatStore = useChatStore();
              const convId = (ack.conversationId as string) || `conv-${peerFp}`;
              chatStore.updateMessageDelivery(
                convId,
                ack.messageId as string,
                ack.deliveryState as DeliveryState,
              );
            }
          } catch {
            // Ignore malformed control packet
          }
        }

        if (channel === "cm-messages") {
          try {
            const text = new TextDecoder().decode(data);
            const msg = JSON.parse(text);
            const msgId = msg.id || `m_${Date.now()}`;
            const chatStore = useChatStore();
            chatStore.appendMessage({
              id: msgId,
              conversationId: `conv-${peerFp}`,
              senderFingerprint: peerFp,
              recipientFingerprint: msg.recipientFingerprint,
              content: msg.content,
              contentType: msg.contentType || MessageType.TEXT,
              timestamp: msg.timestamp || Date.now(),
              deliveryState: DeliveryState.DELIVERED,
              isOutgoing: false,
            });
            nativeService.hapticFeedback();
            nativeService.notifyMessage(
              `CampusMesh (${peerFp.slice(0, 8)})`,
              msg.content || "Encrypted message",
              `conv-${peerFp}`,
            );
            sendDeliveryAck(
              peerFp,
              msgId,
              DeliveryState.DELIVERED,
              `conv-${peerFp}`,
            );
          } catch (err) {
            console.warn("Failed to process incoming P2P message:", err);
          }
        }
      };
    }

    if (!signalingClient) {
      signalingClient = new SignalingClient({
        serverUrl:
          import.meta.env.VITE_SIGNALING_URL ||
          "wss://campusmesh-signaling.chandragupt989.workers.dev",
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
          const senderFp = (msg.senderFingerprint as string) || _senderFp;
          const msgId = (msg.id as string) || `m_${Date.now()}`;
          const chatStore = useChatStore();
          chatStore.appendMessage({
            id: msgId,
            conversationId: `conv-${senderFp}`,
            senderFingerprint: senderFp,
            recipientFingerprint: msg.recipientFingerprint as
              string | undefined,
            content: (msg.content as string) || "",
            contentType: (msg.contentType as MessageType) || MessageType.TEXT,
            timestamp: (msg.timestamp as number) || Date.now(),
            deliveryState: DeliveryState.DELIVERED,
            isOutgoing: false,
          });
          nativeService.hapticFeedback();
          nativeService.notifyMessage(
            `CampusMesh (${senderFp.slice(0, 8)})`,
            (msg.content as string) || "Encrypted message",
            `conv-${senderFp}`,
          );
          sendDeliveryAck(senderFp, msgId, DeliveryState.DELIVERED, `conv-${senderFp}`);
        } catch (err) {
          console.warn(
            "Failed to process incoming signaling chat message:",
            err,
          );
        }
      };

      signalingClient.onChatAck = (_senderFp, data) => {
        try {
          const ack =
            typeof data === "string"
              ? JSON.parse(data)
              : (data as Record<string, unknown>);
          if (ack.messageId && ack.deliveryState) {
            const chatStore = useChatStore();
            const convId = (ack.conversationId as string) || `conv-${_senderFp}`;
            chatStore.updateMessageDelivery(
              convId,
              ack.messageId as string,
              ack.deliveryState as DeliveryState,
            );
          }
        } catch {
          // Ignore malformed ack
        }
      };

      signalingClient.onMailboxMessages = (records) => {
        const chatStore = useChatStore();
        for (const rec of records) {
          try {
            const r = rec as { envelope?: string; senderFingerprint?: string };
            if (!r.envelope) continue;
            const msg = JSON.parse(r.envelope) as Record<string, unknown>;
            const senderFp =
              (msg.senderFingerprint as string) ||
              r.senderFingerprint ||
              "peer";
            const msgId = (msg.id as string) || `m_${Date.now()}`;
            chatStore.appendMessage({
              id: msgId,
              conversationId: `conv-${senderFp}`,
              senderFingerprint: senderFp,
              recipientFingerprint: msg.recipientFingerprint as
                string | undefined,
              content: (msg.content as string) || "",
              contentType: (msg.contentType as MessageType) || MessageType.TEXT,
              timestamp: (msg.timestamp as number) || Date.now(),
              deliveryState: DeliveryState.DELIVERED,
              isOutgoing: false,
            });
            sendDeliveryAck(senderFp, msgId, DeliveryState.DELIVERED, `conv-${senderFp}`);
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
    const targetConvId = conversationId.startsWith("conv-")
      ? conversationId
      : `conv-${recipientFingerprint}`;

    const payload = {
      id: messageId,
      conversationId: targetConvId,
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

    // Also transmit via Air-Gapped Wi-Fi Direct if active
    if (nativeService.isAndroid && isAirGappedMeshActive.value) {
      nativeService.sendWifiDirectMessage(JSON.stringify(payload)).catch(() => {});
    }

    const storedMsg: StoredMessage = {
      id: messageId,
      conversationId: targetConvId,
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

  async function startLanDiscovery(localFingerprint: string, displayName: string) {
    if (!nativeService.isNative) return;

    await nativeService.startLanDiscovery(localFingerprint, (peer) => {
      lanPeers.value = {
        ...lanPeers.value,
        [peer.fingerprint]: peer,
      };
    });

    // Broadcast immediate beacon, then recurring every 10s
    await nativeService.broadcastLanBeacon(localFingerprint, displayName);
    if (lanInterval) clearInterval(lanInterval);
    lanInterval = setInterval(() => {
      nativeService.broadcastLanBeacon(localFingerprint, displayName);
    }, 10000);
  }

  async function stopLanDiscovery() {
    if (lanInterval) {
      clearInterval(lanInterval);
      lanInterval = null;
    }
    await nativeService.stopLanDiscovery();
  }

  function sendDeliveryAck(
    targetFingerprint: string,
    messageId: string,
    state: DeliveryState,
    conversationId: string,
  ) {
    const payload = {
      messageId,
      deliveryState: state,
      conversationId,
      timestamp: Date.now(),
    };
    if (signalingClient && signalingState.value === SignalingState.CONNECTED) {
      signalingClient.sendChatAck(targetFingerprint, payload);
    }
    if (peerTransport) {
      const ackBytes = new TextEncoder().encode(
        JSON.stringify({ type: "chat_ack", ...payload }),
      );
      peerTransport.sendData(targetFingerprint, "cm-control", ackBytes);
    }
  }

  function sendReadReceipt(peerFingerprint: string, conversationId: string) {
    const chatStore = useChatStore();
    const list = chatStore.messagesMap[conversationId];
    if (list) {
      for (const msg of list) {
        if (!msg.isOutgoing && msg.deliveryState !== DeliveryState.READ) {
          msg.deliveryState = DeliveryState.READ;
          sendDeliveryAck(
            peerFingerprint,
            msg.id,
            DeliveryState.READ,
            conversationId,
          );
        }
      }
    }
  }

  function handleIncomingMeshPayload(rawText: string, fallbackSender: string) {
    try {
      const msg = JSON.parse(rawText) as Record<string, unknown>;
      const senderFp = (msg.senderFingerprint as string) || fallbackSender;
      const msgId = (msg.id as string) || `m_${Date.now()}`;
      const targetConvId = (msg.conversationId as string) || `conv-${senderFp}`;
      const chatStore = useChatStore();
      chatStore.appendMessage({
        id: msgId,
        conversationId: targetConvId,
        senderFingerprint: senderFp,
        recipientFingerprint: msg.recipientFingerprint as string | undefined,
        content: (msg.content as string) || "",
        contentType: (msg.contentType as MessageType) || MessageType.TEXT,
        timestamp: (msg.timestamp as number) || Date.now(),
        deliveryState: DeliveryState.DELIVERED,
        isOutgoing: false,
      });
      nativeService.hapticFeedback();
      nativeService.notifyMessage(
        `CampusMesh Air-Gapped (${senderFp.slice(0, 8)})`,
        (msg.content as string) || "Air-Gapped Mesh message",
        targetConvId,
      );
      sendDeliveryAck(senderFp, msgId, DeliveryState.DELIVERED, targetConvId);
    } catch {
      // Ignore unparseable raw frame
    }
  }

  async function startAirGappedMesh(localFingerprint: string, displayName: string) {
    isAirGappedMeshActive.value = true;
    await startLanDiscovery(localFingerprint, displayName);

    if (nativeService.isAndroid) {
      // 1. Wi-Fi Direct
      await nativeService.startWifiDirectDiscovery(
        (peers) => {
          wifiDirectPeers.value = peers;
        },
        (msg, remoteAddress) => {
          handleIncomingMeshPayload(msg, `wfd_${remoteAddress.slice(0, 6)}`);
        },
      );

      // 2. BLE Mesh
      await nativeService.startBleMesh(
        localFingerprint,
        displayName,
        (peer) => {
          blePeers.value = {
            ...blePeers.value,
            [peer.deviceAddress]: peer,
          };
        },
        (msg, senderAddress) => {
          handleIncomingMeshPayload(msg, `ble_${senderAddress.slice(0, 6)}`);
        },
      );
    }
  }

  async function stopAirGappedMesh() {
    isAirGappedMeshActive.value = false;
    await stopLanDiscovery();
    if (nativeService.isAndroid) {
      await nativeService.stopWifiDirectDiscovery();
      await nativeService.stopBleMesh();
    }
  }

  async function connectWifiDirect(deviceAddress: string) {
    if (nativeService.isAndroid) {
      await nativeService.connectWifiDirect(deviceAddress);
    }
  }

  async function sendBleDirect(deviceAddress: string, message: string) {
    if (nativeService.isAndroid) {
      await nativeService.sendBleMessage(deviceAddress, message);
    }
  }

  return {
    isOnline,
    signalingState,
    peerState,
    isDirectLan,
    isAirGappedMeshActive,
    isQuotaAlertDismissed,
    activeRoomId,
    lanPeers,
    wifiDirectPeers,
    blePeers,
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
    startLanDiscovery,
    stopLanDiscovery,
    startAirGappedMesh,
    stopAirGappedMesh,
    connectWifiDirect,
    sendBleDirect,
    sendDeliveryAck,
    sendReadReceipt,
  };
});
