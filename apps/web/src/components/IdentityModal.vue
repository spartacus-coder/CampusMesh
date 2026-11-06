<script setup lang="ts">
import { ref } from "vue";
import { useIdentityStore } from "../stores/identity";
import { Button, Input } from "@campusmesh/ui";
import {
  KeyRound,
  ShieldAlert,
  Copy,
  Check,
  Lock,
  RefreshCw,
  FileText,
} from "lucide-vue-next";

const identityStore = useIdentityStore();

const activeTab = ref<"create" | "restore" | "import" | "unlock">("create");
const displayName = ref("");
const passphrase = ref("");
const confirmPassphrase = ref("");
const mnemonicInput = ref("");
const backupJsonInput = ref("");
const isConfirmedBackedUp = ref(false);
const isCopied = ref(false);
const loading = ref(false);
const localError = ref<string | null>(null);

function switchTab(tab: "create" | "restore" | "import" | "unlock") {
  activeTab.value = tab;
  localError.value = null;
}

async function handleCreate() {
  localError.value = null;
  if (!displayName.value.trim()) {
    localError.value = "Please provide a display name.";
    return;
  }
  if (passphrase.value.length < 8) {
    localError.value = "Passphrase must be at least 8 characters long.";
    return;
  }
  if (passphrase.value !== confirmPassphrase.value) {
    localError.value = "Passphrases do not match.";
    return;
  }

  loading.value = true;
  try {
    await identityStore.createIdentity(
      displayName.value.trim(),
      passphrase.value,
    );
  } catch (err: any) {
    localError.value = err.message;
  } finally {
    loading.value = false;
  }
}

async function handleRestore() {
  localError.value = null;
  const words = mnemonicInput.value.trim().split(/\s+/);
  if (words.length !== 24) {
    localError.value = `Recovery phrase must contain exactly 24 words (got ${words.length}).`;
    return;
  }
  if (passphrase.value.length < 8) {
    localError.value = "Passphrase must be at least 8 characters long.";
    return;
  }
  if (passphrase.value !== confirmPassphrase.value) {
    localError.value = "Passphrases do not match.";
    return;
  }

  loading.value = true;
  try {
    await identityStore.restoreFromMnemonic(
      mnemonicInput.value.trim(),
      displayName.value.trim() || "Restored User",
      passphrase.value,
    );
  } catch (err: any) {
    localError.value = err.message;
  } finally {
    loading.value = false;
  }
}

async function handleUnlock() {
  localError.value = null;
  if (!passphrase.value) {
    localError.value = "Please enter your passphrase.";
    return;
  }

  loading.value = true;
  try {
    await identityStore.unlock(passphrase.value);
  } catch (err: any) {
    localError.value =
      err.message || "Incorrect passphrase. Failed to unlock keystore.";
  } finally {
    loading.value = false;
  }
}

async function handleImportBackup() {
  localError.value = null;
  if (!backupJsonInput.value.trim()) {
    localError.value = "Please paste your backup JSON file content.";
    return;
  }
  if (!passphrase.value) {
    localError.value =
      "Please enter the passphrase used to encrypt this backup.";
    return;
  }

  loading.value = true;
  try {
    await identityStore.importBackup(
      backupJsonInput.value.trim(),
      passphrase.value,
    );
  } catch (err: any) {
    localError.value = err.message;
  } finally {
    loading.value = false;
  }
}

function copyMnemonic() {
  if (identityStore.mnemonicBackupPhrase) {
    navigator.clipboard.writeText(identityStore.mnemonicBackupPhrase);
    isCopied.value = true;
    setTimeout(() => {
      isCopied.value = false;
    }, 2000);
  }
}

function completeOnboarding() {
  identityStore.clearMnemonicBackup();
}
</script>

<template>
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
  >
    <div
      class="bg-surface border border-border rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-200"
    >
      <!-- Sub-screen: Display generated 24-word recovery phrase -->
      <template v-if="identityStore.mnemonicBackupPhrase">
        <div class="text-center space-y-2">
          <div
            class="inline-flex p-3 rounded-full bg-warning/10 text-warning border border-warning/20 mb-1"
          >
            <ShieldAlert class="h-6 w-6" />
          </div>
          <h2 class="text-lg font-bold text-textPrimary tracking-tight">
            Your 24-Word Recovery Phrase
          </h2>
          <p class="text-xs text-textSecondary max-w-md mx-auto">
            CampusMesh is decentralized. There are no servers, emails, or
            passwords to reset your account. Write these down in order and store
            them securely offline.
          </p>
        </div>

        <div
          class="grid grid-cols-3 sm:grid-cols-4 gap-2 bg-surface-subtle p-4 rounded-xl border border-borderSubtle select-all font-mono text-xs max-h-56 overflow-y-auto"
        >
          <div
            v-for="(word, idx) in identityStore.mnemonicBackupPhrase.split(' ')"
            :key="idx"
            class="flex items-center gap-1.5 py-1 px-2 rounded bg-surface border border-border"
          >
            <span class="text-textSecondary text-[10px]">{{ idx + 1 }}.</span>
            <span class="font-medium text-textPrimary">{{ word }}</span>
          </div>
        </div>

        <div class="flex items-center justify-between">
          <Button
            variant="outline"
            size="sm"
            class="gap-1.5"
            @click="copyMnemonic"
          >
            <Check v-if="isCopied" class="h-4 w-4 text-success" />
            <Copy v-else class="h-4 w-4" />
            <span>{{ isCopied ? "Copied to Clipboard" : "Copy Words" }}</span>
          </Button>

          <label
            class="flex items-center gap-2 cursor-pointer text-xs text-textSecondary"
          >
            <input
              v-model="isConfirmedBackedUp"
              type="checkbox"
              class="rounded border-border text-primary focus:ring-primary h-4 w-4"
            />
            <span>I have saved my recovery phrase</span>
          </label>
        </div>

        <Button
          class="w-full mt-4"
          :disabled="!isConfirmedBackedUp"
          @click="completeOnboarding"
        >
          Enter CampusMesh
        </Button>
      </template>

      <!-- Sub-screen: When Vault is Initialized but Locked -->
      <template
        v-else-if="identityStore.isInitialized && !identityStore.isUnlocked"
      >
        <div class="text-center space-y-2">
          <div
            class="inline-flex p-3 rounded-full bg-primary/10 text-primary border border-primary/20 mb-1"
          >
            <Lock class="h-6 w-6" />
          </div>
          <h2 class="text-lg font-bold text-textPrimary tracking-tight">
            Unlock Your Vault
          </h2>
          <p class="text-xs text-textSecondary">
            Enter your passphrase to decrypt your local cryptographic identity
            keys.
          </p>
        </div>

        <form class="space-y-4" @submit.prevent="handleUnlock">
          <div>
            <label class="block text-xs font-medium text-textSecondary mb-1.5"
              >Passphrase</label
            >
            <Input
              v-model="passphrase"
              type="password"
              placeholder="Enter local passphrase..."
              required
              autofocus
            />
          </div>

          <div
            v-if="localError || identityStore.error"
            class="p-3 text-xs rounded-lg bg-danger/10 border border-danger/20 text-danger"
          >
            {{ localError || identityStore.error }}
          </div>

          <Button type="submit" class="w-full gap-2" :disabled="loading">
            <Lock class="h-4 w-4" />
            <span>{{ loading ? "Decrypting..." : "Unlock Identity" }}</span>
          </Button>
        </form>
      </template>

      <!-- Sub-screen: First-time Onboarding (Create, Restore, Import) -->
      <template v-else>
        <div
          class="flex items-center justify-between border-b border-border pb-3"
        >
          <div class="flex items-center gap-2">
            <KeyRound class="h-5 w-5 text-primary" />
            <h2 class="text-base font-bold text-textPrimary">
              Cryptographic Identity
            </h2>
          </div>
          <div
            class="flex gap-1 bg-surface-subtle p-0.5 rounded-lg border border-border"
          >
            <button
              class="px-2.5 py-1 text-xs rounded-md font-medium transition-colors"
              :class="
                activeTab === 'create'
                  ? 'bg-surface text-primary shadow-sm font-semibold'
                  : 'text-textSecondary hover:text-textPrimary'
              "
              @click="switchTab('create')"
            >
              New
            </button>
            <button
              class="px-2.5 py-1 text-xs rounded-md font-medium transition-colors"
              :class="
                activeTab === 'restore'
                  ? 'bg-surface text-primary shadow-sm font-semibold'
                  : 'text-textSecondary hover:text-textPrimary'
              "
              @click="switchTab('restore')"
            >
              Restore Phrase
            </button>
            <button
              class="px-2.5 py-1 text-xs rounded-md font-medium transition-colors"
              :class="
                activeTab === 'import'
                  ? 'bg-surface text-primary shadow-sm font-semibold'
                  : 'text-textSecondary hover:text-textPrimary'
              "
              @click="switchTab('import')"
            >
              Import Backup
            </button>
          </div>
        </div>

        <!-- CREATE TAB -->
        <form
          v-if="activeTab === 'create'"
          class="space-y-4"
          @submit.prevent="handleCreate"
        >
          <div>
            <label class="block text-xs font-medium text-textSecondary mb-1.5"
              >Display Name / Alias</label
            >
            <Input
              v-model="displayName"
              placeholder="e.g. Alice Scholar"
              required
            />
          </div>

          <div>
            <label class="block text-xs font-medium text-textSecondary mb-1.5"
              >Local Keystore Passphrase (min 8 chars)</label
            >
            <Input
              v-model="passphrase"
              type="password"
              placeholder="Strong passphrase to encrypt private keys..."
              required
            />
          </div>

          <div>
            <label class="block text-xs font-medium text-textSecondary mb-1.5"
              >Confirm Passphrase</label
            >
            <Input
              v-model="confirmPassphrase"
              type="password"
              placeholder="Confirm passphrase..."
              required
            />
          </div>

          <div
            v-if="localError"
            class="p-3 text-xs rounded-lg bg-danger/10 border border-danger/20 text-danger"
          >
            {{ localError }}
          </div>

          <Button type="submit" class="w-full gap-2" :disabled="loading">
            <KeyRound class="h-4 w-4" />
            <span>{{
              loading ? "Deriving Keys..." : "Generate Cryptographic Identity"
            }}</span>
          </Button>
        </form>

        <!-- RESTORE TAB -->
        <form
          v-else-if="activeTab === 'restore'"
          class="space-y-4"
          @submit.prevent="handleRestore"
        >
          <div>
            <label class="block text-xs font-medium text-textSecondary mb-1.5"
              >24-Word Recovery Phrase</label
            >
            <textarea
              v-model="mnemonicInput"
              rows="3"
              class="w-full rounded-md border border-border bg-surface px-3 py-2 text-xs font-mono text-textPrimary placeholder:text-textSecondary focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon art"
              required
            />
          </div>

          <div>
            <label class="block text-xs font-medium text-textSecondary mb-1.5"
              >Display Name</label
            >
            <Input
              v-model="displayName"
              placeholder="e.g. Alice Scholar"
              required
            />
          </div>

          <div>
            <label class="block text-xs font-medium text-textSecondary mb-1.5"
              >New Local Keystore Passphrase</label
            >
            <Input
              v-model="passphrase"
              type="password"
              placeholder="Passphrase to encrypt keys on this device..."
              required
            />
          </div>

          <div>
            <label class="block text-xs font-medium text-textSecondary mb-1.5"
              >Confirm Passphrase</label
            >
            <Input
              v-model="confirmPassphrase"
              type="password"
              placeholder="Confirm passphrase..."
              required
            />
          </div>

          <div
            v-if="localError"
            class="p-3 text-xs rounded-lg bg-danger/10 border border-danger/20 text-danger"
          >
            {{ localError }}
          </div>

          <Button type="submit" class="w-full gap-2" :disabled="loading">
            <RefreshCw class="h-4 w-4" />
            <span>{{
              loading ? "Restoring..." : "Restore Identity from Mnemonic"
            }}</span>
          </Button>
        </form>

        <!-- IMPORT BACKUP TAB -->
        <form
          v-else-if="activeTab === 'import'"
          class="space-y-4"
          @submit.prevent="handleImportBackup"
        >
          <div>
            <label class="block text-xs font-medium text-textSecondary mb-1.5"
              >Backup File Content (JSON)</label
            >
            <textarea
              v-model="backupJsonInput"
              rows="4"
              class="w-full rounded-md border border-border bg-surface px-3 py-2 text-xs font-mono text-textPrimary placeholder:text-textSecondary focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder='Paste content of your exported {"version": 1, "app": "CampusMesh", ...} backup file'
              required
            />
          </div>

          <div>
            <label class="block text-xs font-medium text-textSecondary mb-1.5"
              >Backup Encryption Passphrase</label
            >
            <Input
              v-model="passphrase"
              type="password"
              placeholder="Passphrase used when exporting this backup..."
              required
            />
          </div>

          <div
            v-if="localError"
            class="p-3 text-xs rounded-lg bg-danger/10 border border-danger/20 text-danger"
          >
            {{ localError }}
          </div>

          <Button type="submit" class="w-full gap-2" :disabled="loading">
            <FileText class="h-4 w-4" />
            <span>{{
              loading ? "Importing..." : "Import Encrypted Keystore"
            }}</span>
          </Button>
        </form>
      </template>
    </div>
  </div>
</template>
