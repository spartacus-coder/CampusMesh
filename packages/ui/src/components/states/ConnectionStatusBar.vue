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

  if (props.peerState === PeerConnectionState.CONNECTED) {
    return {
      text: "Direct P2P Encrypted Channel Connected",
      color: "bg-success/10 text-success border-success/20",
      icon: Wifi,
      spinning: false,
    };
  }

  if (
    props.peerState === PeerConnectionState.CONNECTING ||
    props.signalingState === SignalingState.CONNECTING
  ) {
    return {
      text: "Establishing WebRTC Connection...",
      color: "bg-primary/10 text-primary border-primary/20",
      icon: RefreshCw,
      spinning: true,
    };
  }

  if (props.peerState === PeerConnectionState.FAILED) {
    return {
      text: "Direct P2P Traversal Failed (Use Token/LAN)",
      color: "bg-destructive/10 text-destructive border-destructive/20",
      icon: AlertCircle,
      spinning: false,
    };
  }

  return {
    text: "Waiting for Peer to Connect",
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
