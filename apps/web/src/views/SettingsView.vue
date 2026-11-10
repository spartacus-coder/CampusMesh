<script setup lang="ts">
import { ref, computed } from "vue";
import { useThemeStore } from "../stores/theme";
import { useIdentityStore } from "../stores/identity";
import { useNetworkStore } from "../stores/network";
import { nativeService } from "../services/native";
import {
  Shield,
  Database,
  Moon,
  Sun,
  Monitor,
  KeyRound,
  QrCode,
  Download,
  Lock,
  Copy,
  Check,
  RefreshCw,
  ExternalLink,
  Network,
} from "lucide-vue-next";
import { Button, Badge } from "@campusmesh/ui";
import IdentityCardModal from "../components/IdentityCardModal.vue";

const themeStore = useThemeStore();
const identityStore = useIdentityStore();
const networkStore = useNetworkStore();

const swarmPeerCount = computed(
  () => Object.keys(networkStore.swarmPeers).length,
);
const lanPeerCount = computed(() => Object.keys(networkStore.lanPeers).length);
const isTauriDesktop = nativeService.isTauri;

const showQrModal = ref(false);
const exportPassphrase = ref("");
const showExportPrompt = ref(false);
const exportSuccessMessage = ref<string | null>(null);
const exportError = ref<string | null>(null);
const isCopiedFp = ref(false);

function copyFingerprint() {
  if (identityStore.identity?.fingerprint) {
    navigator.clipboard.writeText(identityStore.identity.fingerprint);
    isCopiedFp.value = true;
    setTimeout(() => {
      isCopiedFp.value = false;
    }, 2000);
  }
}

async function handleExportBackup() {
  exportError.value = null;
  exportSuccessMessage.value = null;
  if (!exportPassphrase.value) {
    exportError.value = "Please enter your passphrase to encrypt the backup.";
    return;
  }
  try {
    const backupJson = await identityStore.exportBackup(exportPassphrase.value);
    const blob = new Blob([backupJson], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `campusmesh-backup-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    exportSuccessMessage.value = "Backup file downloaded successfully.";
    exportPassphrase.value = "";
    showExportPrompt.value = false;
  } catch (err: any) {
    exportError.value = err.message || "Failed to export backup.";
  }
}
</script>

<template>
  <div
    class="flex-1 flex flex-col h-full overflow-y-auto bg-background p-6 max-w-4xl mx-auto w-full space-y-6"
  >
    <header class="pb-4 border-b border-border">
      <h1 class="text-xl font-bold text-textPrimary tracking-tight">
        Settings & Preferences
      </h1>
      <p class="text-xs text-textSecondary mt-1">
        Manage local identity, encryption keys, appearance, and zero-cost budget
        guards.
      </p>
    </header>

    <!-- Cryptographic Identity Card -->
    <section class="rounded-xl border border-border bg-surface p-5 space-y-4">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-3">
          <KeyRound class="h-5 w-5 text-primary" />
          <div>
            <h2 class="text-sm font-semibold text-textPrimary">
              Cryptographic Identity
            </h2>
            <p class="text-xs text-textSecondary">
              Your decentralized identity generated from a 24-word BIP-39 seed.
            </p>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <Badge v-if="identityStore.isUnlocked" variant="success"
            >Vault Unlocked</Badge
          >
          <Badge v-else variant="outline">Locked</Badge>
        </div>
      </div>

      <template v-if="identityStore.identity">
        <div
          class="space-y-3 bg-surface-subtle p-4 rounded-xl border border-borderSubtle"
        >
          <div class="flex items-center justify-between">
            <span class="text-xs text-textSecondary font-medium"
              >Display Name:</span
            >
            <span class="text-xs font-bold text-textPrimary">{{
              identityStore.identity.displayName
            }}</span>
          </div>

          <div>
            <div class="flex items-center justify-between mb-1">
              <span class="text-xs text-textSecondary font-medium"
                >Safety Fingerprint:</span
              >
              <button
                class="text-xs text-primary hover:underline flex items-center gap-1"
                @click="copyFingerprint"
              >
                <Check v-if="isCopiedFp" class="h-3 w-3 text-success" />
                <Copy v-else class="h-3 w-3" />
                <span>{{ isCopiedFp ? "Copied" : "Copy" }}</span>
              </button>
            </div>
            <div
              class="font-mono text-xs text-textPrimary break-all select-all"
            >
              {{ identityStore.formattedSafetyFingerprint }}
            </div>
          </div>
        </div>

        <div class="flex flex-wrap items-center gap-3 pt-1">
          <Button
            variant="outline"
            size="sm"
            class="gap-1.5"
            @click="showQrModal = true"
          >
            <QrCode class="h-4 w-4" />
            <span>Show QR Card</span>
          </Button>

          <Button
            variant="outline"
            size="sm"
            class="gap-1.5"
            @click="showExportPrompt = !showExportPrompt"
          >
            <Download class="h-4 w-4" />
            <span>Export Encrypted Backup</span>
          </Button>

          <Button
            variant="ghost"
            size="sm"
            class="gap-1.5 text-danger"
            @click="identityStore.lock"
          >
            <Lock class="h-4 w-4" />
            <span>Lock Vault</span>
          </Button>
        </div>

        <!-- Export Prompt Inline -->
        <div
          v-if="showExportPrompt"
          class="p-4 rounded-xl border border-border bg-surface space-y-3"
        >
          <h3 class="text-xs font-bold text-textPrimary">
            Confirm Passphrase for Backup Export
          </h3>
          <p class="text-xs text-textSecondary">
            Enter your passphrase to verify ownership and generate the encrypted
            backup file.
          </p>
          <div class="flex gap-2">
            <input
              v-model="exportPassphrase"
              type="password"
              placeholder="Enter passphrase..."
              class="flex-1 rounded-md border border-border bg-surface px-3 py-1.5 text-xs text-textPrimary placeholder:text-textSecondary focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <Button size="sm" @click="handleExportBackup">Download</Button>
            <Button
              variant="outline"
              size="sm"
              @click="showExportPrompt = false"
              >Cancel</Button
            >
          </div>
          <div v-if="exportError" class="text-xs text-danger">
            {{ exportError }}
          </div>
        </div>

        <div
          v-if="exportSuccessMessage"
          class="text-xs text-success font-medium"
        >
          {{ exportSuccessMessage }}
        </div>
      </template>

      <div v-else class="text-xs text-textSecondary">
        No cryptographic identity configured. Please complete onboarding.
      </div>
    </section>

    <!-- Theme Customization Card -->
    <section class="rounded-xl border border-border bg-surface p-5 space-y-4">
      <div class="flex items-center gap-3">
        <Sun class="h-5 w-5 text-primary" />
        <div>
          <h2 class="text-sm font-semibold text-textPrimary">
            Appearance Theme
          </h2>
          <p class="text-xs text-textSecondary">
            Select a theme tailored for readability and contrast.
          </p>
        </div>
      </div>

      <div class="grid grid-cols-3 gap-3 pt-2">
        <button
          class="flex flex-col items-center gap-2 rounded-lg border p-3 text-xs font-medium transition-all"
          :class="
            themeStore.currentTheme === 'dark'
              ? 'border-primary bg-primary/10 text-primary font-bold'
              : 'border-border bg-surface-subtle text-textSecondary hover:bg-surface-hover'
          "
          @click="themeStore.applyTheme('dark')"
        >
          <Moon class="h-4 w-4" />
          <span>Dark</span>
        </button>
        <button
          class="flex flex-col items-center gap-2 rounded-lg border p-3 text-xs font-medium transition-all"
          :class="
            themeStore.currentTheme === 'light'
              ? 'border-primary bg-primary/10 text-primary font-bold'
              : 'border-border bg-surface-subtle text-textSecondary hover:bg-surface-hover'
          "
          @click="themeStore.applyTheme('light')"
        >
          <Sun class="h-4 w-4" />
          <span>Light</span>
        </button>
        <button
          class="flex flex-col items-center gap-2 rounded-lg border p-3 text-xs font-medium transition-all"
          :class="
            themeStore.currentTheme === 'high-contrast'
              ? 'border-primary bg-primary/10 text-primary font-bold'
              : 'border-border bg-surface-subtle text-textSecondary hover:bg-surface-hover'
          "
          @click="themeStore.applyTheme('high-contrast')"
        >
          <Monitor class="h-4 w-4" />
          <span>High Contrast</span>
        </button>
      </div>
    </section>

    <!-- Zero-Cost Budget & Quotas Card -->
    <section class="rounded-xl border border-border bg-surface p-5 space-y-3">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-3">
          <Shield class="h-5 w-5 text-success" />
          <div>
            <h2 class="text-sm font-semibold text-textPrimary">
              Infrastructure Budget & Fail-Closed Guard
            </h2>
            <p class="text-xs text-textSecondary">
              Hard budget policy strictly enforced at $0.00/month.
            </p>
          </div>
        </div>
        <Badge variant="success">Zero Cost Verified</Badge>
      </div>

      <div
        class="rounded-lg bg-surface-subtle p-3 text-xs text-textSecondary space-y-1.5 border border-borderSubtle"
      >
        <p>
          <span class="text-textPrimary font-medium">Cloudflare Workers:</span>
          100,000 req/day free allocation
        </p>
        <p>
          <span class="text-textPrimary font-medium"
            >Cloudflare DO SQLite:</span
          >
          100,000 writes/day & 5M reads/day free
        </p>
        <p>
          <span class="text-textPrimary font-medium">Public STUN:</span>
          Cloudflare (`3478`) & Google (`19302`)
        </p>
      </div>
    </section>

    <!-- Holepunch Hyperswarm & Hybrid Gateway Diagnostics Card -->
    <section class="rounded-xl border border-border bg-surface p-5 space-y-3">
      <div class="flex items-center justify-between gap-2">
        <div class="flex items-center gap-3">
          <Network class="h-5 w-5 text-primary" />
          <div>
            <h2 class="text-sm font-semibold text-textPrimary">
              Holepunch Swarm & Parallel Mesh
            </h2>
            <p class="text-xs text-textSecondary">
              Serverless HyperDHT discovery, Autobase replicated logs & LAN TCP.
            </p>
          </div>
        </div>
        <Badge
          :variant="
            networkStore.swarmStatus === 'online' ||
            networkStore.gatewayPeerFingerprint
              ? 'success'
              : 'outline'
          "
        >
          {{
            isTauriDesktop
              ? networkStore.swarmStatus === "online"
                ? "HyperDHT Online"
                : networkStore.swarmStatus
              : networkStore.gatewayPeerFingerprint
                ? "Gateway Connected"
                : "WebRTC Direct"
          }}
        </Badge>
      </div>

      <div
        class="rounded-lg bg-surface-subtle p-3 text-xs text-textSecondary space-y-1.5 border border-borderSubtle"
      >
        <p v-if="networkStore.swarmPublicKey">
          <span class="text-textPrimary font-medium">Swarm Node Key:</span>
          <span class="font-mono break-all ml-1">{{
            networkStore.swarmPublicKey
          }}</span>
        </p>
        <p>
          <span class="text-textPrimary font-medium">Swarm UTP Peers:</span>
          {{ swarmPeerCount }} connected
        </p>
        <p>
          <span class="text-textPrimary font-medium">Local LAN Peers:</span>
          {{ lanPeerCount }} nearby ({{
            networkStore.isDirectLan
              ? "Direct TCP Active"
              : "Multicast Standby"
          }})
        </p>
        <p v-if="!isTauriDesktop && networkStore.gatewayPeerFingerprint">
          <span class="text-textPrimary font-medium">Desktop Gateway:</span>
          <span class="font-mono ml-1">{{
            networkStore.gatewayPeerFingerprint
          }}</span>
        </p>
        <p v-if="networkStore.swarmError" class="text-amber-500">
          {{ networkStore.swarmError }}
        </p>
      </div>
    </section>

    <!-- Local Persistence Diagnostics Card -->
    <section class="rounded-xl border border-border bg-surface p-5 space-y-3">
      <div class="flex items-center gap-3">
        <Database class="h-5 w-5 text-primary" />
        <div>
          <h2 class="text-sm font-semibold text-textPrimary">
            Local Storage (IndexedDB)
          </h2>
          <p class="text-xs text-textSecondary">
            Your private keys, contacts, and message history are stored locally.
          </p>
        </div>
      </div>
      <div class="flex items-center justify-between pt-2">
        <span class="text-xs text-textSecondary">
          Database Status:
          <strong class="text-textPrimary">Healthy (Dexie Engine)</strong>
        </span>
      </div>
    </section>

    <!-- App Version & Updates Card -->
    <section class="rounded-xl border border-border bg-surface p-5 space-y-3">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-3">
          <RefreshCw class="h-5 w-5 text-primary" />
          <div>
            <h2 class="text-sm font-semibold text-textPrimary">
              App Version & Updates
            </h2>
            <p class="text-xs text-textSecondary">
              Continuous zero-cost updates via GitHub Actions & Cloudflare.
            </p>
          </div>
        </div>
        <Badge variant="outline">v1.0.6</Badge>
      </div>
      <div class="flex items-center justify-between pt-2">
        <span class="text-xs text-textSecondary">
          Automated builds enabled for Web, Desktop (.exe), and Android (.apk)
        </span>
        <a
          href="https://github.com/spartacus-coder/CampusMesh/releases/latest"
          target="_blank"
          rel="noopener noreferrer"
          class="inline-flex items-center gap-1.5 text-xs text-primary hover:text-primaryHover font-medium transition-colors"
        >
          <span>Latest Release</span>
          <ExternalLink class="h-3.5 w-3.5" />
        </a>
      </div>
    </section>

    <IdentityCardModal v-if="showQrModal" @close="showQrModal = false" />
  </div>
</template>
