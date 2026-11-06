<script setup lang="ts">
import { ref, onMounted } from "vue";
import QRCode from "qrcode";
import { useIdentityStore } from "../stores/identity";
import { Button } from "@campusmesh/ui";
import { QrCode, Copy, Check, X, ShieldCheck } from "lucide-vue-next";

const emit = defineEmits<{
  (e: "close"): void;
}>();

const identityStore = useIdentityStore();
const qrDataUrl = ref<string>("");
const isCopied = ref(false);

onMounted(async () => {
  if (identityStore.identity) {
    const payload = identityStore.getQrPayload();
    const uri = `campusmesh://identity?v=1&name=${encodeURIComponent(
      payload.name,
    )}&fp=${payload.fp}&edPk=${payload.edPk}&xPk=${payload.xPk}`;
    try {
      qrDataUrl.value = await QRCode.toDataURL(uri, {
        errorCorrectionLevel: "M",
        margin: 2,
        width: 256,
        color: {
          dark: "#000000",
          light: "#ffffff",
        },
      });
    } catch (err) {
      console.error("Failed to generate QR code:", err);
    }
  }
});

function copyFingerprint() {
  if (identityStore.identity?.fingerprint) {
    navigator.clipboard.writeText(identityStore.identity.fingerprint);
    isCopied.value = true;
    setTimeout(() => {
      isCopied.value = false;
    }, 2000);
  }
}
</script>

<template>
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
  >
    <div
      class="bg-surface border border-border rounded-2xl max-w-sm w-full p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-200"
    >
      <div
        class="flex items-center justify-between pb-2 border-b border-border"
      >
        <div class="flex items-center gap-2">
          <QrCode class="h-5 w-5 text-primary" />
          <h2 class="text-base font-bold text-textPrimary">Identity QR Card</h2>
        </div>
        <button
          class="text-textSecondary hover:text-textPrimary p-1 rounded-md"
          @click="emit('close')"
        >
          <X class="h-5 w-5" />
        </button>
      </div>

      <div class="flex flex-col items-center text-center space-y-4">
        <!-- QR Code Canvas / Image -->
        <div class="bg-white p-3 rounded-xl shadow-md border border-border">
          <img
            v-if="qrDataUrl"
            :src="qrDataUrl"
            alt="CampusMesh Identity QR"
            class="w-48 h-48 block mx-auto"
          />
          <div
            v-else
            class="w-48 h-48 flex items-center justify-center text-xs text-black"
          >
            Generating QR...
          </div>
        </div>

        <div>
          <h3 class="text-base font-bold text-textPrimary">
            {{ identityStore.identity?.displayName }}
          </h3>
          <div class="flex items-center justify-center gap-1.5 mt-1">
            <ShieldCheck class="h-4 w-4 text-success" />
            <span class="text-xs text-textSecondary"
              >Cryptographically Verified</span
            >
          </div>
        </div>

        <!-- Fingerprint -->
        <div
          class="w-full bg-surface-subtle p-3 rounded-xl border border-borderSubtle text-left"
        >
          <div class="flex items-center justify-between mb-1">
            <span
              class="text-[11px] font-medium text-textSecondary uppercase tracking-wider"
            >
              Safety Fingerprint
            </span>
            <button
              class="text-xs text-primary hover:underline flex items-center gap-1"
              @click="copyFingerprint"
            >
              <Check v-if="isCopied" class="h-3.5 w-3.5 text-success" />
              <Copy v-else class="h-3.5 w-3.5" />
              <span>{{ isCopied ? "Copied" : "Copy" }}</span>
            </button>
          </div>
          <div
            class="font-mono text-xs text-textPrimary break-all select-all leading-relaxed"
          >
            {{ identityStore.formattedSafetyFingerprint }}
          </div>
        </div>
      </div>

      <Button variant="secondary" class="w-full" @click="emit('close')">
        Done
      </Button>
    </div>
  </div>
</template>
