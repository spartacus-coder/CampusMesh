<script setup lang="ts">
import { onMounted } from "vue";
import { useThemeStore } from "./stores/theme";
import { useNetworkStore } from "./stores/network";
import { useIdentityStore } from "./stores/identity";
import AppShell from "./layouts/AppShell.vue";
import IdentityModal from "./components/IdentityModal.vue";

const themeStore = useThemeStore();
const networkStore = useNetworkStore();
const identityStore = useIdentityStore();

onMounted(async () => {
  themeStore.initTheme();
  networkStore.initNetworkListeners();
  await identityStore.checkInitialization();
});
</script>

<template>
  <AppShell />
  <IdentityModal
    v-if="!identityStore.isUnlocked || identityStore.mnemonicBackupPhrase"
  />
</template>
