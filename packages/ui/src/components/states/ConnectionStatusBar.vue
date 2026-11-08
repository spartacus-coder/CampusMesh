<script setup lang="ts">
import { computed } from "vue";
import { SignalingState, PeerConnectionState } from "@campusmesh/shared-types";
import { Wifi, WifiOff, AlertCircle, RefreshCw } from "lucide-vue-next";

interface Props {
  signalingState: SignalingState;
  peerState?: PeerConnectionState;
  isDirectLan?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  peerState: PeerConnectionState.DISCONNECTED,
  isDirectLan: false,
});

const statusConfig = computed(() => {
  if (props.isDirectLan) {
    return {
      text: "Direct Local LAN Active (Zero Server)",
      color: "bg-accent/10 text-accent border-accent/20",
      icon: Wifi,
      spinning: false,
    };
  }

  if (props.signalingState === SignalingState.UNAVAILABLE_QUOTA) {
    return {
      text: "Signaling Quota Exhausted — Fallback Active",
      color: "bg-warning/10 text-warning border-warning/20",
      icon: AlertCircle,
      spinning: false,
    };
  }

  // 1. Direct WebRTC P2P DataChannel connected
  if (props.peerState === PeerConnectionState.CONNECTED) {
    return {
      text: "Direct P2P Encrypted Channel Connected",
      color: "bg-success/10 text-success border-success/20",
      icon: Wifi,
      spinning: false,
    };
  }

  // 2. Encrypted Cloud Signaling Relay is live: user CAN message immediately!
  if (props.signalingState === SignalingState.CONNECTED) {
    if (props.peerState === PeerConnectionState.CONNECTING) {
      return {
        text: "Encrypted Relay Active (P2P Negotiating...)",
        color: "bg-primary/10 text-primary border-primary/20",
        icon: Wifi,
        spinning: false,
      };
    }
    return {
      text: "Encrypted Relay Active — Ready to Message",
      color: "bg-success/10 text-success border-success/20",
      icon: Wifi,
      spinning: false,
    };
  }

  // 3. Signaling is actively connecting
  if (props.signalingState === SignalingState.CONNECTING) {
    return {
      text: "Connecting to Encrypted Mesh Network...",
      color: "bg-primary/10 text-primary border-primary/20",
      icon: RefreshCw,
      spinning: true,
    };
  }

  if (props.peerState === PeerConnectionState.FAILED) {
    return {
      text: "Direct P2P Traversal Failed — Relay Active",
      color: "bg-warning/10 text-warning border-warning/20",
      icon: AlertCircle,
      spinning: false,
    };
  }

  return {
    text: "Offline / Waiting for Connection",
    color: "bg-surface-subtle text-textSecondary border-border",
    icon: WifiOff,
    spinning: false,
  };
});
</script>

<template>
  <div
    class="flex items-center gap-2 border-b px-4 py-1.5 text-xs font-medium transition-all duration-200 select-none"
    :class="statusConfig.color"
  >
    <component
      :is="statusConfig.icon"
      class="h-3.5 w-3.5"
      :class="{ 'animate-spin': statusConfig.spinning }"
    />
    <span class="truncate">{{ statusConfig.text }}</span>
  </div>
</template>
