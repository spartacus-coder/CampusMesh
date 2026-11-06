<script setup lang="ts">
import { ref } from "vue";
import { UserPlus, QrCode, ShieldCheck, Search } from "lucide-vue-next";
import { Avatar, Button, Input, Badge } from "@campusmesh/ui";
import type { Contact } from "@campusmesh/shared-types";

const searchQuery = ref("");

const contacts = ref<Contact[]>([
  {
    id: "c1",
    fingerprint: "fp_e3b0c44298fc1c149afbf4c8996fb924",
    displayName: "Alice (Security Lead)",
    safetyNumber: "4920 1849 2049 8291 9301 8492",
    isVerified: true,
    isBlocked: false,
  },
  {
    id: "c2",
    fingerprint: "fp_a1b2c3d4e5f60718293a4b5c6d7e8f90",
    displayName: "Bob (Transport)",
    safetyNumber: "1029 3847 5610 2938 4756 1029",
    isVerified: true,
    isBlocked: false,
  },
  {
    id: "c3",
    fingerprint: "fp_f47ac10b58cc4372a5670e02b2c3d479",
    displayName: "Campus Study Circle",
    safetyNumber: "9920 1149 2049 8291 9301 8888",
    isVerified: false,
    isBlocked: false,
  },
]);
</script>

<template>
  <div class="flex-1 flex flex-col h-full overflow-hidden bg-background">
    <!-- Header -->
    <header
      class="flex h-16 items-center justify-between border-b border-border bg-surface px-6 shrink-0"
    >
      <h1 class="text-base font-bold text-textPrimary tracking-tight">
        Contacts & Identities
      </h1>
      <div class="flex items-center gap-2">
        <Button variant="outline" size="sm" class="gap-1.5">
          <QrCode class="h-4 w-4 text-primary" />
          <span>My QR Card</span>
        </Button>
        <Button variant="default" size="sm" class="gap-1.5">
          <UserPlus class="h-4 w-4" />
          <span>Add Contact</span>
        </Button>
      </div>
    </header>

    <!-- Search Bar -->
    <div class="p-6 pb-2 max-w-4xl mx-auto w-full">
      <div class="relative">
        <Search class="absolute left-3 top-3 h-4 w-4 text-textMuted" />
        <Input
          v-model="searchQuery"
          placeholder="Search contacts by name or fingerprint..."
          class="pl-10 h-10"
        />
      </div>
    </div>

    <!-- Contact List -->
    <div class="flex-1 overflow-y-auto p-6 max-w-4xl mx-auto w-full space-y-3">
      <div
        v-for="contact in contacts"
        :key="contact.id"
        class="flex items-center justify-between p-4 rounded-xl border border-border bg-surface hover:border-primary/40 transition-colors shadow-xs"
      >
        <div class="flex items-center gap-4 min-w-0">
          <Avatar
            :name="contact.displayName"
            size="lg"
            :is-online="contact.isVerified"
          />
          <div class="min-w-0">
            <div class="flex items-center gap-2">
              <span class="text-sm font-bold text-textPrimary truncate">{{
                contact.displayName
              }}</span>
              <Badge
                v-if="contact.isVerified"
                variant="success"
                class="text-[10px] gap-1 px-1.5 py-0.5"
              >
                <ShieldCheck class="h-3 w-3" />
                Verified
              </Badge>
            </div>
            <p class="font-mono text-xs text-textMuted truncate mt-0.5">
              {{ contact.safetyNumber }}
            </p>
          </div>
        </div>

        <div class="flex items-center gap-2">
          <Button variant="outline" size="sm" @click="$router.push('/')">
            Message
          </Button>
        </div>
      </div>
    </div>
  </div>
</template>
