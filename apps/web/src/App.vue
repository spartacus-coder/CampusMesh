<script setup lang="ts">
import { onMounted } from "vue";
import { useThemeStore } from "./stores/theme";
import { useNetworkStore } from "./stores/network";
import AppShell from "./layouts/AppShell.vue";

const themeStore = useThemeStore();
const networkStore = useNetworkStore();

onMounted(() => {
  themeStore.initTheme();
  networkStore.initNetworkListeners();
});
</script>

<template>
  <AppShell />
</template>
