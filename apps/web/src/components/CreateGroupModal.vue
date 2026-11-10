<script setup lang="ts">
import { ref, computed } from "vue";
import { X, Users, AlertCircle, ShieldCheck, Check } from "lucide-vue-next";
import { Button, Input, Badge, Avatar } from "@campusmesh/ui";
import { useContactsStore } from "../stores/contacts";
import { useChatStore } from "../stores/chat";
import { useNetworkStore } from "../stores/network";
import {
  MAX_GROUP_MESH_PEERS,
  MAX_SWARM_GROUP_PEERS,
} from "@campusmesh/groups";

const contactsStore = useContactsStore();
const chatStore = useChatStore();
const networkStore = useNetworkStore();

const groupName = ref("");
const description = ref("");
const groupMode = ref<"webrtc-mesh" | "autobase-swarm">("autobase-swarm");
const selectedFingerprints = ref<string[]>([]);
const error = ref<string | null>(null);
const isSubmitting = ref(false);

const availableContacts = computed(() => {
  return contactsStore.contacts.filter((c) => !c.isBlocked);
});

const activeMaxPeers = computed(() =>
  groupMode.value === "autobase-swarm"
    ? MAX_SWARM_GROUP_PEERS
    : MAX_GROUP_MESH_PEERS,
);

const totalMembers = computed(() => 1 + selectedFingerprints.value.length);
const isBoundaryFull = computed(
  () => totalMembers.value >= activeMaxPeers.value,
);

function toggleMember(fingerprint: string) {
  const idx = selectedFingerprints.value.indexOf(fingerprint);
  if (idx >= 0) {
    selectedFingerprints.value.splice(idx, 1);
  } else {
    if (isBoundaryFull.value) {
      error.value = `Mesh group is bounded at maximum ${activeMaxPeers.value} peers for zero-cost operation.`;
      return;
    }
    error.value = null;
    selectedFingerprints.value.push(fingerprint);
  }
}

async function handleCreateGroup() {
  error.value = null;
  const name = groupName.value.trim();
  if (!name) {
    error.value = "Please provide a name for the mesh group.";
    return;
  }

  try {
    isSubmitting.value = true;
    const group = await contactsStore.createGroup({
      name,
      mode: groupMode.value,
      ...(description.value.trim()
        ? { description: description.value.trim() }
        : {}),
      initialMemberFingerprints: selectedFingerprints.value,
    });

    if (groupMode.value === "autobase-swarm") {
      const abInfo = await networkStore.openAutobaseGroup(group.id);
      if (abInfo?.autobaseKey) {
        const conv = chatStore.conversations.find((c) => c.id === group.id);
        if (conv) {
          conv.autobaseKey = abInfo.autobaseKey;
          await chatStore.saveConversation(conv);
        }
      }
    }

    // Reset and close
    groupName.value = "";
    description.value = "";
    selectedFingerprints.value = [];
    contactsStore.isCreateGroupOpen = false;

    // Switch to active conversation in chatStore
    await chatStore.selectConversation(group.id);
  } catch (err: unknown) {
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    isSubmitting.value = false;
  }
}
</script>

<template>
  <div
    v-if="contactsStore.isCreateGroupOpen"
    class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200"
  >
    <div
      class="bg-surface border border-border rounded-2xl w-full max-w-lg p-6 shadow-2xl flex flex-col gap-5 text-textPrimary relative"
    >
      <!-- Header -->
      <div
        class="flex items-center justify-between border-b border-border pb-4"
      >
        <div class="flex items-center gap-3">
          <div
            class="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center"
          >
            <Users class="h-5 w-5" />
          </div>
          <div>
            <h2 class="text-base font-bold">Create Mesh Group</h2>
            <p class="text-xs text-textMuted">
              Decentralized peer group (Up to {{ activeMaxPeers }} peers)
            </p>
          </div>
        </div>
        <button
          class="text-textMuted hover:text-textPrimary p-1 rounded-lg hover:bg-surfaceHover transition-colors"
          @click="contactsStore.isCreateGroupOpen = false"
        >
          <X class="h-5 w-5" />
        </button>
      </div>

      <!-- Group Details -->
      <div class="flex flex-col gap-4">
        <div>
          <label class="text-xs font-medium text-textSecondary mb-1.5 block">
            Swarm Topology Mode
          </label>
          <div class="grid grid-cols-2 gap-2">
            <button
              type="button"
              class="rounded-xl border p-2.5 text-left transition-colors"
              :class="
                groupMode === 'autobase-swarm'
                  ? 'border-primary bg-primary/10 text-textPrimary'
                  : 'border-border bg-background text-textSecondary hover:bg-surfaceHover'
              "
              @click="groupMode = 'autobase-swarm'"
            >
              <div class="text-xs font-semibold">Autobase Swarm</div>
              <div class="text-[10px] text-textMuted mt-0.5">
                Up to {{ MAX_SWARM_GROUP_PEERS }} peers • HyperDHT + LAN
              </div>
            </button>
            <button
              type="button"
              class="rounded-xl border p-2.5 text-left transition-colors"
              :class="
                groupMode === 'webrtc-mesh'
                  ? 'border-primary bg-primary/10 text-textPrimary'
                  : 'border-border bg-background text-textSecondary hover:bg-surfaceHover'
              "
              @click="groupMode = 'webrtc-mesh'"
            >
              <div class="text-xs font-semibold">Direct WebRTC Mesh</div>
              <div class="text-[10px] text-textMuted mt-0.5">
                Up to {{ MAX_GROUP_MESH_PEERS }} peers • Browser P2P
              </div>
            </button>
          </div>
        </div>

        <div>
          <label class="text-xs font-medium text-textSecondary mb-1.5 block">
            Group Name <span class="text-red-500">*</span>
          </label>
          <Input
            v-model="groupName"
            placeholder="e.g. CS 301 Study Mesh"
            class="h-10"
          />
        </div>

        <div>
          <label class="text-xs font-medium text-textSecondary mb-1.5 block">
            Description (Optional)
          </label>
          <Input
            v-model="description"
            placeholder="e.g. Distributed peer group for exam revision"
            class="h-10"
          />
        </div>
      </div>

      <!-- Member Selection -->
      <div class="flex flex-col gap-2">
        <div class="flex items-center justify-between">
          <label class="text-xs font-medium text-textSecondary">
            Select Initial Members
          </label>
          <Badge
            :variant="isBoundaryFull ? 'destructive' : 'outline'"
            class="text-[10px] font-mono"
          >
            {{ totalMembers }} / {{ activeMaxPeers }} Peers
          </Badge>
        </div>

        <div
          v-if="availableContacts.length === 0"
          class="p-4 rounded-xl border border-dashed border-border text-center text-xs text-textMuted"
        >
          No contacts available yet. You can create the group now and invite
          peers later.
        </div>

        <div
          v-else
          class="max-h-48 overflow-y-auto space-y-1.5 pr-1 rounded-xl border border-border bg-background p-2"
        >
          <div
            v-for="c in availableContacts"
            :key="c.id"
            class="flex items-center justify-between p-2 rounded-lg cursor-pointer transition-colors"
            :class="
              selectedFingerprints.includes(c.fingerprint)
                ? 'bg-primary/10 border border-primary/30'
                : 'hover:bg-surface border border-transparent'
            "
            @click="toggleMember(c.fingerprint)"
          >
            <div class="flex items-center gap-2.5 min-w-0">
              <Avatar :name="c.displayName" size="sm" />
              <div class="min-w-0">
                <div class="flex items-center gap-1.5">
                  <span class="text-xs font-bold text-textPrimary truncate">{{
                    c.displayName
                  }}</span>
                  <ShieldCheck
                    v-if="c.isVerified"
                    class="h-3.5 w-3.5 text-emerald-400 shrink-0"
                  />
                </div>
                <p class="font-mono text-[10px] text-textMuted truncate">
                  {{ c.fingerprint }}
                </p>
              </div>
            </div>

            <div
              class="h-5 w-5 rounded-md border flex items-center justify-center shrink-0"
              :class="
                selectedFingerprints.includes(c.fingerprint)
                  ? 'bg-primary border-primary text-white'
                  : 'border-border bg-surface'
              "
            >
              <Check
                v-if="selectedFingerprints.includes(c.fingerprint)"
                class="h-3.5 w-3.5"
              />
            </div>
          </div>
        </div>
      </div>

      <!-- Error message -->
      <p v-if="error" class="text-xs text-red-500 flex items-center gap-1.5">
        <AlertCircle class="h-4 w-4 shrink-0" />
        {{ error }}
      </p>

      <!-- Footer Buttons -->
      <div
        class="flex items-center justify-end gap-3 pt-2 border-t border-border"
      >
        <Button
          variant="outline"
          size="sm"
          @click="contactsStore.isCreateGroupOpen = false"
        >
          Cancel
        </Button>
        <Button
          variant="default"
          size="sm"
          :disabled="isSubmitting || !groupName.trim()"
          class="gap-1.5"
          @click="handleCreateGroup"
        >
          <Users class="h-4 w-4" />
          <span>{{ isSubmitting ? "Creating..." : "Create Mesh Group" }}</span>
        </Button>
      </div>
    </div>
  </div>
</template>
