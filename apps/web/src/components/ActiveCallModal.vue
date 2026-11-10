<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from "vue";
import {
  PhoneOff,
  Mic,
  MicOff,
  Video,
  VideoOff,
  ShieldCheck,
  Volume2,
  AlertCircle,
} from "lucide-vue-next";
import { Avatar, Button, Badge } from "@campusmesh/ui";
import { useCallStore } from "../stores/call";
import { CallState } from "@campusmesh/messaging";

const callStore = useCallStore();

const remoteVideoRef = ref<HTMLVideoElement | null>(null);
const localVideoRef = ref<HTMLVideoElement | null>(null);
const remoteAudioRef = ref<HTMLAudioElement | null>(null);
const audioPlaybackBlocked = ref(false);

const hasRemoteVideo = computed(() => {
  const stream = callStore.remoteStream;
  if (!stream) return false;
  return stream.getVideoTracks().some((t) => t.readyState === "live");
});

const statusLabel = computed(() => {
  if (callStore.callState === CallState.OUTGOING_RINGING) {
    return "Ringing peer...";
  }
  if (callStore.connectionStatus === "connecting") {
    return `Connecting audio... (${callStore.formattedDuration})`;
  }
  if (callStore.connectionStatus === "disconnected") {
    return `Reconnecting... (${callStore.formattedDuration})`;
  }
  return callStore.formattedDuration;
});

function enableAudioPlayback() {
  if (!remoteAudioRef.value) return;
  remoteAudioRef.value
    .play()
    .then(() => {
      audioPlaybackBlocked.value = false;
    })
    .catch(() => {
      audioPlaybackBlocked.value = true;
    });
}

watch(
  [() => callStore.remoteStream, remoteVideoRef, remoteAudioRef],
  ([stream]) => {
    if (remoteVideoRef.value) {
      remoteVideoRef.value.srcObject = stream || null;
      if (stream) {
        remoteVideoRef.value.play().catch(() => {});
      }
    }
    if (remoteAudioRef.value) {
      remoteAudioRef.value.srcObject = stream || null;
      if (stream) {
        remoteAudioRef.value.muted = false;
        remoteAudioRef.value
          .play()
          .then(() => {
            audioPlaybackBlocked.value = false;
          })
          .catch((err) => {
            console.warn("[ActiveCallModal] Audio autoplay blocked:", err);
            audioPlaybackBlocked.value = true;
          });
      } else {
        audioPlaybackBlocked.value = false;
      }
    }
  },
  { immediate: true },
);

watch(
  [() => callStore.localStream, localVideoRef],
  ([stream]) => {
    if (localVideoRef.value) {
      localVideoRef.value.srcObject = stream || null;
      if (stream) {
        localVideoRef.value.play().catch(() => {});
      }
    }
  },
  { immediate: true },
);

onUnmounted(() => {
  if (remoteVideoRef.value) remoteVideoRef.value.srcObject = null;
  if (localVideoRef.value) localVideoRef.value.srcObject = null;
  if (remoteAudioRef.value) remoteAudioRef.value.srcObject = null;
});
</script>

<template>
  <div
    v-if="callStore.isCallActive"
    class="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200"
  >
    <!-- Off-screen audio element (not display:none so WebViews keep audio decoder active) -->
    <audio
      ref="remoteAudioRef"
      autoplay
      playsinline
      class="w-0 h-0 opacity-0 pointer-events-none absolute"
    ></audio>

    <div
      class="bg-surface border border-border rounded-3xl w-full shadow-2xl flex flex-col items-center text-textPrimary relative overflow-hidden transition-all duration-300"
      :class="
        callStore.callType === 'VIDEO'
          ? 'max-w-2xl h-[85vh] max-h-[640px] p-4'
          : 'max-w-md p-6 gap-6'
      "
    >
      <!-- Top Header Row -->
      <div class="w-full flex items-center justify-between z-10 shrink-0">
        <Badge variant="success" class="text-[10px] gap-1 px-2.5 py-0.5">
          <ShieldCheck class="h-3 w-3" />
          Direct P2P E2EE
          {{ callStore.callType === "VIDEO" ? "Video" : "Voice" }}
        </Badge>

        <span
          class="font-mono text-xs text-textMuted bg-surface-subtle/80 px-2.5 py-0.5 rounded-full border border-borderSubtle"
        >
          {{ statusLabel }}
        </span>
      </div>

      <!-- Optional Audio Autoplay Recovery / Media Warning -->
      <div
        v-if="audioPlaybackBlocked"
        class="w-full flex items-center justify-center z-20 shrink-0"
      >
        <Button
          variant="default"
          size="sm"
          class="gap-2 bg-amber-600 hover:bg-amber-700 text-white shadow-md"
          @click="enableAudioPlayback"
        >
          <Volume2 class="h-4 w-4" />
          Tap to Enable Call Speaker
        </Button>
      </div>

      <div
        v-if="callStore.mediaError"
        class="w-full flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-500 z-20 shrink-0"
      >
        <AlertCircle class="h-4 w-4 shrink-0" />
        <span>{{ callStore.mediaError }}</span>
      </div>

      <!-- VIDEO CALL DISPLAY -->
      <div
        v-if="callStore.callType === 'VIDEO'"
        class="relative w-full flex-1 min-h-0 my-3 rounded-2xl overflow-hidden bg-black flex items-center justify-center border border-borderSubtle"
      >
        <!-- Remote Video Stream (muted here because remoteAudioRef plays remote audio cleanly) -->
        <video
          v-show="hasRemoteVideo"
          ref="remoteVideoRef"
          autoplay
          playsinline
          muted
          class="w-full h-full object-cover"
        ></video>

        <!-- Fallback if remote video hasn't arrived yet -->
        <div
          v-show="!hasRemoteVideo"
          class="flex flex-col items-center justify-center gap-3"
        >
          <div class="relative">
            <Avatar
              :name="callStore.peerName"
              size="xl"
              class="h-24 w-24 text-2xl shadow-xl border-2 border-primary/40"
            />
            <div
              v-if="callStore.callState === CallState.OUTGOING_RINGING"
              class="absolute -bottom-1 -right-1 h-5 w-5 rounded-full bg-primary animate-ping"
            ></div>
          </div>
          <p class="text-sm font-medium text-white/90">
            {{
              callStore.callState === CallState.OUTGOING_RINGING
                ? "Connecting camera..."
                : "Waiting for video stream..."
            }}
          </p>
        </div>

        <!-- Floating Picture-in-Picture Local Self Preview -->
        <div
          class="absolute top-3 right-3 w-28 sm:w-36 aspect-video rounded-xl overflow-hidden shadow-2xl border-2 border-white/30 bg-neutral-900 z-20"
        >
          <video
            ref="localVideoRef"
            autoplay
            playsinline
            muted
            class="w-full h-full object-cover scale-x-[-1]"
          ></video>
          <span
            v-if="callStore.isVideoMuted"
            class="absolute inset-0 flex items-center justify-center bg-black/70 text-[10px] text-white/80"
          >
            Camera Off
          </span>
        </div>
      </div>

      <!-- VOICE CALL DISPLAY -->
      <div v-else class="flex flex-col items-center justify-center gap-5 my-2">
        <div
          class="relative flex flex-col items-center justify-center w-36 h-36 rounded-full bg-background border-2 border-primary/30 shadow-inner"
        >
          <Avatar
            :name="callStore.peerName"
            size="xl"
            class="h-24 w-24 text-2xl"
          />
          <div
            v-if="callStore.callState === CallState.CONNECTED"
            class="absolute bottom-1 right-2 h-4 w-4 rounded-full bg-emerald-500 border-2 border-surface animate-pulse"
          ></div>
        </div>

        <div class="text-center">
          <h3 class="text-lg font-bold text-textPrimary">
            {{ callStore.peerName }}
          </h3>
          <p class="font-mono text-xs text-textMuted mt-1">
            {{
              callStore.callState === CallState.OUTGOING_RINGING
                ? "Ringing peer directly..."
                : `Connected • ${callStore.formattedDuration}`
            }}
          </p>
        </div>
      </div>

      <!-- Call Controls Row -->
      <div class="flex items-center gap-4 mt-auto pt-2 z-10 shrink-0">
        <!-- Audio Mute -->
        <Button
          :variant="callStore.isAudioMuted ? 'destructive' : 'outline'"
          size="iconSm"
          class="h-12 w-12 rounded-full shadow-md"
          :title="
            callStore.isAudioMuted ? 'Unmute Microphone' : 'Mute Microphone'
          "
          @click="callStore.toggleAudio()"
        >
          <MicOff v-if="callStore.isAudioMuted" class="h-5 w-5" />
          <Mic v-else class="h-5 w-5" />
        </Button>

        <!-- Video Mute Toggle (if video call) -->
        <Button
          v-if="callStore.callType === 'VIDEO'"
          :variant="callStore.isVideoMuted ? 'destructive' : 'outline'"
          size="iconSm"
          class="h-12 w-12 rounded-full shadow-md"
          :title="callStore.isVideoMuted ? 'Turn Camera On' : 'Turn Camera Off'"
          @click="callStore.toggleVideo()"
        >
          <VideoOff v-if="callStore.isVideoMuted" class="h-5 w-5" />
          <Video v-else class="h-5 w-5" />
        </Button>

        <!-- End Call Button -->
        <Button
          variant="destructive"
          size="iconSm"
          class="h-14 w-14 rounded-full bg-red-600 hover:bg-red-700 shadow-xl shadow-red-600/30 active:scale-95 transition-transform"
          title="End Call"
          @click="callStore.endCall()"
        >
          <PhoneOff class="h-6 w-6 text-white" />
        </Button>
      </div>
    </div>
  </div>
</template>
