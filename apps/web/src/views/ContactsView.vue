<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useRouter } from "vue-router";
import {
  UserPlus,
  QrCode,
  ShieldCheck,
  ShieldAlert,
  Search,
  MessageSquare,
  Ban,
  Trash2,
  Users,
} from "lucide-vue-next";
import { Avatar, Button, Input, Badge } from "@campusmesh/ui";
import type { Contact } from "@campusmesh/shared-types";
import { useContactsStore } from "../stores/contacts";
import { useChatStore } from "../stores/chat";
import { useIdentityStore } from "../stores/identity";
import AddContactModal from "../components/AddContactModal.vue";
import SafetyNumberModal from "../components/SafetyNumberModal.vue";
import IdentityCardModal from "../components/IdentityCardModal.vue";
import CreateGroupModal from "../components/CreateGroupModal.vue";

const router = useRouter();
const contactsStore = useContactsStore();
const chatStore = useChatStore();
const identityStore = useIdentityStore();

const isQrCardOpen = ref(false);

onMounted(async () => {
  if (identityStore.identity?.fingerprint) {
    contactsStore.setLocalFingerprint(identityStore.identity.fingerprint);
  }
  await contactsStore.loadContacts();
  await contactsStore.loadGroups();
});

function openSafetyVerification(contact: Contact) {
  contactsStore.selectedContactForVerification = contact;
  contactsStore.isSafetyNumberModalOpen = true;
}

async function toggleBlock(contact: Contact) {
  await contactsStore.blockContact(contact.fingerprint, !contact.isBlocked);
}

async function removeContact(contact: Contact) {
  if (confirm(`Remove ${contact.displayName} from your contact directory?`)) {
    await contactsStore.deleteContact(contact.fingerprint);
  }
}

async function startChatWithContact(contact: Contact) {
  let conv = chatStore.conversations.find(
    (c) => c.peerFingerprint === contact.fingerprint,
  );
  if (!conv) {
    conv = {
      id: `conv-${contact.fingerprint}`,
      isGroup: false,
      name: contact.displayName,
      peerFingerprint: contact.fingerprint,
      unreadCount: 0,
      isPinned: false,
      isArchived: false,
      lastMessageTimestamp: Date.now(),
    };
    await chatStore.saveConversation(conv);
  } else if (conv.name !== contact.displayName) {
    chatStore.updatePeerDisplayName(
      contact.fingerprint,
      contact.displayName,
      true,
    );
  }
  await chatStore.selectConversation(conv.id);
  router.push("/");
}
</script>

<template>
  <div class="flex-1 flex flex-col h-full overflow-hidden bg-background">
    <!-- Header -->
    <header
      class="flex h-14 sm:h-16 items-center justify-between border-b border-border bg-surface px-4 sm:px-6 shrink-0"
    >
      <div class="flex items-center gap-2 sm:gap-3 min-w-0">
        <h1
          class="text-sm sm:text-base font-bold text-textPrimary tracking-tight truncate"
        >
          Contacts
        </h1>
        <Badge
          variant="outline"
          class="text-[10px] sm:text-xs font-mono shrink-0"
        >
          {{ contactsStore.contacts.length }}
        </Badge>
      </div>

      <div class="flex items-center gap-1.5 sm:gap-2 shrink-0">
        <Button
          variant="outline"
          size="sm"
          class="gap-1 sm:gap-1.5 h-8 px-2 sm:px-3 text-xs"
          title="New Mesh Group"
          @click="contactsStore.isCreateGroupOpen = true"
        >
          <Users class="h-3.5 w-3.5 text-primary" />
          <span class="hidden md:inline">Group</span>
        </Button>
        <Button
          variant="outline"
          size="sm"
          class="gap-1 sm:gap-1.5 h-8 px-2 sm:px-3 text-xs"
          title="My QR Identity Card"
          @click="isQrCardOpen = true"
        >
          <QrCode class="h-3.5 w-3.5 text-primary" />
          <span class="hidden sm:inline">My QR</span>
        </Button>
        <Button
          variant="default"
          size="sm"
          class="gap-1 sm:gap-1.5 h-8 px-2.5 sm:px-3 text-xs"
          @click="contactsStore.isAddContactOpen = true"
        >
          <UserPlus class="h-3.5 w-3.5" />
          <span>Add Contact</span>
        </Button>
      </div>
    </header>

    <!-- Search & Filter Controls -->
    <div class="p-4 sm:p-6 pb-2 max-w-4xl mx-auto w-full flex flex-col gap-3">
      <div class="flex items-center gap-3">
        <div class="relative flex-1">
          <Search class="absolute left-3 top-3 h-4 w-4 text-textMuted" />
          <Input
            v-model="contactsStore.searchQuery"
            placeholder="Search contacts by name or fingerprint..."
            class="pl-10 h-10"
          />
        </div>

        <!-- Filter tabs -->
        <div class="flex rounded-lg bg-surface border border-border p-1">
          <button
            type="button"
            class="px-3 py-1 text-xs font-semibold rounded-md transition-all"
            :class="
              contactsStore.activeFilter === 'all'
                ? 'bg-primary text-white shadow-xs'
                : 'text-textMuted hover:text-textPrimary'
            "
            @click="contactsStore.activeFilter = 'all'"
          >
            All
          </button>
          <button
            type="button"
            class="px-3 py-1 text-xs font-semibold rounded-md transition-all"
            :class="
              contactsStore.activeFilter === 'verified'
                ? 'bg-primary text-white shadow-xs'
                : 'text-textMuted hover:text-textPrimary'
            "
            @click="contactsStore.activeFilter = 'verified'"
          >
            Verified
          </button>
          <button
            type="button"
            class="px-3 py-1 text-xs font-semibold rounded-md transition-all"
            :class="
              contactsStore.activeFilter === 'blocked'
                ? 'bg-primary text-white shadow-xs'
                : 'text-textMuted hover:text-textPrimary'
            "
            @click="contactsStore.activeFilter = 'blocked'"
          >
            Blocked
          </button>
        </div>
      </div>
    </div>

    <!-- Contact List -->
    <div
      class="flex-1 overflow-y-auto p-4 sm:p-6 max-w-4xl mx-auto w-full space-y-2.5"
    >
      <!-- Empty State -->
      <div
        v-if="contactsStore.filteredContacts.length === 0"
        class="flex flex-col items-center justify-center p-12 text-center border border-dashed border-border rounded-2xl bg-surface/50"
      >
        <div
          class="h-12 w-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mb-3"
        >
          <UserPlus class="h-6 w-6" />
        </div>
        <h3 class="text-sm font-bold text-textPrimary">No Contacts Found</h3>
        <p class="text-xs text-textMuted max-w-sm mt-1 mb-4">
          {{
            contactsStore.searchQuery
              ? "No contacts match your current search query."
              : "Your cryptographic address book is empty. Add a peer manually or paste their QR code."
          }}
        </p>
        <Button
          variant="outline"
          size="sm"
          class="gap-1.5"
          @click="contactsStore.isAddContactOpen = true"
        >
          <UserPlus class="h-4 w-4" />
          <span>Add Your First Contact</span>
        </Button>
      </div>

      <!-- Contact Rows -->
      <div
        v-for="contact in contactsStore.filteredContacts"
        :key="contact.id"
        class="flex items-center justify-between p-3 sm:p-4 rounded-xl border border-border bg-surface hover:border-primary/40 transition-colors shadow-xs gap-2"
      >
        <div class="flex items-center gap-3 min-w-0">
          <Avatar
            :name="contact.displayName"
            size="md"
            class="shrink-0"
            :is-online="contact.isVerified"
          />
          <div class="min-w-0">
            <div class="flex items-center gap-1.5 flex-wrap">
              <span class="text-sm font-bold text-textPrimary truncate">{{
                contact.displayName
              }}</span>
              <Badge
                v-if="contact.isVerified"
                variant="success"
                class="text-[9px] gap-1 px-1.5 py-0.5 cursor-pointer hover:opacity-80"
                @click="openSafetyVerification(contact)"
              >
                <ShieldCheck class="h-2.5 w-2.5" />
                Verified
              </Badge>
              <Badge
                v-else
                variant="outline"
                class="text-[9px] gap-1 px-1.5 py-0.5 cursor-pointer hover:border-amber-400 text-amber-400"
                @click="openSafetyVerification(contact)"
              >
                <ShieldAlert class="h-2.5 w-2.5" />
                Unverified
              </Badge>
              <Badge
                v-if="contact.isBlocked"
                variant="destructive"
                class="text-[9px] px-1.5 py-0.5"
              >
                Blocked
              </Badge>
            </div>
            <p
              class="font-mono text-[11px] text-textMuted truncate mt-0.5 cursor-pointer hover:text-primary transition-colors"
              title="Click to verify safety number"
              @click="openSafetyVerification(contact)"
            >
              {{ contact.safetyNumber }}
            </p>
          </div>
        </div>

        <!-- Action Buttons -->
        <div class="flex items-center gap-1 shrink-0">
          <Button
            v-if="!contact.isBlocked"
            variant="default"
            size="sm"
            class="gap-1 h-8 px-2.5 text-xs font-semibold"
            @click="startChatWithContact(contact)"
          >
            <MessageSquare class="h-3.5 w-3.5" />
            <span class="hidden sm:inline">Message</span>
          </Button>

          <Button
            variant="outline"
            size="sm"
            class="gap-1 h-8 px-2 text-xs"
            title="Verify Safety Number"
            @click="openSafetyVerification(contact)"
          >
            <ShieldCheck class="h-3.5 w-3.5 text-primary" />
            <span class="hidden md:inline">Verify</span>
          </Button>

          <Button
            variant="ghost"
            size="sm"
            class="h-8 w-8 p-0 text-textMuted hover:text-amber-400 hover:bg-amber-400/10"
            :title="contact.isBlocked ? 'Unblock Contact' : 'Block Contact'"
            @click="toggleBlock(contact)"
          >
            <Ban class="h-3.5 w-3.5" />
          </Button>

          <Button
            variant="ghost"
            size="sm"
            class="h-8 w-8 p-0 text-textMuted hover:text-red-400 hover:bg-red-400/10"
            title="Delete Contact"
            @click="removeContact(contact)"
          >
            <Trash2 class="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>

    <!-- Modals -->
    <AddContactModal />
    <SafetyNumberModal />
    <CreateGroupModal />
    <IdentityCardModal v-if="isQrCardOpen" @close="isQrCardOpen = false" />
  </div>
</template>
