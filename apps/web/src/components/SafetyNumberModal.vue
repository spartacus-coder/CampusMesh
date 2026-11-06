<script setup lang="ts">
import { computed, ref } from "vue";
import {
  X,
  ShieldCheck,
  ShieldAlert,
  Check,
  AlertCircle,
} from "lucide-vue-next";
import { Button, Avatar } from "@campusmesh/ui";
import { useContactsStore } from "../stores/contacts";

const contactsStore = useContactsStore();
const isUpdating = ref(false);

const contact = computed(() => contactsStore.selectedContactForVerification);

const formattedBlocks = computed(() => {
  if (!contact.value?.safetyNumber) return [];
  return contact.value.safetyNumber.split(" ");
});

async function handleToggleVerification() {
  if (!contact.value) return;
  try {
    isUpdating.value = true;
    const newStatus = !contact.value.isVerified;
    await contactsStore.verifyContact(contact.value.fingerprint, newStatus);
    contactsStore.isSafetyNumberModalOpen = false;
  } catch {
    // Handled in store
  } finally {
    isUpdating.value = false;
  }
}
</script>

<template>
  <div
    v-if="contactsStore.isSafetyNumberModalOpen && contact"
    class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200"
  >
    <div
      class="bg-surface border border-border rounded-2xl w-full max-w-md p-6 shadow-2xl flex flex-col gap-5 text-textPrimary relative"
    >
      <!-- Header -->
      <div
        class="flex items-center justify-between border-b border-border pb-4"
      >
        <div class="flex items-center gap-3">
          <div
            class="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center"
          >
            <ShieldCheck class="h-5 w-5" />
          </div>
          <div>
            <h2 class="text-base font-bold">Safety Number Verification</h2>
            <p class="text-xs text-textMuted">
              End-to-End Cryptographic Security
            </p>
          </div>
        </div>
        <button
          class="text-textMuted hover:text-textPrimary p-1 rounded-lg hover:bg-surfaceHover transition-colors"
          @click="contactsStore.isSafetyNumberModalOpen = false"
        >
          <X class="h-5 w-5" />
        </button>
      </div>

      <!-- Contact Info -->
      <div
        class="flex items-center gap-3 p-3 rounded-xl bg-background border border-border"
      >
        <Avatar
          :name="contact.displayName"
          size="md"
          :is-online="contact.isVerified"
        />
        <div class="min-w-0">
          <p class="text-sm font-bold text-textPrimary truncate">
            {{ contact.displayName }}
          </p>
          <p class="font-mono text-[11px] text-textMuted truncate">
            {{ contact.fingerprint }}
          </p>
        </div>
      </div>

      <!-- Explanation -->
      <p class="text-xs text-textSecondary leading-relaxed">
        To prevent man-in-the-middle attacks and ensure your messages are
        strictly private, compare these 24 numbers with your contact's screen in
        person or over a trusted second channel.
      </p>

      <!-- 6-block Safety Number Grid -->
      <div
        class="grid grid-cols-3 gap-2 bg-background p-4 rounded-xl border border-border"
      >
        <div
          v-for="(block, idx) in formattedBlocks"
          :key="idx"
          class="flex items-center justify-center py-2 px-1 bg-surface rounded-lg border border-border font-mono text-xs font-bold tracking-widest text-textPrimary shadow-xs"
        >
          {{ block }}
        </div>
      </div>

      <!-- Current Status -->
      <div
        class="flex items-center gap-2 p-3 rounded-xl text-xs"
        :class="
          contact.isVerified
            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
            : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
        "
      >
        <component
          :is="contact.isVerified ? ShieldCheck : ShieldAlert"
          class="h-4 w-4 shrink-0"
        />
        <span>
          {{
            contact.isVerified
              ? "Verified: Keys have been confirmed matching."
              : "Unverified: Numbers have not yet been compared."
          }}
        </span>
      </div>

      <!-- Action Buttons -->
      <div
        class="flex items-center justify-end gap-3 pt-2 border-t border-border"
      >
        <Button
          variant="outline"
          size="sm"
          @click="contactsStore.isSafetyNumberModalOpen = false"
        >
          Close
        </Button>
        <Button
          :variant="contact.isVerified ? 'outline' : 'default'"
          size="sm"
          :disabled="isUpdating"
          class="gap-1.5"
          @click="handleToggleVerification"
        >
          <Check v-if="!contact.isVerified" class="h-4 w-4" />
          <AlertCircle v-else class="h-4 w-4" />
          <span>{{
            contact.isVerified ? "Mark as Unverified" : "Mark as Verified"
          }}</span>
        </Button>
      </div>
    </div>
  </div>
</template>
