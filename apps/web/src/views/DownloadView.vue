<script setup lang="ts">
import { ref, onMounted, computed } from "vue";
import {
  Download,
  Monitor,
  Smartphone,
  Globe,
  ShieldCheck,
  Zap,
  ExternalLink,
  QrCode,
  ArrowRight,
  HardDrive,
} from "lucide-vue-next";
import { Badge } from "@campusmesh/ui";

type DetectedOS = "windows" | "android" | "macos" | "linux" | "ios" | "unknown";

const detectedOS = ref<DetectedOS>("unknown");
const userAgentString = ref("");

onMounted(() => {
  if (typeof navigator !== "undefined") {
    userAgentString.value = navigator.userAgent;
    const ua = navigator.userAgent.toLowerCase();
    if (ua.includes("android")) {
      detectedOS.value = "android";
    } else if (ua.includes("win")) {
      detectedOS.value = "windows";
    } else if (ua.includes("mac") || ua.includes("darwin")) {
      detectedOS.value = "macos";
    } else if (ua.includes("linux")) {
      detectedOS.value = "linux";
    } else if (
      ua.includes("iphone") ||
      ua.includes("ipad") ||
      ua.includes("ipod")
    ) {
      detectedOS.value = "ios";
    } else {
      detectedOS.value = "unknown";
    }
  }
});

const osDisplayName = computed(() => {
  switch (detectedOS.value) {
    case "windows":
      return "Windows (64-bit)";
    case "android":
      return "Android";
    case "macos":
      return "macOS";
    case "linux":
      return "Linux";
    case "ios":
      return "iOS (Web PWA)";
    default:
      return "Web Browser";
  }
});

const githubReleaseUrl =
  "https://github.com/spartacus-coder/CampusMesh/releases/tag/v1.0.0";
const windowsDownloadUrl =
  "https://github.com/spartacus-coder/CampusMesh/releases/download/v1.0.0/CampusMesh_1.0.0_x64-setup.exe";
const androidDownloadUrl =
  "https://github.com/spartacus-coder/CampusMesh/releases/download/v1.0.0/CampusMesh_1.0.0.apk";
const webAppUrl = "https://spartacus-coder.github.io/CampusMesh/";
</script>

<template>
  <div class="h-full w-full overflow-y-auto bg-background text-textPrimary p-4 md:p-8">
    <div class="max-w-4xl mx-auto flex flex-col gap-8 pb-12">
      <!-- Hero Header -->
      <header class="flex flex-col items-center text-center gap-3">
        <div class="flex items-center gap-2">
          <div
            class="h-10 w-10 rounded-xl bg-primary flex items-center justify-center text-white font-bold text-lg shadow-lg shadow-primary/20"
          >
            CM
          </div>
          <span class="text-xs uppercase tracking-wider font-semibold text-primary bg-primary/10 px-2.5 py-1 rounded-full">
            v1.0.0 Production Release
          </span>
        </div>
        <h1 class="text-3xl md:text-5xl font-extrabold tracking-tight">
          Download CampusMesh
        </h1>
        <p class="text-base md:text-lg text-textSecondary max-w-2xl">
          Zero-cost, decentralized, cross-platform private communication with
          Double Ratchet E2EE, direct WebRTC mesh, and offline-first storage.
        </p>
      </header>

      <!-- Dynamic OS Detection Banner -->
      <section
        class="border-2 border-primary/40 bg-surface rounded-2xl p-6 md:p-8 shadow-xl flex flex-col md:flex-row items-center justify-between gap-6 relative overflow-hidden"
      >
        <div class="absolute -right-12 -top-12 h-40 w-40 bg-primary/10 rounded-full blur-2xl pointer-events-none" />

        <div class="flex items-start gap-4">
          <div class="p-3.5 rounded-2xl bg-primary/10 text-primary shrink-0">
            <Monitor v-if="detectedOS === 'windows' || detectedOS === 'macos' || detectedOS === 'linux'" class="h-8 w-8" />
            <Smartphone v-else-if="detectedOS === 'android' || detectedOS === 'ios'" class="h-8 w-8" />
            <Globe v-else class="h-8 w-8" />
          </div>

          <div class="flex flex-col gap-1.5">
            <div class="flex items-center gap-2">
              <Badge variant="success">Compatible with your device</Badge>
              <span class="text-xs text-textMuted font-mono">Auto-detected</span>
            </div>
            <h2 class="text-xl md:text-2xl font-bold">
              CampusMesh for {{ osDisplayName }}
            </h2>
            <p class="text-sm text-textSecondary max-w-md">
              <template v-if="detectedOS === 'windows'">
                Native Tauri 2 desktop app with NSIS installer, deep linking (campusmesh://), and lightweight performance.
              </template>
              <template v-else-if="detectedOS === 'android'">
                Native Capacitor 8 Android app with Wi-Fi multicast lock for offline LAN peer discovery.
              </template>
              <template v-else>
                Universal Progressive Web App (PWA) with full offline support and instant browser pairing.
              </template>
            </p>
          </div>
        </div>

        <div class="flex flex-col sm:flex-row gap-3 w-full md:w-auto shrink-0">
          <a
            v-if="detectedOS === 'windows'"
            :href="windowsDownloadUrl"
            class="flex items-center justify-center gap-2 bg-primary hover:bg-primaryHover text-white px-6 py-3.5 rounded-xl font-semibold shadow-lg shadow-primary/25 transition-all text-sm w-full md:w-auto"
          >
            <Download class="h-4 w-4" />
            Download for Windows (.exe)
          </a>
          <a
            v-else-if="detectedOS === 'android'"
            :href="androidDownloadUrl"
            class="flex items-center justify-center gap-2 bg-primary hover:bg-primaryHover text-white px-6 py-3.5 rounded-xl font-semibold shadow-lg shadow-primary/25 transition-all text-sm w-full md:w-auto"
          >
            <Download class="h-4 w-4" />
            Download for Android (.apk)
          </a>
          <router-link
            v-else
            to="/"
            class="flex items-center justify-center gap-2 bg-primary hover:bg-primaryHover text-white px-6 py-3.5 rounded-xl font-semibold shadow-lg shadow-primary/25 transition-all text-sm w-full md:w-auto"
          >
            <Zap class="h-4 w-4" />
            Open Web App
          </router-link>
        </div>
      </section>

      <!-- Multi-Platform Download Matrix -->
      <section class="flex flex-col gap-4">
        <h2 class="text-xl font-bold tracking-tight">All Target Platforms</h2>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
          <!-- Windows Desktop Card -->
          <div
            class="border border-border bg-surface rounded-2xl p-5 flex flex-col justify-between gap-4 hover:border-primary/50 transition-colors"
          >
            <div class="flex flex-col gap-3">
              <div class="flex items-center justify-between">
                <div class="p-2.5 rounded-xl bg-surfaceSubtle text-primary">
                  <Monitor class="h-6 w-6" />
                </div>
                <Badge variant="outline">Desktop</Badge>
              </div>
              <h3 class="text-lg font-bold">Windows (x64)</h3>
              <p class="text-xs text-textSecondary leading-relaxed">
                Tauri 2 NSIS installer package. Native tray integration, secure storage, and hardware acceleration.
              </p>
              <div class="flex flex-col gap-1 text-xs text-textMuted font-mono">
                <span>Requirements: Windows 10/11</span>
                <span>Package: .exe (x64 NSIS)</span>
                <span>Size: ~12 MB</span>
              </div>
            </div>

            <div class="flex flex-col gap-2 pt-2">
              <a
                :href="windowsDownloadUrl"
                class="flex items-center justify-center gap-2 bg-primary/10 hover:bg-primary text-primary hover:text-white px-4 py-2.5 rounded-xl font-medium text-xs transition-colors"
              >
                <Download class="h-4 w-4" />
                Download Setup (.exe)
              </a>
            </div>
          </div>

          <!-- Android Card -->
          <div
            class="border border-border bg-surface rounded-2xl p-5 flex flex-col justify-between gap-4 hover:border-primary/50 transition-colors"
          >
            <div class="flex flex-col gap-3">
              <div class="flex items-center justify-between">
                <div class="p-2.5 rounded-xl bg-surfaceSubtle text-success">
                  <Smartphone class="h-6 w-6" />
                </div>
                <Badge variant="outline">Mobile</Badge>
              </div>
              <h3 class="text-lg font-bold">Android (APK)</h3>
              <p class="text-xs text-textSecondary leading-relaxed">
                Capacitor 8 native Android application with foreground background service and Wi-Fi multicast for offline mesh.
              </p>
              <div class="flex flex-col gap-1 text-xs text-textMuted font-mono">
                <span>Requirements: Android 8.0+</span>
                <span>Package: Universal .apk</span>
                <span>Size: ~8 MB</span>
              </div>
            </div>

            <div class="flex flex-col gap-2 pt-2">
              <a
                :href="androidDownloadUrl"
                class="flex items-center justify-center gap-2 bg-success/10 hover:bg-success text-success hover:text-white px-4 py-2.5 rounded-xl font-medium text-xs transition-colors"
              >
                <Download class="h-4 w-4" />
                Download Android (.apk)
              </a>
            </div>
          </div>

          <!-- Web PWA Card -->
          <div
            class="border border-border bg-surface rounded-2xl p-5 flex flex-col justify-between gap-4 hover:border-primary/50 transition-colors"
          >
            <div class="flex flex-col gap-3">
              <div class="flex items-center justify-between">
                <div class="p-2.5 rounded-xl bg-surfaceSubtle text-accent">
                  <Globe class="h-6 w-6" />
                </div>
                <Badge variant="outline">Web PWA</Badge>
              </div>
              <h3 class="text-lg font-bold">Web Application</h3>
              <p class="text-xs text-textSecondary leading-relaxed">
                Zero-install Progressive Web App. Runs in any modern browser with service workers and IndexedDB persistence.
              </p>
              <div class="flex flex-col gap-1 text-xs text-textMuted font-mono">
                <span>Browsers: Chrome, Firefox, Safari</span>
                <span>Storage: IndexedDB (Local)</span>
                <span>Installable: Yes (PWA)</span>
              </div>
            </div>

            <div class="flex flex-col gap-2 pt-2">
              <router-link
                to="/"
                class="flex items-center justify-center gap-2 bg-accent/10 hover:bg-accent text-accent hover:text-white px-4 py-2.5 rounded-xl font-medium text-xs transition-colors"
              >
                <ArrowRight class="h-4 w-4" />
                Launch Web App
              </router-link>
            </div>
          </div>
        </div>
      </section>

      <!-- Mobile QR Code / Instant Pair Section -->
      <section
        class="border border-border bg-surface rounded-2xl p-6 flex flex-col md:flex-row items-center justify-between gap-6"
      >
        <div class="flex items-start gap-4">
          <div class="p-3 rounded-xl bg-surfaceSubtle text-primary shrink-0">
            <QrCode class="h-7 w-7" />
          </div>
          <div class="flex flex-col gap-1">
            <h3 class="text-lg font-bold">Install on Mobile or Desktop</h3>
            <p class="text-sm text-textSecondary max-w-lg">
              Scan this QR code with your mobile camera or another device to open the web app instantly or download the Android APK.
            </p>
          </div>
        </div>

        <div class="p-3 bg-white rounded-xl shadow-md shrink-0 flex items-center justify-center">
          <img
            :src="`https://api.qrserver.com/v1/create-qr-code/?size=130x130&data=${encodeURIComponent(webAppUrl)}`"
            alt="CampusMesh Mobile QR"
            class="h-28 w-28"
          />
        </div>
      </section>

      <!-- Key Zero-Cost Principles Checklist -->
      <section class="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div class="flex items-start gap-3 p-4 border border-border bg-surface rounded-xl">
          <ShieldCheck class="h-5 w-5 text-success shrink-0 mt-0.5" />
          <div class="flex flex-col">
            <h4 class="text-sm font-semibold">Double Ratchet E2EE</h4>
            <p class="text-xs text-textSecondary">
              End-to-end encrypted with Forward Secrecy and Post-Compromise Security.
            </p>
          </div>
        </div>

        <div class="flex items-start gap-3 p-4 border border-border bg-surface rounded-xl">
          <HardDrive class="h-5 w-5 text-primary shrink-0 mt-0.5" />
          <div class="flex flex-col">
            <h4 class="text-sm font-semibold">100% Local-First</h4>
            <p class="text-xs text-textSecondary">
              Keys, contacts, and message history remain exclusively on your device.
            </p>
          </div>
        </div>

        <div class="flex items-start gap-3 p-4 border border-border bg-surface rounded-xl">
          <Zap class="h-5 w-5 text-accent shrink-0 mt-0.5" />
          <div class="flex flex-col">
            <h4 class="text-sm font-semibold">$0.00/Month Zero-Cost</h4>
            <p class="text-xs text-textSecondary">
              No commercial servers, paid subscriptions, or proprietary locks.
            </p>
          </div>
        </div>
      </section>

      <!-- Footer Info -->
      <footer class="flex flex-col md:flex-row items-center justify-between text-xs text-textMuted border-t border-border pt-6 gap-3">
        <span>CampusMesh v1.0.0 — Licensed under MIT</span>
        <div class="flex items-center gap-4">
          <a
            :href="githubReleaseUrl"
            target="_blank"
            rel="noopener noreferrer"
            class="hover:text-textPrimary flex items-center gap-1 transition-colors"
          >
            GitHub Releases <ExternalLink class="h-3 w-3" />
          </a>
          <router-link to="/settings" class="hover:text-textPrimary transition-colors">
            App Settings
          </router-link>
        </div>
      </footer>
    </div>
  </div>
</template>
