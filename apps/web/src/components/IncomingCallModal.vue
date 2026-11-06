<script setup lang="ts">
import { Phone, PhoneOff, Video, ShieldCheck } from "lucide-vue-next";
import { Avatar, Button, Badge } from "@campusmesh/ui";
import { useCallStore } from "../stores/call";
import { CallState } from "@campusmesh/messaging";

const callStore = useCallStore();
</script>

<template>
  <div
    v-if="callStore.callState === CallState.INCOMING_RINGING"
    class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200"
  >
    <div
      class="bg-surface border border-border rounded-3xl w-full max-w-sm p-6 shadow-2xl flex flex-col items-center gap-6 text-textPrimary relative"
    >
      <Badge variant="success" class="text-[10px] gap-1 px-2 py-0.5">
        <ShieldCheck class="h-3 w-3" />
        Encrypted P2P Incoming Call
      </Badge>

      <div class="relative">
        <Avatar :name="callStore.peerName" size="xl" class="h-24 w-24 text-xl" />
        <div
          class="absolute -bottom-1 -right-1 h-7 w-7 rounded-full bg-primary flex items-center justify-center text-white shadow-md"
        >
          <Video v-if="callStore.callType === 'VIDEO'" class="h-4 w-4" />
          <Phone v-else class="h-4 w-4" />
        </div>
      </div>

      <div class="text-center">
        <h3 class="text-base font-bold text-textPrimary">
          {{ callStore.peerName }}
        </h3>
        <p class="text-xs text-textMuted mt-0.5">
          Incoming {{ callStore.callType === 'VIDEO' ? 'Video' : 'Voice' }} Call...
        </p>
      </div>

      <!-- Accept / Decline Buttons -->
      <div class="flex items-center gap-6 mt-2">
        <Button
          variant="destructive"
          size="iconSm"
          class="h-14 w-14 rounded-full bg-red-600 hover:bg-red-700 shadow-lg shadow-red-600/30"
          title="Decline Call"
          @click="callStore.rejectCall()"
        >
          <PhoneOff class="h-6 w-6 text-white" />
        </Button>

        <Button
          variant="default"
          size="iconSm"
          class="h-14 w-14 rounded-full bg-emerald-600 hover:bg-emerald-700 shadow-lg shadow-emerald-600/30 animate-bounce"
          title="Accept Call"
          @click="callStore.acceptCall()"
        >
          <Phone class="h-6 w-6 text-white" />
        </Button>
      </div>
    </div>
  </div>
</template>

