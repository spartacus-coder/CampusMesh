<script setup lang="ts">
import { ref, watch } from "vue";
import { X, UserPlus, QrCode, AlertCircle, CheckCircle } from "lucide-vue-next";
import { Button, Input } from "@campusmesh/ui";
import { useContactsStore } from "../stores/contacts";

const contactsStore = useContactsStore();

const activeTab = ref<"manual" | "qr">("manual");
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
const isSubmitting = ref(false);

watch(rawQrInput, (val) => {
  if (!val.trim()) {
    parsedPreview.value = null;
    return;
  }
  const parsed = contactsStore.parseQrPayload(val);
  parsedPreview.value = parsed;
});

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

    // Reset and close
    displayName.value = "";
    fingerprint.value = "";
    ed25519PublicKey.value = "";
    x25519PublicKey.value = "";
    rawQrInput.value = "";
    parsedPreview.value = null;
    contactsStore.isAddContactOpen = false;
  } catch (err: unknown) {
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    isSubmitting.value = false;
  }
}
</script>

<template>
  <div
    v-if="contactsStore.isAddContactOpen"
    class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200"
  >
    <div
      class="bg-surface border border-border rounded-2xl w-full max-w-lg p-6 shadow-2xl flex flex-col gap-5 text-textPrimary relative"
    >
      <!-- Header -->
      <div
        class="flex items-center justify-between border-b border-border pb-4"
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
              Add a peer to your cryptographic contact directory
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

      <!-- Tab Switcher -->
      <div class="flex rounded-lg bg-background p-1 border border-border">
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
          Manual Details
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
          Paste QR Payload
        </button>
      </div>

      <!-- Tab 1: Manual Form -->
      <div v-if="activeTab === 'manual'" class="flex flex-col gap-4">
        <div>
          <label class="text-xs font-medium text-textSecondary mb-1.5 block">
            Display Name / Alias <span class="text-red-500">*</span>
          </label>
          <Input
            v-model="displayName"
            placeholder="e.g. Alice (Dorm 4)"
            class="h-10"
          />
        </div>

        <div>
          <label class="text-xs font-medium text-textSecondary mb-1.5 block">
            Peer Fingerprint <span class="text-red-500">*</span>
          </label>
          <Input
            v-model="fingerprint"
            placeholder="e.g. fp_e3b0c44298fc1c149afbf4c8996fb924"
            class="h-10 font-mono text-xs"
          />
        </div>

        <div>
          <label class="text-xs font-medium text-textSecondary mb-1.5 block">
            Ed25519 Public Key (Optional)
          </label>
          <Input
            v-model="ed25519PublicKey"
            placeholder="Base64URL encoded public key"
            class="h-10 font-mono text-xs"
          />
        </div>

        <div>
          <label class="text-xs font-medium text-textSecondary mb-1.5 block">
            X25519 DH Public Key (Optional)
          </label>
          <Input
            v-model="x25519PublicKey"
            placeholder="Base64URL encoded Diffie-Hellman key"
            class="h-10 font-mono text-xs"
          />
        </div>
      </div>

      <!-- Tab 2: Paste QR Payload -->
      <div v-else class="flex flex-col gap-4">
        <div>
          <label class="text-xs font-medium text-textSecondary mb-1.5 block">
            Paste Identity QR Text or Invite Link
          </label>
          <textarea
            v-model="rawQrInput"
            rows="4"
            placeholder="Paste raw QR JSON, campusmesh:// invite URL, or cm:fp: string..."
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
              Valid Identity Payload
            </span>
            <Button size="sm" variant="default" @click="applyParsedPayload">
              Use Details
            </Button>
          </div>
          <p class="text-xs font-semibold text-textPrimary">
            {{ parsedPreview.displayName }}
          </p>
          <p class="text-[11px] font-mono text-textMuted break-all">
            {{ parsedPreview.fingerprint }}
          </p>
        </div>
        <p
          v-else-if="rawQrInput"
          class="text-xs text-red-400 flex items-center gap-1.5"
        >
          <AlertCircle class="h-4 w-4" />
          Unrecognized QR payload format
        </p>
      </div>

      <!-- Error message -->
      <p v-if="error" class="text-xs text-red-500 flex items-center gap-1.5">
        <AlertCircle class="h-4 w-4" />
        {{ error }}
      </p>

      <!-- Footer Buttons -->
      <div
        class="flex items-center justify-end gap-3 pt-2 border-t border-border"
      >
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
          :disabled="isSubmitting || activeTab === 'qr'"
          class="gap-1.5"
          @click="handleSave"
        >
          <UserPlus class="h-4 w-4" />
          <span>{{ isSubmitting ? "Saving..." : "Save Contact" }}</span>
        </Button>
      </div>
    </div>
  </div>
</template>
