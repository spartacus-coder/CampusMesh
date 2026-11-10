<script setup lang="ts">
import { onMounted, watch } from "vue";
import { useThemeStore } from "./stores/theme";
import { useNetworkStore } from "./stores/network";
import { useIdentityStore } from "./stores/identity";
import { useChatStore } from "./stores/chat";
import { useCallStore } from "./stores/call";
import { useContactsStore } from "./stores/contacts";
import AppShell from "./layouts/AppShell.vue";
import IdentityModal from "./components/IdentityModal.vue";
import { nativeService } from "./services/native";
import { initCallAudioUnlock } from "./services/ringtone";

const themeStore = useThemeStore();
const networkStore = useNetworkStore();
const identityStore = useIdentityStore();
const chatStore = useChatStore();
const callStore = useCallStore();
const contactsStore = useContactsStore();

watch(
  () =>
    [identityStore.isUnlocked, identityStore.identity?.fingerprint] as const,
  ([unlocked, fp]) => {
    if (unlocked && fp) {
      contactsStore.setLocalFingerprint(fp);
      void contactsStore.loadContacts();
      callStore.setLocalFingerprint(fp);
      callStore.setLocalDisplayName(identityStore.identity?.displayName || "");
      networkStore.connectUserSignaling(fp);
      networkStore.startAirGappedMesh(
        fp,
        identityStore.identity?.displayName || "Peer",
      );
    }
  },
  { immediate: true },
);

onMounted(async () => {
  initCallAudioUnlock();
  themeStore.initTheme();
  networkStore.initNetworkListeners();
  try {
    await identityStore.checkInitialization();
  } catch (err) {
    console.warn("[App] Identity checkInitialization failed:", err);
  }
  try {
    await nativeService.initNativeServices();
  } catch (err) {
    console.warn("[App] Native services init failed:", err);
  }
  try {
    await contactsStore.loadContacts();
  } catch (err) {
    console.warn("[App] Contacts preload failed:", err);
  }
  try {
    await chatStore.initConversations();
  } catch (err) {
    console.warn("[App] Chat conversations init failed:", err);
  }
});
</script>

<template>
  <div class="h-full w-full overflow-hidden flex flex-col">
    <AppShell />
    <IdentityModal
      v-if="!identityStore.isUnlocked || identityStore.mnemonicBackupPhrase"
    />
  </div>
</template>
