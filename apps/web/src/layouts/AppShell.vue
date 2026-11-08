<script setup lang="ts">
import { ref, computed } from "vue";
import { useRouter, useRoute } from "vue-router";
import { useThemeStore } from "../stores/theme";
import { useNetworkStore } from "../stores/network";
import { useChatStore } from "../stores/chat";
import {
  MessageSquare,
  Users,
  Settings,
  Download,
  Sun,
  Moon,
  Command,
  Plus,
  Search,
} from "lucide-vue-next";
import {
  ConnectionStatusBar,
  QuotaAlertBanner,
  OfflineBanner,
  Avatar,
  Badge,
  Input,
  Button,
  CommandPalette,
} from "@campusmesh/ui";

const router = useRouter();
const route = useRoute();
const themeStore = useThemeStore();
const networkStore = useNetworkStore();
const chatStore = useChatStore();

const isCommandPaletteOpen = ref(false);
const searchQuery = ref("");

const isInsideMobileChat = computed(() => {
  return route.path === "/" && chatStore.activeConversationId !== null;
});

const navItems = [
  { id: "chats", label: "Chats", icon: MessageSquare, path: "/" },
  { id: "contacts", label: "Contacts", icon: Users, path: "/contacts" },
  { id: "download", label: "Download", icon: Download, path: "/download" },
  { id: "settings", label: "Settings", icon: Settings, path: "/settings" },
];

function handleNavigate(path: string) {
  router.push(path);
}

const totalNearbyCount = computed(() => {
  return (
    Object.keys(networkStore.lanPeers).length +
    networkStore.wifiDirectPeers.length +
    Object.keys(networkStore.blePeers).length
  );
});

function selectAirGappedPeer(peer: { id: string; name: string; tag: string }) {
  const canonicalId = `conv-${peer.id}`;
  let conv = chatStore.conversations.find(
    (c) => c.id === canonicalId || c.peerFingerprint === peer.id,
  );
  if (!conv) {
    conv = {
      id: canonicalId,
      name: peer.name,
      peerFingerprint: peer.id,
      isGroup: false,
      lastMessagePreview: `Discovered via ${peer.tag}`,
      lastMessageTimestamp: Date.now(),
      unreadCount: 0,
      isPinned: false,
      isArchived: false,
    };
    chatStore.conversations.unshift(conv);
  }
  chatStore.selectConversation(conv.id);
  networkStore.setDirectLan(true);
}

function selectLanPeer(peer: { fingerprint: string; displayName: string }) {
  selectAirGappedPeer({
    id: peer.fingerprint,
    name: peer.displayName,
    tag: "0ms Local Wi-Fi",
  });
}
</script>

<template>
  <div
    class="flex h-full w-full max-h-full flex-col bg-background text-textPrimary overflow-hidden font-sans select-none"
  >
    <!-- Level 1 System Banners -->
    <OfflineBanner v-if="!networkStore.isOnline" />
    <QuotaAlertBanner
      v-if="
        networkStore.signalingState === 'UNAVAILABLE_QUOTA' &&
        !networkStore.isQuotaAlertDismissed
      "
      @switch-manual="networkStore.setDirectLan(true)"
    />

    <!-- Main Responsive Application Body -->
    <div class="flex flex-1 min-h-0 overflow-hidden relative">
      <!-- Desktop Left Navigation Rail (Hidden on mobile) -->
      <aside
        class="hidden md:flex w-16 flex-col items-center justify-between border-r border-border bg-surface py-2.5 z-20 shrink-0 overflow-y-auto"
        aria-label="Desktop Navigation Rail"
      >
        <div class="flex flex-col items-center gap-4 w-full">
          <!-- Logo / Brand Glyph -->
          <div
            class="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-white font-bold shadow-md shadow-primary/20 cursor-pointer active:scale-95 transition-transform"
            title="CampusMesh Home"
            @click="handleNavigate('/')"
          >
            CM
          </div>

          <!-- Main Nav Actions -->
          <nav
            class="flex flex-col items-center gap-1.5 w-full px-2"
            role="navigation"
          >
            <button
              v-for="item in navItems"
              :key="item.id"
              class="relative flex h-9 w-9 items-center justify-center rounded-xl text-textSecondary hover:bg-surface-hover hover:text-textPrimary transition-colors"
              :class="{
                'bg-primary/10 text-primary font-semibold':
                  route.path === item.path,
              }"
              :title="item.label"
              @click="handleNavigate(item.path)"
            >
              <component :is="item.icon" class="h-4 w-4" />
            </button>
          </nav>
        </div>

        <!-- Footer Utilities (Command Palette & Theme Toggle) -->
        <div class="flex flex-col items-center gap-2 w-full px-2">
          <button
            class="flex h-8 w-8 items-center justify-center rounded-lg text-textSecondary hover:bg-surface-hover hover:text-textPrimary transition-colors"
            title="Command Palette (Cmd+K)"
            @click="isCommandPaletteOpen = true"
          >
            <Command class="h-4 w-4" />
          </button>
          <button
            class="flex h-8 w-8 items-center justify-center rounded-lg text-textSecondary hover:bg-surface-hover hover:text-textPrimary transition-colors"
            title="Toggle Dark/Light Theme"
            @click="themeStore.toggleTheme"
          >
            <Sun v-if="themeStore.currentTheme === 'dark'" class="h-4 w-4" />
            <Moon v-else class="h-4 w-4" />
          </button>
          <Avatar
            name="You"
            size="sm"
            is-online
            class="cursor-pointer hover:ring-2 hover:ring-primary transition-all"
          />
        </div>
      </aside>

      <!-- Desktop Sidebar: Conversations Selector Pane -->
      <aside
        v-if="route.path === '/'"
        class="hidden md:flex w-80 flex-col border-r border-border bg-surface shrink-0 z-10 h-full min-h-0 overflow-hidden"
        aria-label="Conversation List"
      >
        <!-- Sidebar Header -->
        <div
          class="p-3 border-b border-border flex items-center justify-between gap-2"
        >
          <h2 class="text-base font-bold text-textPrimary tracking-tight">
            Messages
          </h2>
          <Button
            variant="ghost"
            size="iconSm"
            title="New Chat"
            @click="handleNavigate('/contacts')"
          >
            <Plus class="h-4 w-4" />
          </Button>
        </div>

        <!-- Search Bar -->
        <div class="p-3 border-b border-borderSubtle">
          <div class="relative">
            <Search class="absolute left-2.5 top-2.5 h-4 w-4 text-textMuted" />
            <Input
              v-model="searchQuery"
              placeholder="Search conversations..."
              class="pl-9 h-9 text-xs"
            />
          </div>
        </div>

        <!-- Discovered Air-Gapped Campus Radios (Local LAN, Wi-Fi Direct, BLE Mesh) -->
        <div
          v-if="totalNearbyCount > 0"
          class="px-3 py-2 bg-emerald-500/10 border-b border-emerald-500/20 text-xs text-emerald-600 dark:text-emerald-400 select-none shrink-0"
        >
          <div class="flex items-center justify-between mb-1.5">
            <span class="font-bold flex items-center gap-1.5">
              <span class="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
              Nearby on Campus ({{ totalNearbyCount }})
            </span>
            <span class="text-[10px] opacity-75">Air-Gapped Radios</span>
          </div>
          <div class="space-y-1">
            <!-- Local LAN (Zero-Server UDP Multicast) -->
            <div
              v-for="peer in networkStore.lanPeers"
              :key="peer.fingerprint"
              class="flex items-center justify-between p-1.5 rounded-lg bg-surface/80 border border-emerald-500/30 hover:bg-surface cursor-pointer transition-colors"
              @click="selectLanPeer(peer)"
            >
              <div class="flex items-center gap-2 min-w-0">
                <Avatar :name="peer.displayName" size="sm" :is-online="true" />
                <span class="font-medium truncate text-textPrimary text-xs">{{ peer.displayName }}</span>
              </div>
              <span class="text-[10px] text-emerald-600 dark:text-emerald-400 font-mono">0ms LAN</span>
            </div>

            <!-- Wi-Fi Direct (High-Throughput P2P) -->
            <div
              v-for="peer in networkStore.wifiDirectPeers"
              :key="peer.deviceAddress"
              class="flex items-center justify-between p-1.5 rounded-lg bg-surface/80 border border-cyan-500/30 hover:bg-surface cursor-pointer transition-colors"
              @click="selectAirGappedPeer({ id: peer.deviceAddress, name: peer.deviceName || 'Wi-Fi Direct Peer', tag: 'Wi-Fi Direct' })"
            >
              <div class="flex items-center gap-2 min-w-0">
                <Avatar :name="peer.deviceName || 'Wi-Fi Direct'" size="sm" :is-online="true" />
                <span class="font-medium truncate text-textPrimary text-xs">{{ peer.deviceName || 'Wi-Fi Direct Peer' }}</span>
              </div>
              <span class="text-[10px] text-cyan-600 dark:text-cyan-400 font-mono">Wi-Fi P2P</span>
            </div>

            <!-- BLE Mesh (Ultra-Low Power Off-Grid) -->
            <div
              v-for="peer in networkStore.blePeers"
              :key="peer.deviceAddress"
              class="flex items-center justify-between p-1.5 rounded-lg bg-surface/80 border border-indigo-500/30 hover:bg-surface cursor-pointer transition-colors"
              @click="selectAirGappedPeer({ id: peer.fingerprintHash || peer.deviceAddress, name: peer.deviceName || 'BLE Peer', tag: 'BLE Mesh' })"
            >
              <div class="flex items-center gap-2 min-w-0">
                <Avatar :name="peer.deviceName || 'BLE Mesh'" size="sm" :is-online="true" />
                <span class="font-medium truncate text-textPrimary text-xs">{{ peer.deviceName || 'BLE Peer' }}</span>
              </div>
              <span class="text-[10px] text-indigo-600 dark:text-indigo-400 font-mono">BLE Mesh</span>
            </div>
          </div>
        </div>

        <!-- Virtualized Conversation List Placeholder -->
        <div class="flex-1 overflow-y-auto p-2 space-y-1">
          <div
            v-for="conv in chatStore.conversations"
            :key="conv.id"
            class="flex items-center gap-3 p-2.5 rounded-xl cursor-pointer transition-colors"
            :class="
              chatStore.activeConversationId === conv.id
                ? 'bg-primary/10 border border-primary/20 text-textPrimary'
                : 'hover:bg-surface-hover text-textSecondary'
            "
            @click="chatStore.selectConversation(conv.id)"
          >
            <Avatar :name="conv.name" size="md" :is-online="!conv.isGroup" />
            <div class="flex-1 min-w-0">
              <div class="flex items-center justify-between mb-0.5">
                <span class="text-sm font-semibold text-textPrimary truncate">{{
                  conv.name
                }}</span>
                <span class="text-[10px] text-textMuted">5m</span>
              </div>
              <p class="text-xs text-textSecondary truncate">
                {{ conv.lastMessagePreview }}
              </p>
            </div>
            <Badge
              v-if="conv.unreadCount > 0"
              variant="default"
              class="h-5 px-1.5 text-[10px]"
            >
              {{ conv.unreadCount }}
            </Badge>
          </div>
        </div>

        <!-- Quick Status Bar -->
        <ConnectionStatusBar
          class="shrink-0"
          :signaling-state="networkStore.signalingState"
          :peer-state="networkStore.peerState"
          :is-direct-lan="networkStore.isDirectLan"
        />
      </aside>

      <!-- Main Content / Viewport -->
      <main
        class="flex-1 flex flex-col h-full min-h-0 overflow-hidden bg-background relative"
        role="main"
      >
        <router-view />
      </main>
    </div>

    <!-- Mobile-First Bottom Navigation Bar (Hidden on desktop and inside active mobile chat) -->
    <nav
      v-if="!isInsideMobileChat"
      class="md:hidden flex h-14 border-t border-border bg-surface items-center justify-around px-2 z-30 shrink-0 pb-[env(safe-area-inset-bottom)]"
      aria-label="Mobile Bottom Navigation"
    >
      <button
        v-for="item in navItems"
        :key="item.id"
        class="flex flex-col items-center justify-center flex-1 py-1 text-xs text-textSecondary transition-colors"
        :class="{ 'text-primary font-bold': route.path === item.path }"
        @click="handleNavigate(item.path)"
      >
        <component :is="item.icon" class="h-5 w-5 mb-0.5" />
        <span>{{ item.label }}</span>
      </button>
      <button
        class="flex flex-col items-center justify-center flex-1 py-1 text-xs text-textSecondary transition-colors"
        @click="themeStore.toggleTheme"
      >
        <Sun v-if="themeStore.currentTheme === 'dark'" class="h-5 w-5 mb-0.5" />
        <Moon v-else class="h-5 w-5 mb-0.5" />
        <span>Theme</span>
      </button>
    </nav>

    <!-- Global Command Palette Dialog -->
    <CommandPalette
      :is-open="isCommandPaletteOpen"
      @update:is-open="isCommandPaletteOpen = $event"
      @navigate="handleNavigate"
    />
  </div>
</template>
