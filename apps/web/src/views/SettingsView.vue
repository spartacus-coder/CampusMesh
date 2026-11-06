<script setup lang="ts">
import { useThemeStore } from "../stores/theme";
import { Shield, Database, Moon, Sun, Monitor } from "lucide-vue-next";
import { Button, Badge } from "@campusmesh/ui";

const themeStore = useThemeStore();
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
        Manage local storage, theme appearance, and network diagnostics.
      </p>
    </header>

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
        <span class="text-xs text-textSecondary"
          >Database Status:
          <strong class="text-textPrimary">Healthy (Dexie Engine)</strong></span
        >
        <Button variant="outline" size="sm"> Export Encrypted Backup </Button>
      </div>
    </section>
  </div>
</template>
