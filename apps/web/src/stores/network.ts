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
import { useCallStore } from "./call";
import { useContactsStore } from "./contacts";
import { useIdentityStore } from "./identity";
import type { CallSignal } from "@campusmesh/messaging";
import {
  nativeService,
  type LanPeer,
  type WifiDirectPeer,
  type BlePeer,
} from "../services/native";
import {
  SignalingClient,
  WebRtcPeerTransport,
  DesktopIpcSwarmAdapter,
  WebRtcSwarmGatewayAdapter,
  deriveTopicHex,
  uint8ToBase64,
  base64ToUint8,
  type SwarmPeerInfo,
  type SwarmGatewayControlPacket,
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
  const swarmStatus = ref<"offline" | "starting" | "online" | "unavailable">(
    "offline",
  );
  const swarmPublicKey = ref<string | null>(null);
  const swarmError = ref<string | null>(null);
  const swarmPeers = ref<Record<string, SwarmPeerInfo>>({});
  const gatewayPeerFingerprint = ref<string | null>(null);
  const autobaseGroupKeys = ref<Record<string, string>>({});
  let lanInterval: ReturnType<typeof setInterval> | null = null;
  let swarmListenersInitialized = false;

  let signalingClient: SignalingClient | null = null;
  let peerTransport: WebRtcPeerTransport | null = null;
  let desktopSwarmAdapter: DesktopIpcSwarmAdapter | null = null;
  let gatewaySwarmAdapter: WebRtcSwarmGatewayAdapter | null = null;
  const gatewayClientTopics = new Map<string, Set<string>>(); // gatewayClientPeerFp -> topics
  const gatewayClientAutobases = new Map<string, Set<string>>(); // groupId -> gateway client peerFps

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

  function resolvePeerDisplayName(
    peerFp: string,
    payloadName?: string,
  ): string {
    const cleanPayload = payloadName?.trim();
    try {
      const contactsStore = useContactsStore();
      const contact = contactsStore.contacts.find(
        (c) => c.fingerprint === peerFp,
      );
      if (contact?.displayName && !contact.displayName.startsWith("Peer ")) {
        return contact.displayName;
      }
    } catch {
      // Ignore store init order
    }
    if (cleanPayload && !cleanPayload.startsWith("Peer ")) {
      return cleanPayload;
    }
    try {
      const chatStore = useChatStore();
      const conv = chatStore.conversations.find(
        (c) => c.peerFingerprint === peerFp,
      );
      if (conv?.name && !conv.name.startsWith("Peer ")) {
        return conv.name;
      }
    } catch {
      // Ignore
    }
    return `Peer ${peerFp.slice(0, 8)}`;
  }

  function handleIncomingCallSignalFrame(senderFp: string, data: unknown) {
    try {
      const signal = (
        typeof data === "string" ? JSON.parse(data) : data
      ) as CallSignal;
      if (!signal || !signal.type || !signal.callId) return;
      const callerName = resolvePeerDisplayName(
        senderFp,
        signal.callerDisplayName,
      );
      const callStore = useCallStore();
      void callStore.receiveSignal(signal, callerName);
      if (signal.type === "call_offer") {
        void nativeService.hapticFeedback();
        void nativeService.notifyIncomingCall(
          callerName,
          signal.callType,
          signal.callId,
          `conv-${senderFp}`,
        );
      }
    } catch (err) {
      console.warn("Failed processing call signal:", err);
    }
  }

  function resolveIncomingConversationId(
    rawConvId: unknown,
    senderFp: string,
  ): string {
    if (
      typeof rawConvId === "string" &&
      (rawConvId.startsWith("grp-") || rawConvId === "conv_general")
    ) {
      return rawConvId;
    }
    return `conv-${senderFp}`;
  }

  function ingestIncomingChatPayload(
    msg: Record<string, unknown>,
    fallbackSenderFp: string,
    opts: { sendAck?: boolean; notify?: boolean } = {},
  ) {
    const senderFp = (msg.senderFingerprint as string) || fallbackSenderFp;
    if (!senderFp) return;

    // Ignore loopback echoes of our own identity in broadcasts/Autobase
    try {
      const myFp = useIdentityStore().identity?.fingerprint;
      if (myFp && senderFp === myFp && msg.isEcho !== false) {
        return;
      }
    } catch {
      // Ignore
    }

    const explicitAlias = (msg.senderDisplayName as string) || "";
    const senderName = resolvePeerDisplayName(senderFp, explicitAlias);
    const msgId = (msg.id as string) || `m_${Date.now()}`;
    const convId = resolveIncomingConversationId(msg.conversationId, senderFp);

    const groupMeta =
      typeof msg.groupName === "string" || typeof msg.autobaseKey === "string"
        ? {
            ...(typeof msg.groupName === "string"
              ? { groupName: msg.groupName }
              : {}),
            ...(typeof msg.autobaseKey === "string"
              ? { autobaseKey: msg.autobaseKey }
              : {}),
          }
        : undefined;

    if (typeof msg.autobaseKey === "string" && convId.startsWith("grp-")) {
      autobaseGroupKeys.value[convId] = msg.autobaseKey;
      if (nativeService.isTauri && swarmStatus.value === "online") {
        void openAutobaseGroup(convId, msg.autobaseKey);
      }
    }

    const chatStore = useChatStore();
    void chatStore.appendMessage(
      {
        id: msgId,
        conversationId: convId,
        senderFingerprint: senderFp,
        recipientFingerprint: msg.recipientFingerprint as string | undefined,
        content: (msg.content as string) || "",
        contentType: (msg.contentType as MessageType) || MessageType.TEXT,
        timestamp: (msg.timestamp as number) || Date.now(),
        deliveryState: DeliveryState.DELIVERED,
        isOutgoing: false,
      },
      explicitAlias || senderName,
      groupMeta,
    );

    if (opts.notify !== false) {
      void nativeService.hapticFeedback();
      void nativeService.notifyMessage(
        typeof msg.groupName === "string"
          ? `${msg.groupName} (${senderName})`
          : senderName,
        (msg.content as string) || "Encrypted message",
        convId,
      );
    }

    if (opts.sendAck !== false && !convId.startsWith("grp-")) {
      sendDeliveryAck(senderFp, msgId, DeliveryState.DELIVERED, convId);
    }
  }

  function sendControlToPeer(
    targetFp: string,
    packet: SwarmGatewayControlPacket,
  ): boolean {
    if (!peerTransport) return false;
    const bytes = new TextEncoder().encode(JSON.stringify(packet));
    return peerTransport.sendData(targetFp, "cm-control", bytes);
  }

  function ensureGatewayAdapter() {
    if (!gatewaySwarmAdapter) {
      gatewaySwarmAdapter = new WebRtcSwarmGatewayAdapter({
        sendControlPacket: (target, pkt) => sendControlToPeer(target, pkt),
        getConnectedPeers: () => peerTransport?.getActivePeers() ?? [],
      });
      gatewaySwarmAdapter.on("peer-joined", (peer) => {
        if (peer.isGateway) {
          gatewayPeerFingerprint.value = peer.peerId;
        }
        swarmPeers.value = {
          ...swarmPeers.value,
          [peer.peerId]: peer,
        };
      });
      gatewaySwarmAdapter.on("data", (fromPeerId, bytes) => {
        try {
          const text = new TextDecoder().decode(bytes);
          const msg = JSON.parse(text) as Record<string, unknown>;
          ingestIncomingChatPayload(msg, fromPeerId);
        } catch {
          // Ignore malformed swarm frame
        }
      });
    }
    return gatewaySwarmAdapter;
  }

  function handleGatewayServerPacket(
    clientPeerFp: string,
    packet: SwarmGatewayControlPacket,
  ) {
    if (!nativeService.isTauri) return;

    if (packet.type === "swarm_join" && packet.topicHex) {
      let set = gatewayClientTopics.get(clientPeerFp);
      if (!set) {
        set = new Set();
        gatewayClientTopics.set(clientPeerFp, set);
      }
      set.add(packet.topicHex);
      void nativeService.sendSwarmCommand("join_topic", {
        topicHex: packet.topicHex,
      });
    } else if (packet.type === "swarm_leave" && packet.topicHex) {
      gatewayClientTopics.get(clientPeerFp)?.delete(packet.topicHex);
    } else if (
      packet.type === "swarm_publish" &&
      packet.topicHex &&
      typeof packet.payload === "string"
    ) {
      void nativeService.sendSwarmCommand("broadcast_topic", {
        topicHex: packet.topicHex,
        payloadBase64: packet.payload,
      });
    } else if (packet.type === "autobase_open" && packet.groupId) {
      let clients = gatewayClientAutobases.get(packet.groupId);
      if (!clients) {
        clients = new Set();
        gatewayClientAutobases.set(packet.groupId, clients);
      }
      clients.add(clientPeerFp);
      void openAutobaseGroup(packet.groupId, packet.bootstrapKeyHex).then(
        async (res) => {
          const hist = await nativeService.sendSwarmCommand<{
            entries?: Array<Record<string, unknown>>;
          }>("autobase_history", { groupId: packet.groupId, limit: 50 });
          if (hist?.entries) {
            for (const entry of hist.entries) {
              sendControlToPeer(clientPeerFp, {
                type: "autobase_entry",
                groupId: packet.groupId,
                payload: entry,
              });
            }
          }
          if (res?.autobaseKey) {
            sendControlToPeer(clientPeerFp, {
              type: "swarm_gateway_hello",
              swarmPublicKey: res.autobaseKey,
              groupId: packet.groupId,
            });
          }
        },
      );
    } else if (
      packet.type === "autobase_append" &&
      packet.groupId &&
      packet.payload
    ) {
      void nativeService.sendSwarmCommand("autobase_append", {
        groupId: packet.groupId,
        entry: packet.payload,
      });
    }
  }

  function initTransport() {
    if (typeof RTCPeerConnection === "undefined") return;
    ensureGatewayAdapter();

    if (!peerTransport) {
      peerTransport = new WebRtcPeerTransport();
      peerTransport.onStateChange = (_fp, state) => {
        peerState.value = state;
      };
      peerTransport.onControlChannelOpen = (peerFp) => {
        // Advertise Desktop Hybrid Gateway if running Holepunch sidecar
        if (nativeService.isTauri && swarmStatus.value === "online") {
          let myFp = "";
          try {
            myFp = useIdentityStore().identity?.fingerprint || "";
          } catch {
            // Ignore
          }
          sendControlToPeer(peerFp, {
            type: "swarm_gateway_hello",
            gatewayFingerprint: myFp,
            swarmPublicKey: swarmPublicKey.value || undefined,
          });
        }
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
            const packet = JSON.parse(text) as Record<string, unknown>;
            if (
              packet.type === "chat_ack" &&
              packet.messageId &&
              packet.deliveryState
            ) {
              const chatStore = useChatStore();
              const convId =
                (packet.conversationId as string) || `conv-${peerFp}`;
              chatStore.updateMessageDelivery(
                convId,
                packet.messageId as string,
                packet.deliveryState as DeliveryState,
              );
            } else if (packet.type === "call_signal" && packet.signal) {
              handleIncomingCallSignalFrame(peerFp, packet.signal);
            } else if (
              packet.type === "swarm_gateway_hello" ||
              packet.type === "swarm_deliver"
            ) {
              ensureGatewayAdapter().handleControlPacket(
                peerFp,
                packet as unknown as SwarmGatewayControlPacket,
              );
            } else if (
              packet.type === "autobase_entry" &&
              packet.payload &&
              typeof packet.payload === "object"
            ) {
              ingestIncomingChatPayload(
                packet.payload as Record<string, unknown>,
                peerFp,
                { sendAck: false },
              );
            } else if (
              typeof packet.type === "string" &&
              (packet.type.startsWith("swarm_") ||
                packet.type.startsWith("autobase_"))
            ) {
              handleGatewayServerPacket(
                peerFp,
                packet as unknown as SwarmGatewayControlPacket,
              );
            }
          } catch {
            // Ignore malformed control packet
          }
        }

        if (channel === "cm-messages") {
          try {
            const text = new TextDecoder().decode(data);
            const msg = JSON.parse(text) as Record<string, unknown>;
            ingestIncomingChatPayload(msg, peerFp);
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
              ? (JSON.parse(data) as Record<string, unknown>)
              : (data as Record<string, unknown>);
          ingestIncomingChatPayload(msg, _senderFp);
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
            const convId =
              (ack.conversationId as string) || `conv-${_senderFp}`;
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
        for (const rec of records) {
          try {
            const r = rec as { envelope?: string; senderFingerprint?: string };
            if (!r.envelope) continue;
            const msg = JSON.parse(r.envelope) as Record<string, unknown>;
            // Skip ephemeral call/control payloads if any accidentally hit mailbox
            if (
              typeof msg.type === "string" &&
              (msg.type.startsWith("call_") ||
                msg.type === "chat_ack" ||
                msg.type === "offer" ||
                msg.type === "answer" ||
                msg.type === "candidate")
            ) {
              continue;
            }
            if (!msg.content && !msg.contentType) continue;
            ingestIncomingChatPayload(msg, r.senderFingerprint || "peer", {
              notify: false,
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

      // Wire WebRTC Voice & Video Call Signaling Engine
      const callStore = useCallStore();
      callStore.setSignalDispatcher((signal) => {
        if (
          signalingClient &&
          signalingState.value === SignalingState.CONNECTED
        ) {
          signalingClient.sendCallSignal(signal.recipientFingerprint, signal);
        } else if (peerTransport) {
          const bytes = new TextEncoder().encode(
            JSON.stringify({ type: "call_signal", signal }),
          );
          peerTransport.sendData(
            signal.recipientFingerprint,
            "cm-control",
            bytes,
          );
        }
      });

      signalingClient.onCallSignal = (senderFp, data) => {
        handleIncomingCallSignalFrame(senderFp, data);
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
    const callStore = useCallStore();
    callStore.setLocalFingerprint(localFingerprint);
    try {
      const identityStore = useIdentityStore();
      if (identityStore.identity?.displayName) {
        callStore.setLocalDisplayName(identityStore.identity.displayName);
      }
    } catch {
      // Ignore if store uninitialized
    }
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
    senderDisplayName?: string,
  ): StoredMessage {
    let resolvedAlias = senderDisplayName?.trim();
    if (!resolvedAlias) {
      try {
        resolvedAlias = useIdentityStore().identity?.displayName?.trim();
      } catch {
        // Ignore if identity store uninitialized
      }
    }

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
      senderDisplayName: resolvedAlias || undefined,
      recipientFingerprint,
    };

    const jsonStr = JSON.stringify(payload);
    let delivered = false;
    const bytes = new TextEncoder().encode(jsonStr);
    if (peerTransport) {
      delivered = peerTransport.sendData(
        recipientFingerprint,
        "cm-messages",
        bytes,
      );
    }

    // Direct LAN TCP socket delivery (<5ms zero-cloud) if peer discovered on local Wi-Fi
    const lanPeer = lanPeers.value[recipientFingerprint];
    if (lanPeer?.ip && lanPeer.port > 0) {
      void nativeService
        .sendLanDirect(lanPeer.ip, lanPeer.port, jsonStr)
        .then((ok) => {
          if (ok) {
            setDirectLan(true);
          }
        });
    }

    // Holepunch Hyperswarm Direct/Topic delivery (Desktop .exe native or via Hybrid Gateway)
    const encodedBase64 = uint8ToBase64(bytes);
    if (desktopSwarmAdapter && swarmStatus.value === "online") {
      void desktopSwarmAdapter
        .sendDirect(recipientFingerprint, bytes)
        .catch(() => {});
      void deriveTopicHex("cm:peer", recipientFingerprint).then((topicHex) => {
        void desktopSwarmAdapter?.broadcast(topicHex, bytes).catch(() => {});
      });
    } else if (gatewaySwarmAdapter?.getGatewayPeer()) {
      void deriveTopicHex("cm:peer", recipientFingerprint).then((topicHex) => {
        sendControlToPeer(gatewaySwarmAdapter!.getGatewayPeer()!, {
          type: "swarm_publish",
          topicHex,
          payload: encodedBase64,
        });
      });
    }

    // Also transmit via signaling gateway to guarantee delivery over 4G/5G mobile carrier NAT
    if (signalingClient && signalingState.value === SignalingState.CONNECTED) {
      signalingClient.sendChatMessage(recipientFingerprint, payload);
    }

    // Also transmit via Air-Gapped Wi-Fi Direct if active
    if (nativeService.isAndroid && isAirGappedMeshActive.value) {
      nativeService.sendWifiDirectMessage(jsonStr).catch(() => {});
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
    void chatStore.appendMessage(storedMsg);
    return storedMsg;
  }

  async function sendGroupMessage(
    conversationId: string,
    groupName: string,
    memberFingerprints: string[],
    text: string,
    localFingerprint: string,
    senderDisplayName?: string,
    autobaseKey?: string,
  ): Promise<StoredMessage> {
    let resolvedAlias = senderDisplayName?.trim();
    if (!resolvedAlias) {
      try {
        resolvedAlias = useIdentityStore().identity?.displayName?.trim();
      } catch {
        // Ignore
      }
    }

    const messageId = `m_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const timestamp = Date.now();
    const resolvedAutobaseKey =
      autobaseKey || autobaseGroupKeys.value[conversationId];

    const payload: Record<string, unknown> = {
      id: messageId,
      conversationId,
      groupName,
      content: text,
      contentType: MessageType.TEXT,
      timestamp,
      senderFingerprint: localFingerprint,
      senderDisplayName: resolvedAlias || undefined,
      isEcho: true,
      ...(resolvedAutobaseKey ? { autobaseKey: resolvedAutobaseKey } : {}),
    };

    const jsonStr = JSON.stringify(payload);
    const bytes = new TextEncoder().encode(jsonStr);

    // 1. Replicate into Holepunch Autobase Log if open (50+ peer scalable gossip)
    if (nativeService.isTauri && swarmStatus.value === "online") {
      try {
        if (!autobaseGroupKeys.value[conversationId]) {
          await openAutobaseGroup(conversationId, resolvedAutobaseKey);
        }
        await nativeService.sendSwarmCommand("autobase_append", {
          groupId: conversationId,
          entry: payload,
        });
      } catch {
        // Fall through to topic broadcast
      }
      const topicHex = await deriveTopicHex("cm:group", conversationId);
      await desktopSwarmAdapter?.joinSwarm(topicHex).catch(() => {});
      await desktopSwarmAdapter?.broadcast(topicHex, bytes).catch(() => {});
    } else if (gatewaySwarmAdapter?.getGatewayPeer()) {
      const gwPeer = gatewaySwarmAdapter.getGatewayPeer()!;
      sendControlToPeer(gwPeer, {
        type: "autobase_append",
        groupId: conversationId,
        payload,
      });
      const topicHex = await deriveTopicHex("cm:group", conversationId);
      await gatewaySwarmAdapter.broadcast(topicHex, bytes);
    }

    // 2. Parallel direct fan-out over WebRTC, LAN TCP & Signaling for online group members
    for (const memberFp of memberFingerprints) {
      if (!memberFp || memberFp === localFingerprint) continue;
      if (peerTransport) {
        peerTransport.sendData(memberFp, "cm-messages", bytes);
      }
      const lp = lanPeers.value[memberFp];
      if (lp?.ip && lp.port > 0) {
        void nativeService.sendLanDirect(lp.ip, lp.port, jsonStr);
      }
      if (
        signalingClient &&
        signalingState.value === SignalingState.CONNECTED
      ) {
        signalingClient.sendChatMessage(memberFp, payload);
      }
    }

    const storedMsg: StoredMessage = {
      id: messageId,
      conversationId,
      senderFingerprint: localFingerprint,
      content: text,
      contentType: MessageType.TEXT,
      timestamp,
      deliveryState: DeliveryState.SENT,
      isOutgoing: true,
    };

    const chatStore = useChatStore();
    void chatStore.appendMessage(storedMsg, undefined, {
      groupName,
      ...(resolvedAutobaseKey ? { autobaseKey: resolvedAutobaseKey } : {}),
    });
    return storedMsg;
  }

  async function startLanDiscovery(
    localFingerprint: string,
    displayName: string,
  ) {
    if (!nativeService.isNative) return;

    await nativeService.startLanDiscovery(
      localFingerprint,
      (peer) => {
        lanPeers.value = {
          ...lanPeers.value,
          [peer.fingerprint]: peer,
        };
      },
      (payload, remoteIp) => {
        setDirectLan(true);
        handleIncomingMeshPayload(payload, `lan_${remoteIp}`);
      },
    );

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

  async function openAutobaseGroup(
    groupId: string,
    bootstrapKeyHex?: string,
  ): Promise<{ autobaseKey?: string; discoveryKey?: string } | null> {
    if (nativeService.isTauri && swarmStatus.value === "online") {
      try {
        const res = await nativeService.sendSwarmCommand<{
          autobaseKey?: string;
          discoveryKey?: string;
        }>("autobase_open", {
          groupId,
          ...(bootstrapKeyHex ? { bootstrapKeyHex } : {}),
        });
        if (res?.autobaseKey) {
          autobaseGroupKeys.value = {
            ...autobaseGroupKeys.value,
            [groupId]: res.autobaseKey,
          };
        }
        const hist = await nativeService.sendSwarmCommand<{
          entries?: Array<Record<string, unknown>>;
        }>("autobase_history", { groupId, limit: 100 });
        if (hist?.entries) {
          for (const entry of hist.entries) {
            ingestIncomingChatPayload(entry, "autobase", { notify: false });
          }
        }
        return res;
      } catch (err) {
        console.warn("[Swarm] Failed opening Autobase group:", err);
      }
    } else if (gatewaySwarmAdapter?.getGatewayPeer()) {
      sendControlToPeer(gatewaySwarmAdapter.getGatewayPeer()!, {
        type: "autobase_open",
        groupId,
        ...(bootstrapKeyHex ? { bootstrapKeyHex } : {}),
      });
    }
    return null;
  }

  async function startHolepunchSwarm(
    localFingerprint: string,
    displayName: string,
  ): Promise<void> {
    if (!nativeService.isTauri) return;
    if (swarmStatus.value === "online" || swarmStatus.value === "starting") {
      return;
    }

    swarmStatus.value = "starting";
    swarmError.value = null;

    if (!swarmListenersInitialized) {
      swarmListenersInitialized = true;

      await nativeService.onSwarmEvent("swarm-status", (evt) => {
        if (typeof evt.swarmPublicKey === "string") {
          swarmPublicKey.value = evt.swarmPublicKey;
        }
        if (evt.status === "online") {
          swarmStatus.value = "online";
        }
      });

      await nativeService.onSwarmEvent("swarm-peer-joined", (evt) => {
        const peerId = String(evt.peerId || evt.swarmPublicKey || "");
        if (!peerId) return;
        const info: SwarmPeerInfo = {
          peerId,
          discoveryKey: String(evt.discoveryKey || ""),
          connectionType: "direct-utp",
          ...(typeof evt.displayName === "string"
            ? { displayName: evt.displayName }
            : {}),
        };
        swarmPeers.value = {
          ...swarmPeers.value,
          [peerId]: info,
        };
        desktopSwarmAdapter?.emitPeerJoined(info);
      });

      await nativeService.onSwarmEvent("swarm-peer-left", (evt) => {
        const peerId = String(evt.peerId || "");
        if (!peerId) return;
        const copy = { ...swarmPeers.value };
        delete copy[peerId];
        swarmPeers.value = copy;
        desktopSwarmAdapter?.emitPeerLeft(peerId);
      });

      await nativeService.onSwarmEvent("swarm-data", (evt) => {
        const peerId = String(evt.peerId || "swarm");
        const b64 = evt.payloadBase64;
        if (typeof b64 !== "string") return;
        const bytes = base64ToUint8(b64);
        desktopSwarmAdapter?.emitData(peerId, bytes);
        try {
          const parsed = JSON.parse(new TextDecoder().decode(bytes)) as Record<
            string,
            unknown
          >;
          ingestIncomingChatPayload(parsed, peerId);
        } catch {
          // Non-JSON raw payload
        }
        // Bridge to any Web/APK Hybrid Gateway clients subscribed to this topic
        const topicHex =
          typeof evt.topicHex === "string" ? evt.topicHex : undefined;
        if (topicHex) {
          for (const [clientFp, set] of gatewayClientTopics.entries()) {
            if (set.has(topicHex)) {
              sendControlToPeer(clientFp, {
                type: "swarm_deliver",
                topicHex,
                senderFingerprint: peerId,
                payload: b64,
              });
            }
          }
        }
      });

      await nativeService.onSwarmEvent("autobase-entry", (evt) => {
        const entry = evt.entry as Record<string, unknown> | undefined;
        const groupId = typeof evt.groupId === "string" ? evt.groupId : "";
        if (entry) {
          ingestIncomingChatPayload(entry, "autobase");
          if (groupId) {
            const clients = gatewayClientAutobases.get(groupId);
            if (clients) {
              for (const clientFp of clients) {
                sendControlToPeer(clientFp, {
                  type: "autobase_entry",
                  groupId,
                  payload: entry,
                });
              }
            }
          }
        }
      });
    }

    const snap = await nativeService.startHolepunchSwarm();
    if (!snap || !snap.available || !snap.running) {
      swarmStatus.value = "unavailable";
      swarmError.value =
        snap?.last_error ||
        "Holepunch Bare runtime is only bundled in full NSIS Desktop builds.";
      return;
    }

    try {
      const initRes = await nativeService.sendSwarmCommand<{
        status?: string;
        swarmPublicKey?: string;
      }>("init", { localFingerprint, displayName });

      if (initRes?.swarmPublicKey) {
        swarmPublicKey.value = initRes.swarmPublicKey;
      }
      swarmStatus.value = "online";

      desktopSwarmAdapter = new DesktopIpcSwarmAdapter({
        joinSwarm: async (topicHex) => {
          await nativeService.sendSwarmCommand("join_topic", { topicHex });
        },
        leaveSwarm: async (topicHex) => {
          await nativeService.sendSwarmCommand("leave_topic", { topicHex });
        },
        broadcast: async (topicHex, payloadBase64) => {
          await nativeService.sendSwarmCommand("broadcast_topic", {
            topicHex,
            payloadBase64,
          });
        },
        sendDirect: async (peerId, payloadBase64) => {
          await nativeService.sendSwarmCommand("send_direct", {
            peerId,
            payloadBase64,
          });
        },
        destroy: async () => {
          await nativeService.stopHolepunchSwarm();
        },
      });

      // Join direct inbox topic + campus discovery topic + existing Autobase groups
      const selfTopic = await deriveTopicHex("cm:peer", localFingerprint);
      const campusTopic = await deriveTopicHex("cm:campus", "global");
      await desktopSwarmAdapter.joinSwarm(selfTopic);
      await desktopSwarmAdapter.joinSwarm(campusTopic);

      // Re-open any existing Swarm groups in Autobase Corestore
      try {
        const contactsStore = useContactsStore();
        for (const g of contactsStore.groups) {
          if (g.mode === "autobase-swarm") {
            await openAutobaseGroup(g.id, g.autobaseKey);
          }
        }
      } catch {
        // Ignore if groups not hydrated yet
      }

      // Notify already-connected WebRTC peers that this desktop node is an active Hybrid Gateway
      if (peerTransport) {
        for (const peerFp of peerTransport.getActivePeers()) {
          sendControlToPeer(peerFp, {
            type: "swarm_gateway_hello",
            gatewayFingerprint: localFingerprint,
            swarmPublicKey: swarmPublicKey.value || undefined,
          });
        }
      }
    } catch (err) {
      swarmStatus.value = "unavailable";
      swarmError.value = err instanceof Error ? err.message : String(err);
    }
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
      ingestIncomingChatPayload(msg, fallbackSender);
    } catch {
      // Ignore unparseable raw frame
    }
  }

  async function startAirGappedMesh(
    localFingerprint: string,
    displayName: string,
  ) {
    isAirGappedMeshActive.value = true;
    await startLanDiscovery(localFingerprint, displayName);

    if (nativeService.isTauri) {
      void startHolepunchSwarm(localFingerprint, displayName);
    }

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
    if (nativeService.isTauri) {
      await nativeService.stopHolepunchSwarm();
      swarmStatus.value = "offline";
    }
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
    swarmStatus,
    swarmPublicKey,
    swarmError,
    swarmPeers,
    gatewayPeerFingerprint,
    autobaseGroupKeys,
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
    sendGroupMessage,
    startHolepunchSwarm,
    openAutobaseGroup,
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
