import { defineStore } from "pinia";
import { ref, computed } from "vue";
import type { IdentityProfile } from "@campusmesh/shared-types";
import {
  IdentityManager,
  type ActiveIdentitySession,
  type IdentityQrPayload,
} from "@campusmesh/identity";
import {
  DexieStorageAdapter,
  InMemoryStorageAdapter,
  type IStoragePort,
} from "@campusmesh/storage";

let storageInstance: IStoragePort | null = null;
function getStorage(): IStoragePort {
  if (!storageInstance) {
    storageInstance =
      typeof indexedDB !== "undefined"
        ? new DexieStorageAdapter("CampusMeshWebDB")
        : new InMemoryStorageAdapter();
  }
  return storageInstance;
}

export const useIdentityStore = defineStore("identity", () => {
  let identityManager: IdentityManager = new IdentityManager(getStorage());

  const identity = ref<IdentityProfile | null>(null);
  const isInitialized = ref(false);
  const isUnlocked = ref(false);
  const mnemonicBackupPhrase = ref<string | null>(null);
  const error = ref<string | null>(null);

  const formattedSafetyFingerprint = computed(() => {
    if (!identity.value?.fingerprint) return "";
    return (
      identity.value.fingerprint.match(/.{1,4}/g)?.join(" ") ??
      identity.value.fingerprint
    );
  });

  function setStorageAdapter(storage: IStoragePort) {
    storageInstance = storage;
    identityManager = new IdentityManager(storage);
  }

  async function checkInitialization(): Promise<boolean> {
    try {
      isInitialized.value = await identityManager.isInitialized();
      if (isInitialized.value) {
        const storedIdentity = await getStorage().getIdentity();
        identity.value = storedIdentity;
      }
      isUnlocked.value = identityManager.isUnlocked();
      return isInitialized.value;
    } catch (err: unknown) {
      error.value = err instanceof Error ? err.message : String(err);
      return false;
    }
  }

  async function createIdentity(displayName: string, passphrase: string) {
    error.value = null;
    try {
      const result = await identityManager.createIdentity(
        displayName,
        passphrase,
      );
      identity.value = result.identity;
      mnemonicBackupPhrase.value = result.mnemonic;
      isInitialized.value = true;
      isUnlocked.value = true;
      return result;
    } catch (err: unknown) {
      error.value = err instanceof Error ? err.message : String(err);
      throw err;
    }
  }

  async function restoreFromMnemonic(
    mnemonic: string,
    displayName: string,
    passphrase: string,
  ) {
    error.value = null;
    try {
      const restored = await identityManager.restoreFromMnemonic(
        mnemonic,
        displayName,
        passphrase,
      );
      identity.value = restored;
      mnemonicBackupPhrase.value = null;
      isInitialized.value = true;
      isUnlocked.value = true;
      return restored;
    } catch (err: unknown) {
      error.value = err instanceof Error ? err.message : String(err);
      throw err;
    }
  }

  async function unlock(passphrase: string): Promise<ActiveIdentitySession> {
    error.value = null;
    try {
      const session = await identityManager.unlockIdentity(passphrase);
      identity.value = session.identity;
      isUnlocked.value = true;
      return session;
    } catch (err: unknown) {
      error.value = err instanceof Error ? err.message : String(err);
      throw err;
    }
  }

  function lock() {
    identityManager.lockIdentity();
    isUnlocked.value = false;
  }

  async function exportBackup(passphrase: string): Promise<string> {
    return identityManager.exportBackup(passphrase);
  }

  async function importBackup(jsonString: string, passphrase: string) {
    error.value = null;
    try {
      const imported = await identityManager.importBackup(
        jsonString,
        passphrase,
      );
      identity.value = imported;
      isInitialized.value = true;
      isUnlocked.value = true;
      return imported;
    } catch (err: unknown) {
      error.value = err instanceof Error ? err.message : String(err);
      throw err;
    }
  }

  function getQrPayload(): IdentityQrPayload {
    return identityManager.generateQrPayload();
  }

  function clearMnemonicBackup() {
    mnemonicBackupPhrase.value = null;
  }

  return {
    identity,
    isInitialized,
    isUnlocked,
    mnemonicBackupPhrase,
    error,
    formattedSafetyFingerprint,
    setStorageAdapter,
    checkInitialization,
    createIdentity,
    restoreFromMnemonic,
    unlock,
    lock,
    exportBackup,
    importBackup,
    getQrPayload,
    clearMnemonicBackup,
  };
});
