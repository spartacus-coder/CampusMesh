<script setup lang="ts">
import { ref, watch, onUnmounted, nextTick } from "vue";
import {
  X,
  UserPlus,
  QrCode,
  AlertCircle,
  CheckCircle,
  Camera,
  RefreshCw,
  CameraOff,
  ShieldCheck,
} from "lucide-vue-next";
import { Button, Input } from "@campusmesh/ui";
import { useContactsStore } from "../stores/contacts";
import { Html5Qrcode } from "html5-qrcode";

const contactsStore = useContactsStore();

const activeTab = ref<"camera" | "qr" | "manual">("camera");
const displayName = ref("");
const fingerprint = ref("");
const ed25519PublicKey = ref("");
const x25519PublicKey = ref("");
const rawQrInput = ref("");
const parsedPreview = ref<{
  fingerprint: string;
  displayName: string;
  ed25519PublicKey?: string | undefined;
  x25519PublicKey?: string | undefined;
} | null>(null);

const error = ref<string | null>(null);
const cameraError = ref<string | null>(null);
const isCameraActive = ref(false);
const isSubmitting = ref(false);
const scanSuccess = ref(false);

let html5QrCodeScanner: Html5Qrcode | null = null;

// Watch raw QR textarea input
watch(rawQrInput, (val) => {
  if (!val.trim()) {
    parsedPreview.value = null;
    return;
  }
  const parsed = contactsStore.parseQrPayload(val);
  parsedPreview.value = parsed;
  if (parsed) {
    displayName.value = parsed.displayName;
    fingerprint.value = parsed.fingerprint;
    ed25519PublicKey.value = parsed.ed25519PublicKey || "";
    x25519PublicKey.value = parsed.x25519PublicKey || "";
  }
});

// Watch tab switching to start / stop camera
watch(activeTab, async (newTab) => {
  if (newTab === "camera") {
    await startCamera();
  } else {
    await stopCamera();
  }
});

// Watch modal open/close
watch(
  () => contactsStore.isAddContactOpen,
  async (isOpen) => {
    if (isOpen) {
      scanSuccess.value = false;
      error.value = null;
      if (activeTab.value === "camera") {
        await startCamera();
      }
    } else {
      await stopCamera();
      resetForm();
    }
  },
);

async function startCamera() {
  await stopCamera();
  cameraError.value = null;
  scanSuccess.value = false;

  await nextTick();
  const readerElement = document.getElementById("cm-qr-reader");
  if (!readerElement) return;

  try {
    html5QrCodeScanner = new Html5Qrcode("cm-qr-reader");
    isCameraActive.value = true;

    await html5QrCodeScanner.start(
      { facingMode: "environment" },
      {
        fps: 10,
        qrbox: { width: 220, height: 220 },
      },
      (decodedText) => {
        handleQrScanned(decodedText);
      },
      () => {
        // Ignored frame scan error
      },
    );
  } catch (err: unknown) {
    isCameraActive.value = false;
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("Permission") || msg.includes("NotAllowedError")) {
      cameraError.value =
        "Camera permission was denied. Please allow camera access in your browser settings or use the Paste Invite / QR tab.";
    } else {
      cameraError.value =
        "Could not start camera. You can paste an invite link or enter details manually.";
    }
  }
}

async function stopCamera() {
  if (html5QrCodeScanner) {
    try {
      if (html5QrCodeScanner.isScanning) {
        await html5QrCodeScanner.stop();
      }
      html5QrCodeScanner.clear();
    } catch {
      // Ignore cleanup error
    } finally {
      html5QrCodeScanner = null;
      isCameraActive.value = false;
    }
  }
}

function handleQrScanned(decodedText: string) {
  const parsed = contactsStore.parseQrPayload(decodedText);
  if (parsed) {
    parsedPreview.value = parsed;
    displayName.value = parsed.displayName;
    fingerprint.value = parsed.fingerprint;
    ed25519PublicKey.value = parsed.ed25519PublicKey || "";
    x25519PublicKey.value = parsed.x25519PublicKey || "";
    scanSuccess.value = true;
    error.value = null;

    // Optional haptic feedback
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate(50);
    }

    // Stop camera once scanned
    stopCamera();
  } else {
    error.value =
      "Scanned QR code does not contain a valid CampusMesh identity.";
  }
}

function resetForm() {
  displayName.value = "";
  fingerprint.value = "";
  ed25519PublicKey.value = "";
  x25519PublicKey.value = "";
  rawQrInput.value = "";
  parsedPreview.value = null;
  error.value = null;
  cameraError.value = null;
  scanSuccess.value = false;
}

function applyParsedPayload() {
  if (!parsedPreview.value) return;
  displayName.value = parsedPreview.value.displayName;
  fingerprint.value = parsedPreview.value.fingerprint;
  ed25519PublicKey.value = parsedPreview.value.ed25519PublicKey || "";
  x25519PublicKey.value = parsedPreview.value.x25519PublicKey || "";
  activeTab.value = "manual";
}

async function handleSave() {
  error.value = null;

  // Auto-fill from parsed preview if available
  if (parsedPreview.value && (!displayName.value || !fingerprint.value)) {
    displayName.value = parsedPreview.value.displayName;
    fingerprint.value = parsedPreview.value.fingerprint;
    ed25519PublicKey.value = parsedPreview.value.ed25519PublicKey || "";
    x25519PublicKey.value = parsedPreview.value.x25519PublicKey || "";
  }

  const name = displayName.value.trim();
  const fp = fingerprint.value.trim();

  if (!name) {
    error.value = "Please enter a display name or alias for this contact.";
    return;
  }
  if (!fp || fp.length < 8) {
    error.value =
      "Please provide a valid peer fingerprint (at least 8 characters).";
    return;
  }

  try {
    isSubmitting.value = true;
    await contactsStore.addContact({
      displayName: name,
      fingerprint: fp,
      ...(ed25519PublicKey.value.trim()
        ? { ed25519PublicKey: ed25519PublicKey.value.trim() }
        : {}),
      ...(x25519PublicKey.value.trim()
        ? { x25519PublicKey: x25519PublicKey.value.trim() }
        : {}),
    });

    await stopCamera();
    resetForm();
    contactsStore.isAddContactOpen = false;
  } catch (err: unknown) {
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    isSubmitting.value = false;
  }
}

onUnmounted(() => {
  stopCamera();
});
</script>

<template>
  <div
    v-if="contactsStore.isAddContactOpen"
    class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-in fade-in duration-200"
  >
    <div
      class="bg-surface border border-border rounded-2xl w-full max-w-lg p-6 shadow-2xl flex flex-col gap-4 text-textPrimary relative"
    >
      <!-- Header -->
      <div
        class="flex items-center justify-between border-b border-border pb-3"
      >
        <div class="flex items-center gap-3">
          <div
            class="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center"
          >
            <UserPlus class="h-5 w-5" />
          </div>
          <div>
            <h2 class="text-base font-bold">Add Contact</h2>
            <p class="text-xs text-textMuted">
              Add a peer by scanning their QR card, pasting invite, or entering
              details
            </p>
          </div>
        </div>
        <button
          class="text-textMuted hover:text-textPrimary p-1 rounded-lg hover:bg-surfaceHover transition-colors"
          @click="contactsStore.isAddContactOpen = false"
        >
          <X class="h-5 w-5" />
        </button>
      </div>

      <!-- 3-Way Tab Switcher -->
      <div class="flex rounded-lg bg-background p-1 border border-border gap-1">
        <button
          type="button"
          class="flex-1 py-1.5 text-xs font-semibold rounded-md transition-all flex items-center justify-center gap-1.5"
          :class="
            activeTab === 'camera'
              ? 'bg-surface text-textPrimary shadow-xs'
              : 'text-textMuted hover:text-textPrimary'
          "
          @click="activeTab = 'camera'"
        >
          <Camera class="h-3.5 w-3.5" />
          Scan Camera
        </button>
        <button
          type="button"
          class="flex-1 py-1.5 text-xs font-semibold rounded-md transition-all flex items-center justify-center gap-1.5"
          :class="
            activeTab === 'qr'
              ? 'bg-surface text-textPrimary shadow-xs'
              : 'text-textMuted hover:text-textPrimary'
          "
          @click="activeTab = 'qr'"
        >
          <QrCode class="h-3.5 w-3.5" />
          Paste Invite / QR
        </button>
        <button
          type="button"
          class="flex-1 py-1.5 text-xs font-semibold rounded-md transition-all flex items-center justify-center gap-1.5"
          :class="
            activeTab === 'manual'
              ? 'bg-surface text-textPrimary shadow-xs'
              : 'text-textMuted hover:text-textPrimary'
          "
          @click="activeTab = 'manual'"
        >
          <UserPlus class="h-3.5 w-3.5" />
          Manual Entry
        </button>
      </div>

      <!-- Tab 1: Live Camera Scanner -->
      <div v-if="activeTab === 'camera'" class="flex flex-col gap-3">
        <!-- Viewport & Scan target -->
        <div
          v-show="!scanSuccess && !cameraError"
          class="relative w-full rounded-xl overflow-hidden bg-black/90 border border-border min-h-[240px] flex items-center justify-center"
        >
          <div id="cm-qr-reader" class="w-full"></div>
          <p
            v-if="!isCameraActive"
            class="absolute text-xs text-textMuted flex items-center gap-2"
          >
            <RefreshCw class="h-4 w-4 animate-spin text-primary" />
            Initializing camera stream...
          </p>
        </div>

        <!-- Camera Error fallback -->
        <div
          v-if="cameraError"
          class="p-4 rounded-xl border border-border bg-surface-subtle flex flex-col items-center text-center gap-2"
        >
          <CameraOff class="h-8 w-8 text-textMuted" />
          <p class="text-xs text-textSecondary max-w-xs">{{ cameraError }}</p>
          <div class="flex items-center gap-2 mt-2">
            <Button size="sm" variant="outline" @click="startCamera">
              <RefreshCw class="h-3.5 w-3.5 mr-1" />
              Try Again
            </Button>
            <Button size="sm" variant="default" @click="activeTab = 'qr'">
              <QrCode class="h-3.5 w-3.5 mr-1" />
              Paste Invite Link
            </Button>
          </div>
        </div>

        <!-- Scanned Success Preview -->
        <div
          v-if="scanSuccess && parsedPreview"
          class="p-4 rounded-xl border border-success/40 bg-success/10 flex flex-col gap-2.5 animate-in fade-in"
        >
          <div class="flex items-center justify-between">
            <span
              class="text-xs font-bold text-success flex items-center gap-1.5"
            >
              <CheckCircle class="h-4 w-4" />
              QR Code Successfully Scanned!
            </span>
            <button
              class="text-xs text-textSecondary hover:text-textPrimary flex items-center gap-1"
              @click="startCamera"
            >
              <RefreshCw class="h-3 w-3" />
              Scan Again
            </button>
          </div>
          <div>
            <label
              class="text-[11px] font-medium text-textSecondary block mb-1"
            >
              Contact Alias / Display Name
            </label>
            <Input v-model="displayName" class="h-9 text-xs" />
          </div>
          <div
            class="text-[11px] font-mono text-textMuted break-all bg-background/50 p-2 rounded-lg"
          >
            {{ parsedPreview.fingerprint }}
          </div>
          <div class="flex items-center gap-2 text-[11px] text-textSecondary">
            <ShieldCheck class="h-3.5 w-3.5 text-primary" />
            <span>Cryptographic public keys verified and loaded</span>
          </div>
        </div>

        <p
          v-if="!scanSuccess && !cameraError"
          class="text-[11px] text-center text-textMuted"
        >
          Point your device camera at the peer's Identity QR Card to scan
          automatically.
        </p>
      </div>

      <!-- Tab 2: Paste QR / Invite Link -->
      <div v-else-if="activeTab === 'qr'" class="flex flex-col gap-3">
        <div>
          <label class="text-xs font-medium text-textSecondary mb-1.5 block">
            Paste Identity QR Text, Invite Link, or Fingerprint
          </label>
          <textarea
            v-model="rawQrInput"
            rows="3"
            placeholder="Paste campusmesh://identity?... invite URL, raw QR JSON, or fingerprint..."
            class="w-full rounded-xl border border-border bg-background p-3 text-xs font-mono text-textPrimary placeholder:text-textMuted focus:outline-hidden focus:ring-2 focus:ring-primary focus:border-transparent resize-none"
          ></textarea>
        </div>

        <!-- Preview Card -->
        <div
          v-if="parsedPreview"
          class="p-3.5 rounded-xl border border-primary/30 bg-primary/5 flex flex-col gap-2"
        >
          <div class="flex items-center justify-between">
            <span
              class="text-xs font-bold text-primary flex items-center gap-1.5"
            >
              <CheckCircle class="h-4 w-4" />
              Valid Identity Detected
            </span>
            <Button
              size="sm"
              variant="outline"
              class="h-7 text-xs"
              @click="applyParsedPayload"
            >
              Edit Details
            </Button>
          </div>
          <div>
            <label
              class="text-[11px] font-medium text-textSecondary block mb-1"
            >
              Contact Alias
            </label>
            <Input v-model="displayName" class="h-8 text-xs" />
          </div>
          <p class="text-[11px] font-mono text-textMuted break-all">
            {{ parsedPreview.fingerprint }}
          </p>
        </div>
        <p
          v-else-if="rawQrInput.trim()"
          class="text-xs text-red-400 flex items-center gap-1.5"
        >
          <AlertCircle class="h-4 w-4" />
          Unrecognized identity format. Try pasting the full link or raw
          fingerprint.
        </p>
      </div>

      <!-- Tab 3: Manual Entry -->
      <div v-else class="flex flex-col gap-3">
        <div>
          <label class="text-xs font-medium text-textSecondary mb-1 block">
            Display Name / Alias <span class="text-red-500">*</span>
          </label>
          <Input
            v-model="displayName"
            placeholder="e.g. Alice (Dorm 4)"
            class="h-9 text-xs"
          />
        </div>

        <div>
          <label class="text-xs font-medium text-textSecondary mb-1 block">
            Peer Fingerprint <span class="text-red-500">*</span>
          </label>
          <Input
            v-model="fingerprint"
            placeholder="e.g. fp_e3b0c44298fc1c149afbf4c8996fb924"
            class="h-9 font-mono text-xs"
          />
        </div>

        <div>
          <label class="text-xs font-medium text-textSecondary mb-1 block">
            Ed25519 Public Key (Optional)
          </label>
          <Input
            v-model="ed25519PublicKey"
            placeholder="Base64URL encoded public key"
            class="h-9 font-mono text-xs"
          />
        </div>

        <div>
          <label class="text-xs font-medium text-textSecondary mb-1 block">
            X25519 DH Public Key (Optional)
          </label>
          <Input
            v-model="x25519PublicKey"
            placeholder="Base64URL encoded Diffie-Hellman key"
            class="h-9 font-mono text-xs"
          />
        </div>
      </div>

      <!-- Error message -->
      <p v-if="error" class="text-xs text-red-500 flex items-center gap-1.5">
        <AlertCircle class="h-4 w-4 shrink-0" />
        {{ error }}
      </p>

      <!-- Footer Buttons -->
      <div
        class="flex items-center justify-between pt-2 border-t border-border"
      >
        <span class="text-[11px] text-textMuted">
          {{
            parsedPreview
              ? "Ready to save"
              : activeTab === "manual"
                ? "Fill required fields"
                : "Waiting for QR data"
          }}
        </span>
        <div class="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            @click="contactsStore.isAddContactOpen = false"
          >
            Cancel
          </Button>
          <Button
            variant="default"
            size="sm"
            :disabled="
              isSubmitting ||
              (activeTab !== 'manual' && !parsedPreview) ||
              (activeTab === 'manual' &&
                (!displayName.trim() || !fingerprint.trim()))
            "
            class="gap-1.5"
            @click="handleSave"
          >
            <UserPlus class="h-4 w-4" />
            <span>{{ isSubmitting ? "Saving..." : "Save Contact" }}</span>
          </Button>
        </div>
      </div>
    </div>
  </div>
</template>
