<script setup lang="ts">
import {
  PhoneOff,
  Mic,
  MicOff,
  Video,
  VideoOff,
  ShieldCheck,
} from "lucide-vue-next";
import { Avatar, Button, Badge } from "@campusmesh/ui";
import { useCallStore } from "../stores/call";
import { CallState } from "@campusmesh/messaging";

const callStore = useCallStore();
</script>

<template>
  <div
    v-if="callStore.isCallActive"
    class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200"
  >
    <div
      class="bg-surface border border-border rounded-3xl w-full max-w-md p-6 shadow-2xl flex flex-col items-center gap-6 text-textPrimary relative"
    >
      <!-- E2EE Pill -->
      <Badge variant="success" class="text-[10px] gap-1 px-2 py-0.5">
        <ShieldCheck class="h-3 w-3" />
        Direct P2P E2EE Call
      </Badge>

      <!-- Video / Avatar Display -->
      <div
        class="relative flex flex-col items-center justify-center w-40 h-40 rounded-full bg-background border-2 border-primary/20 shadow-inner"
      >
        <Avatar :name="callStore.peerName" size="xl" class="h-28 w-28 text-2xl" />
        <div
          v-if="callStore.callState === CallState.CONNECTED"
          class="absolute bottom-1 right-2 h-4 w-4 rounded-full bg-emerald-500 border-2 border-surface animate-pulse"
        ></div>
      </div>

      <!-- Peer Info & Status -->
      <div class="text-center">
        <h3 class="text-lg font-bold text-textPrimary">
          {{ callStore.peerName }}
        </h3>
        <p class="font-mono text-xs text-textMuted mt-0.5">
          {{
            callStore.callState === CallState.OUTGOING_RINGING
              ? "Ringing peer directly..."
              : `Connected • ${callStore.formattedDuration}`
          }}
        </p>
      </div>

      <!-- Call Controls -->
      <div class="flex items-center gap-4 mt-2">
        <!-- Audio Mute -->
        <Button
          :variant="callStore.isAudioMuted ? 'destructive' : 'outline'"
          size="iconSm"
          class="h-12 w-12 rounded-full"
          :title="callStore.isAudioMuted ? 'Unmute Audio' : 'Mute Audio'"
          @click="callStore.toggleAudio()"
        >
          <MicOff v-if="callStore.isAudioMuted" class="h-5 w-5" />
          <Mic v-else class="h-5 w-5" />
        </Button>

        <!-- Video Mute (If video call) -->
        <Button
          v-if="callStore.callType === 'VIDEO'"
          :variant="callStore.isVideoMuted ? 'destructive' : 'outline'"
          size="iconSm"
          class="h-12 w-12 rounded-full"
          :title="callStore.isVideoMuted ? 'Enable Camera' : 'Disable Camera'"
          @click="callStore.toggleVideo()"
        >
          <VideoOff v-if="callStore.isVideoMuted" class="h-5 w-5" />
          <Video v-else class="h-5 w-5" />
        </Button>

        <!-- End Call Button -->
        <Button
          variant="destructive"
          size="iconSm"
          class="h-14 w-14 rounded-full bg-red-600 hover:bg-red-700 shadow-lg shadow-red-600/30"
          title="End Call"
          @click="callStore.endCall()"
        >
          <PhoneOff class="h-6 w-6 text-white" />
        </Button>
      </div>
    </div>
  </div>
</template>

