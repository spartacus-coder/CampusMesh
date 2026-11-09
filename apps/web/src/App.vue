<script setup lang="ts">
import { onMounted, watch } from "vue";
import { useThemeStore } from "./stores/theme";
import { useNetworkStore } from "./stores/network";
import { useIdentityStore } from "./stores/identity";
import { useChatStore } from "./stores/chat";
import AppShell from "./layouts/AppShell.vue";
import IdentityModal from "./components/IdentityModal.vue";
import { nativeService } from "./services/native";

const themeStore = useThemeStore();
const networkStore = useNetworkStore();
const identityStore = useIdentityStore();
const chatStore = useChatStore();

watch(
  () =>
    [identityStore.isUnlocked, identityStore.identity?.fingerprint] as const,
  ([unlocked, fp]) => {
    if (unlocked && fp) {
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
