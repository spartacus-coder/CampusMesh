/**
 * CampusMesh Native Platform Bridge
 * Coordinates between Desktop (Tauri 2 Rust + SQLite), Mobile (Capacitor 8 Android), and Web PWA
 */

import type { StoredMessage } from "@campusmesh/storage";
import {
  MessageType,
  DeliveryState,
  type Conversation,
  type Contact,
} from "@campusmesh/shared-types";

export interface LanPeer {
  fingerprint: string;
  displayName: string;
  ip?: string;
  port: number;
  timestamp: number;
}

export interface WifiDirectPeer {
  deviceAddress: string;
  deviceName: string;
  status: number;
}

export interface BlePeer {
  deviceAddress: string;
  deviceName: string;
  fingerprintHash: string;
  rssi: number;
}

export interface NativeDbConversation {
  id: string;
  name: string;
  peer_fingerprint?: string;
  is_group: boolean;
  last_message_preview?: string;
  last_message_timestamp: number;
  unread_count: number;
  is_pinned: boolean;
  is_archived: boolean;
}

export interface NativeDbContact {
  fingerprint: string;
  display_name: string;
  safety_number?: string;
  is_verified: boolean;
  added_at: number;
}

interface CampusMeshNativePluginApi {
  startForegroundService?: (
    options?: Record<string, unknown>,
  ) => Promise<unknown>;
  stopForegroundService?: (
    options?: Record<string, unknown>,
  ) => Promise<unknown>;
  isServiceRunning?: () => Promise<unknown>;
  showNotification?: (options: {
    title: string;
    body: string;
    conversationId?: string;
  }) => Promise<unknown>;
  triggerHaptic?: () => Promise<unknown>;
  startLanDiscovery?: (options: {
    localFingerprint: string;
  }) => Promise<unknown>;
  stopLanDiscovery?: () => Promise<unknown>;
  broadcastLanBeacon?: (options: {
    fingerprint: string;
    displayName: string;
  }) => Promise<unknown>;
  keystoreEncrypt?: (options: { data: string }) => Promise<{ encrypted: string }>;
  keystoreDecrypt?: (options: { encrypted: string }) => Promise<{ data: string }>;
  isHardwareSecurityAvailable?: () => Promise<{ isHardwareBacked: boolean }>;
  startWifiDirectDiscovery?: () => Promise<unknown>;
  stopWifiDirectDiscovery?: () => Promise<unknown>;
  connectWifiDirect?: (options: { deviceAddress: string }) => Promise<unknown>;
  disconnectWifiDirect?: () => Promise<unknown>;
  sendWifiDirectMessage?: (options: { message: string }) => Promise<unknown>;
  startBleMesh?: (options: {
    fingerprint: string;
    displayName: string;
  }) => Promise<unknown>;
  stopBleMesh?: () => Promise<unknown>;
  sendBleMessage?: (options: {
    deviceAddress: string;
    message: string;
  }) => Promise<unknown>;
  addListener?: (
    eventName: string,
    listenerFunc: (data: never) => void,
  ) => Promise<unknown>;
  [key: string]: unknown;
}

interface CapacitorGlobal {
  isNativePlatform?: () => boolean;
  Plugins?: Record<string, unknown>;
}

function getCampusMeshPlugin(): CampusMeshNativePluginApi | null {
  if (typeof window !== "undefined") {
    const cap = (window as unknown as { Capacitor?: CapacitorGlobal })
      .Capacitor;
    if (cap?.Plugins?.CampusMeshNative) {
      return cap.Plugins.CampusMeshNative as CampusMeshNativePluginApi;
    }
  }
  return null;
}

async function tauriInvoke<T>(
  cmd: string,
  args: Record<string, unknown> = {},
): Promise<T | null> {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    __TAURI_INTERNALS__?: {
      invoke?: (c: string, a: Record<string, unknown>) => Promise<T>;
    };
    __TAURI__?: {
      core?: { invoke?: (c: string, a: Record<string, unknown>) => Promise<T> };
    };
  };

  try {
    if (w.__TAURI_INTERNALS__?.invoke) {
      return await w.__TAURI_INTERNALS__.invoke(cmd, args);
    }
    if (w.__TAURI__?.core?.invoke) {
      return await w.__TAURI__.core.invoke(cmd, args);
    }
  } catch (err) {
    console.warn(`[CampusMesh Native] Tauri invoke '${cmd}' failed:`, err);
  }
  return null;
}

export const nativeService = {
  get isTauri(): boolean {
    return (
      typeof window !== "undefined" &&
      ("__TAURI_INTERNALS__" in window || "__TAURI__" in window)
    );
  },

  get isAndroid(): boolean {
    if (typeof window === "undefined") return false;
    const cap = (window as unknown as { Capacitor?: CapacitorGlobal })
      .Capacitor;
    return Boolean(cap?.isNativePlatform?.());
  },

  get isNative(): boolean {
    return this.isTauri || this.isAndroid;
  },

  async initNativeServices(): Promise<void> {
    // 1. Request Browser / System Notification Permissions
    if (typeof window !== "undefined" && "Notification" in window) {
      if (Notification.permission === "default") {
        try {
          await Notification.requestPermission();
        } catch {
          // Ignore rejection on strict browsers
        }
      }
    }

    // 2. If Android Native, start 24/7 Mesh Foreground Service
    if (this.isAndroid) {
      const nativePlugin = getCampusMeshPlugin();
      if (nativePlugin?.startForegroundService) {
        try {
          await nativePlugin.startForegroundService();
          console.info(
            "[CampusMesh Native] Android MeshForegroundService started successfully.",
          );
        } catch (err) {
          console.warn(
            "[CampusMesh Native] Failed to auto-start Android MeshForegroundService:",
            err,
          );
        }
      }
    }
  },

  async notifyMessage(
    title: string,
    body: string,
    conversationId?: string,
  ): Promise<void> {
    if (typeof document !== "undefined" && document.hasFocus()) {
      return;
    }

    if (this.isAndroid) {
      const nativePlugin = getCampusMeshPlugin();
      if (nativePlugin?.showNotification) {
        try {
          await nativePlugin.showNotification({
            title,
            body,
            conversationId: conversationId || "",
          });
          return;
        } catch (err) {
          console.warn(
            "[CampusMesh Native] Native notification failed, falling back to Web API:",
            err,
          );
        }
      }
    }

    if (
      typeof window !== "undefined" &&
      "Notification" in window &&
      Notification.permission === "granted"
    ) {
      try {
        const notif = new Notification(title, {
          body,
          icon: "/vite.svg",
          tag: conversationId || "campusmesh_msg",
        });
        notif.onclick = () => {
          window.focus();
        };
      } catch (err) {
        console.warn("[CampusMesh Native] Web Notification failed:", err);
      }
    }
  },

  async hapticFeedback(): Promise<void> {
    if (this.isAndroid) {
      const nativePlugin = getCampusMeshPlugin();
      if (nativePlugin?.triggerHaptic) {
        try {
          await nativePlugin.triggerHaptic();
          return;
        } catch {
          // Fall through
        }
      }
    }

    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate(35);
    }
  },

  // === Zero-Server LAN Peer Discovery ===
  async startLanDiscovery(
    localFingerprint: string,
    onPeerDiscovered: (peer: LanPeer) => void,
  ): Promise<void> {
    // A. Desktop (Tauri 2 Rust UDP Multicast)
    if (this.isTauri) {
      await tauriInvoke("lan_start_discovery", {
        localFingerprint,
      });

      const w = window as unknown as {
        __TAURI__?: {
          event?: {
            listen?: (
              event: string,
              handler: (e: { payload: LanPeer }) => void,
            ) => Promise<() => void>;
          };
        };
      };
      if (w.__TAURI__?.event?.listen) {
        await w.__TAURI__.event.listen("lan-peer-discovered", (e) => {
          if (e?.payload) onPeerDiscovered(e.payload);
        });
      }
      return;
    }

    // B. Mobile (Android Native MulticastSocket)
    if (this.isAndroid) {
      const nativePlugin = getCampusMeshPlugin();
      if (nativePlugin?.startLanDiscovery) {
        await nativePlugin.startLanDiscovery({ localFingerprint });
        if (nativePlugin.addListener) {
          await nativePlugin.addListener(
            "lanPeerDiscovered",
            (peer: LanPeer) => {
              if (peer) onPeerDiscovered(peer);
            },
          );
        }
      }
    }
  },

  async broadcastLanBeacon(
    fingerprint: string,
    displayName: string,
  ): Promise<void> {
    if (this.isTauri) {
      await tauriInvoke("lan_broadcast_beacon", {
        beacon: {
          fingerprint,
          display_name: displayName,
          port: 7777,
          timestamp: Date.now(),
        },
      });
      return;
    }

    if (this.isAndroid) {
      const nativePlugin = getCampusMeshPlugin();
      if (nativePlugin?.broadcastLanBeacon) {
        await nativePlugin.broadcastLanBeacon({ fingerprint, displayName });
      }
    }
  },

  async stopLanDiscovery(): Promise<void> {
    if (this.isTauri) {
      await tauriInvoke("lan_stop_discovery");
      return;
    }
    if (this.isAndroid) {
      const nativePlugin = getCampusMeshPlugin();
      if (nativePlugin?.stopLanDiscovery) {
        await nativePlugin.stopLanDiscovery();
      }
    }
  },

  // === Native Desktop SQLite Vault Operations ===
  async saveMessageToNativeDb(msg: StoredMessage): Promise<void> {
    if (this.isTauri) {
      await tauriInvoke("db_save_message", {
        msg: {
          id: msg.id,
          conversation_id: msg.conversationId,
          conversationId: msg.conversationId,
          sender_fingerprint: msg.senderFingerprint,
          senderFingerprint: msg.senderFingerprint,
          recipient_fingerprint: msg.recipientFingerprint || null,
          recipientFingerprint: msg.recipientFingerprint || null,
          content: msg.content,
          content_type: msg.contentType,
          contentType: msg.contentType,
          timestamp: msg.timestamp,
          delivery_state: msg.deliveryState,
          deliveryState: msg.deliveryState,
          is_outgoing: msg.isOutgoing,
          isOutgoing: msg.isOutgoing,
        },
      });
    }
  },

  async getMessagesFromNativeDb(
    conversationId: string,
  ): Promise<StoredMessage[] | null> {
    if (this.isTauri) {
      const raw = await tauriInvoke<Array<Record<string, unknown>>>(
        "db_get_messages",
        { conversationId },
      );

      if (raw && Array.isArray(raw)) {
        return raw.map((r) => {
          const msg: StoredMessage = {
            id: String(r.id),
            conversationId: String(
              r.conversationId || r.conversation_id || conversationId,
            ),
            senderFingerprint: String(
              r.senderFingerprint || r.sender_fingerprint || "",
            ),
            content: String(r.content || ""),
            contentType: (r.contentType ||
              r.content_type ||
              MessageType.TEXT) as MessageType,
            timestamp: Number(r.timestamp || Date.now()),
            deliveryState: (r.deliveryState ||
              r.delivery_state ||
              DeliveryState.DELIVERED) as DeliveryState,
            isOutgoing: Boolean(r.isOutgoing ?? r.is_outgoing),
          };
          const recipFp = r.recipientFingerprint || r.recipient_fingerprint;
          if (recipFp) {
            msg.recipientFingerprint = String(recipFp);
          }
          return msg;
        });
      }
    }
    return null;
  },

  async saveConversationToNativeDb(conv: Conversation): Promise<void> {
    if (this.isTauri) {
      await tauriInvoke("db_save_conversation", {
        conv: {
          id: conv.id,
          name: conv.name,
          peer_fingerprint: conv.peerFingerprint || null,
          peerFingerprint: conv.peerFingerprint || null,
          is_group: !!conv.isGroup,
          isGroup: !!conv.isGroup,
          last_message_preview: conv.lastMessagePreview || null,
          lastMessagePreview: conv.lastMessagePreview || null,
          last_message_timestamp: conv.lastMessageTimestamp || Date.now(),
          lastMessageTimestamp: conv.lastMessageTimestamp || Date.now(),
          unread_count: conv.unreadCount || 0,
          unreadCount: conv.unreadCount || 0,
          is_pinned: !!conv.isPinned,
          isPinned: !!conv.isPinned,
          is_archived: !!conv.isArchived,
          isArchived: !!conv.isArchived,
        },
      });
    }
  },

  async getConversationsFromNativeDb(): Promise<Conversation[] | null> {
    if (this.isTauri) {
      const raw = await tauriInvoke<Array<Record<string, unknown>>>(
        "db_get_conversations",
      );
      if (raw && Array.isArray(raw)) {
        return raw.map((c) => {
          const conv: Conversation = {
            id: String(c.id || ""),
            name: String(c.name || "Chat"),
            isGroup: Boolean(c.isGroup ?? c.is_group),
            lastMessageTimestamp: Number(
              c.lastMessageTimestamp ?? c.last_message_timestamp ?? Date.now(),
            ),
            unreadCount: Number(c.unreadCount ?? c.unread_count ?? 0),
            isPinned: Boolean(c.isPinned ?? c.is_pinned),
            isArchived: Boolean(c.isArchived ?? c.is_archived),
          };
          const peerFp = c.peerFingerprint || c.peer_fingerprint;
          if (peerFp) {
            conv.peerFingerprint = String(peerFp);
          }
          const preview = c.lastMessagePreview || c.last_message_preview;
          if (preview) {
            conv.lastMessagePreview = String(preview);
          }
          return conv;
        });
      }
    }
    return null;
  },

  async saveContactToNativeDb(contact: Contact): Promise<void> {
    if (this.isTauri) {
      await tauriInvoke("db_save_contact", {
        contact: {
          fingerprint: contact.fingerprint,
          display_name: contact.displayName,
          displayName: contact.displayName,
          safety_number: contact.safetyNumber || null,
          safetyNumber: contact.safetyNumber || null,
          is_verified: !!contact.isVerified,
          isVerified: !!contact.isVerified,
          added_at: contact.addedAt || Date.now(),
          addedAt: contact.addedAt || Date.now(),
        },
      });
    }
  },

  async getContactsFromNativeDb(): Promise<Contact[] | null> {
    if (this.isTauri) {
      const raw =
        await tauriInvoke<Array<Record<string, unknown>>>("db_get_contacts");
      if (raw && Array.isArray(raw)) {
        return raw.map((c) => ({
          id: String(c.fingerprint || ""),
          fingerprint: String(c.fingerprint || ""),
          displayName: String(c.displayName || c.display_name || "Contact"),
          safetyNumber: String(c.safetyNumber || c.safety_number || ""),
          isVerified: Boolean(c.isVerified ?? c.is_verified),
          isBlocked: false,
          addedAt: Number(c.addedAt ?? c.added_at ?? Date.now()),
        }));
      }
    }
    return null;
  },

  // === Hardware-Backed Keystore Enclave ===
  async keystoreEncrypt(data: string): Promise<string> {
    if (this.isAndroid) {
      const nativePlugin = getCampusMeshPlugin();
      if (nativePlugin?.keystoreEncrypt) {
        const res = await nativePlugin.keystoreEncrypt({ data });
        return res.encrypted;
      }
    }
    // Web fallback: base64 obfuscation or WebCrypto
    return btoa(unescape(encodeURIComponent(data)));
  },

  async keystoreDecrypt(encrypted: string): Promise<string> {
    if (this.isAndroid) {
      const nativePlugin = getCampusMeshPlugin();
      if (nativePlugin?.keystoreDecrypt) {
        const res = await nativePlugin.keystoreDecrypt({ encrypted });
        return res.data;
      }
    }
    // Web fallback
    return decodeURIComponent(escape(atob(encrypted)));
  },

  async isHardwareSecurityAvailable(): Promise<boolean> {
    if (this.isAndroid) {
      const nativePlugin = getCampusMeshPlugin();
      if (nativePlugin?.isHardwareSecurityAvailable) {
        const res = await nativePlugin.isHardwareSecurityAvailable();
        return res.isHardwareBacked;
      }
    }
    return false;
  },

  // === Air-Gapped Wi-Fi Direct Radio ===
  async startWifiDirectDiscovery(
    onPeers: (peers: WifiDirectPeer[]) => void,
    onMessage?: (message: string, remoteAddress: string) => void,
  ): Promise<void> {
    if (this.isAndroid) {
      const nativePlugin = getCampusMeshPlugin();
      if (nativePlugin?.startWifiDirectDiscovery) {
        await nativePlugin.startWifiDirectDiscovery();
        if (nativePlugin.addListener) {
          await nativePlugin.addListener(
            "wifiDirectPeersDiscovered",
            (data: { peers: WifiDirectPeer[] }) => {
              if (data?.peers) onPeers(data.peers);
            },
          );
          if (onMessage) {
            await nativePlugin.addListener(
              "wifiDirectMessageReceived",
              (data: { message: string; remoteAddress: string }) => {
                if (data?.message) onMessage(data.message, data.remoteAddress);
              },
            );
          }
        }
      }
    }
  },

  async stopWifiDirectDiscovery(): Promise<void> {
    if (this.isAndroid) {
      const nativePlugin = getCampusMeshPlugin();
      if (nativePlugin?.stopWifiDirectDiscovery) {
        await nativePlugin.stopWifiDirectDiscovery();
      }
    }
  },

  async connectWifiDirect(deviceAddress: string): Promise<void> {
    if (this.isAndroid) {
      const nativePlugin = getCampusMeshPlugin();
      if (nativePlugin?.connectWifiDirect) {
        await nativePlugin.connectWifiDirect({ deviceAddress });
      }
    }
  },

  async disconnectWifiDirect(): Promise<void> {
    if (this.isAndroid) {
      const nativePlugin = getCampusMeshPlugin();
      if (nativePlugin?.disconnectWifiDirect) {
        await nativePlugin.disconnectWifiDirect();
      }
    }
  },

  async sendWifiDirectMessage(message: string): Promise<void> {
    if (this.isAndroid) {
      const nativePlugin = getCampusMeshPlugin();
      if (nativePlugin?.sendWifiDirectMessage) {
        await nativePlugin.sendWifiDirectMessage({ message });
      }
    }
  },

  // === Air-Gapped Bluetooth Low Energy (BLE) Mesh ===
  async startBleMesh(
    fingerprint: string,
    displayName: string,
    onPeer: (peer: BlePeer) => void,
    onMessage?: (message: string, senderAddress: string) => void,
  ): Promise<void> {
    if (this.isAndroid) {
      const nativePlugin = getCampusMeshPlugin();
      if (nativePlugin?.startBleMesh) {
        await nativePlugin.startBleMesh({ fingerprint, displayName });
        if (nativePlugin.addListener) {
          await nativePlugin.addListener("blePeerDiscovered", (peer: BlePeer) => {
            if (peer) onPeer(peer);
          });
          if (onMessage) {
            await nativePlugin.addListener(
              "bleMessageReceived",
              (data: { message: string; senderAddress: string }) => {
                if (data?.message) onMessage(data.message, data.senderAddress);
              },
            );
          }
        }
      }
    }
  },

  async stopBleMesh(): Promise<void> {
    if (this.isAndroid) {
      const nativePlugin = getCampusMeshPlugin();
      if (nativePlugin?.stopBleMesh) {
        await nativePlugin.stopBleMesh();
      }
    }
  },

  async sendBleMessage(deviceAddress: string, message: string): Promise<void> {
    if (this.isAndroid) {
      const nativePlugin = getCampusMeshPlugin();
      if (nativePlugin?.sendBleMessage) {
        await nativePlugin.sendBleMessage({ deviceAddress, message });
      }
    }
  },

  // === SimpleX-Style Unidirectional Cryptographic Queue & Safety Number ===
  async simplexDeriveQueueId(
    sender: string,
    recipient: string,
    epoch = 1,
  ): Promise<string> {
    if (this.isTauri) {
      const res = await tauriInvoke<string>("simplex_derive_queue_id", {
        sender,
        recipient,
        epoch,
      });
      if (res) return res;
    }
    const input = `cm:simplex:queue:v1:${sender}:${recipient}:${epoch}`;
    const data = new TextEncoder().encode(input);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer)).slice(0, 16);
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  },

  async simplexDeriveSafetyNumber(
    pubkeyA: string,
    pubkeyB: string,
  ): Promise<string> {
    if (this.isTauri) {
      const res = await tauriInvoke<string>("simplex_derive_safety_number", {
        pubkeyA,
        pubkeyB,
      });
      if (res) return res;
    }
    const sorted = [pubkeyA, pubkeyB].sort();
    const input = `cm:safety:v1:${sorted[0]}:${sorted[1]}`;
    const data = new TextEncoder().encode(input);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const bytes = new Uint8Array(hashBuffer);
    const chunks: string[] = [];
    for (let i = 0; i < 24; i += 4) {
      const view = new DataView(bytes.buffer, bytes.byteOffset + i, 4);
      const num = view.getUint32(0) % 100000;
      chunks.push(num.toString().padStart(5, "0"));
    }
    return chunks.join("-");
  },
};
