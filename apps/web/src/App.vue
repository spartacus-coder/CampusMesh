<script setup lang="ts">
import { onMounted, watch } from "vue";
import { useThemeStore } from "./stores/theme";
import { useNetworkStore } from "./stores/network";
import { useIdentityStore } from "./stores/identity";
import AppShell from "./layouts/AppShell.vue";
import IdentityModal from "./components/IdentityModal.vue";
import { nativeService } from "./services/native";

const themeStore = useThemeStore();
const networkStore = useNetworkStore();
const identityStore = useIdentityStore();

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
  await identityStore.checkInitialization();
  await nativeService.initNativeServices();
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
