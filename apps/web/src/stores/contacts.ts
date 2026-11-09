import { defineStore } from "pinia";
import { ref, computed } from "vue";
import type { Contact, MeshGroup } from "@campusmesh/shared-types";
import {
  ContactManager,
  type AddContactInput,
  type ParsedContactPayload,
} from "@campusmesh/contacts";
import { GroupManager, type CreateGroupOptions } from "@campusmesh/groups";
import {
  DexieStorageAdapter,
  InMemoryStorageAdapter,
  type IStoragePort,
} from "@campusmesh/storage";
import { nativeService } from "../services/native";

let storageInstance: IStoragePort | null = null;
function getStorage(): IStoragePort {
  if (!storageInstance) {
    storageInstance =
      typeof indexedDB !== "undefined"
        ? new DexieStorageAdapter("CampusMeshWebDB")
        : new InMemoryStorageAdapter();
  }
  return storageInstance;
}

export const useContactsStore = defineStore("contacts", () => {
  let contactManager: ContactManager = new ContactManager(getStorage());
  let groupManager: GroupManager = new GroupManager(getStorage(), "");

  const contacts = ref<Contact[]>([]);
  const groups = ref<MeshGroup[]>([]);
  const searchQuery = ref("");
  const activeFilter = ref<"all" | "verified" | "blocked">("all");
  const selectedContactForVerification = ref<Contact | null>(null);
  const isAddContactOpen = ref(false);
  const prefilledFingerprint = ref<string>("");
  const prefilledName = ref<string>("");
  const isSafetyNumberModalOpen = ref(false);
  const isCreateGroupOpen = ref(false);
  const isLoading = ref(false);
  const error = ref<string | null>(null);

  function setStorageAdapter(storage: IStoragePort, localFingerprint = "") {
    storageInstance = storage;
    contactManager = new ContactManager(storage, localFingerprint);
    groupManager = new GroupManager(storage, localFingerprint);
  }

  function setLocalFingerprint(fingerprint: string) {
    contactManager.setLocalFingerprint(fingerprint);
    groupManager = new GroupManager(getStorage(), fingerprint);
  }

  async function loadContacts(): Promise<void> {
    try {
      isLoading.value = true;
      contacts.value = await contactManager.listContacts();

      if (nativeService.isTauri) {
        try {
          const nativeContacts = await nativeService.getContactsFromNativeDb();
          if (nativeContacts && nativeContacts.length > 0) {
            for (const nc of nativeContacts) {
              if (
                !contacts.value.some((c) => c.fingerprint === nc.fingerprint)
              ) {
                contacts.value.push(nc);
                contactManager
                  .addContact({
                    fingerprint: nc.fingerprint,
                    displayName: nc.displayName,
                    safetyNumber: nc.safetyNumber,
                  })
                  .catch(() => {});
              }
            }
          }
        } catch {
          // Native contacts fallback gracefully
        }
      }
    } catch (err: unknown) {
      error.value = err instanceof Error ? err.message : String(err);
    } finally {
      isLoading.value = false;
    }
  }

  async function loadGroups(): Promise<void> {
    try {
      groups.value = await groupManager.listGroups();
    } catch (err: unknown) {
      error.value = err instanceof Error ? err.message : String(err);
    }
  }

  async function addContact(input: AddContactInput): Promise<Contact> {
    try {
      error.value = null;
      const contact = await contactManager.addContact(input);
      if (nativeService.isTauri) {
        nativeService.saveContactToNativeDb(contact).catch(() => {});
      }
      await loadContacts();
      return contact;
    } catch (err: unknown) {
      error.value = err instanceof Error ? err.message : String(err);
      throw err;
    }
  }

  async function verifyContact(
    fingerprint: string,
    isVerified = true,
  ): Promise<void> {
    try {
      error.value = null;
      await contactManager.verifySafetyNumber(fingerprint, isVerified);
      await loadContacts();
      if (
        selectedContactForVerification.value &&
        selectedContactForVerification.value.fingerprint === fingerprint
      ) {
        selectedContactForVerification.value.isVerified = isVerified;
      }
    } catch (err: unknown) {
      error.value = err instanceof Error ? err.message : String(err);
      throw err;
    }
  }

  async function blockContact(
    fingerprint: string,
    isBlocked = true,
  ): Promise<void> {
    try {
      error.value = null;
      await contactManager.blockContact(fingerprint, isBlocked);
      await loadContacts();
    } catch (err: unknown) {
      error.value = err instanceof Error ? err.message : String(err);
      throw err;
    }
  }

  async function deleteContact(fingerprint: string): Promise<void> {
    try {
      error.value = null;
      await contactManager.deleteContact(fingerprint);
      await loadContacts();
    } catch (err: unknown) {
      error.value = err instanceof Error ? err.message : String(err);
      throw err;
    }
  }

  async function createGroup(options: CreateGroupOptions): Promise<MeshGroup> {
    try {
      error.value = null;
      const group = await groupManager.createGroup(options);
      await loadGroups();
      return group;
    } catch (err: unknown) {
      error.value = err instanceof Error ? err.message : String(err);
      throw err;
    }
  }

  async function addMemberToGroup(
    groupId: string,
    memberFingerprint: string,
  ): Promise<void> {
    try {
      error.value = null;
      await groupManager.addMember(groupId, memberFingerprint);
      await loadGroups();
    } catch (err: unknown) {
      error.value = err instanceof Error ? err.message : String(err);
      throw err;
    }
  }

  async function removeMemberFromGroup(
    groupId: string,
    memberFingerprint: string,
  ): Promise<void> {
    try {
      error.value = null;
      await groupManager.removeMember(groupId, memberFingerprint);
      await loadGroups();
    } catch (err: unknown) {
      error.value = err instanceof Error ? err.message : String(err);
      throw err;
    }
  }

  async function deleteGroup(groupId: string): Promise<void> {
    try {
      error.value = null;
      await groupManager.deleteGroup(groupId);
      await loadGroups();
    } catch (err: unknown) {
      error.value = err instanceof Error ? err.message : String(err);
      throw err;
    }
  }

  function parseQrPayload(raw: string): ParsedContactPayload | null {
    return contactManager.parseContactQrPayload(raw);
  }

  function openAddContactWithPeer(fingerprint: string, displayName = "") {
    prefilledFingerprint.value = fingerprint;
    prefilledName.value = displayName;
    isAddContactOpen.value = true;
  }

  const filteredContacts = computed(() => {
    let result = contacts.value;

    if (activeFilter.value === "verified") {
      result = result.filter((c) => c.isVerified && !c.isBlocked);
    } else if (activeFilter.value === "blocked") {
      result = result.filter((c) => c.isBlocked);
    } else {
      // 'all' excludes blocked from normal view
      result = result.filter((c) => !c.isBlocked);
    }

    if (searchQuery.value.trim()) {
      const q = searchQuery.value.toLowerCase().trim();
      result = result.filter(
        (c) =>
          c.displayName.toLowerCase().includes(q) ||
          c.fingerprint.toLowerCase().includes(q),
      );
    }

    return result;
  });

  const verifiedContacts = computed(() =>
    contacts.value.filter((c) => c.isVerified && !c.isBlocked),
  );

  return {
    contacts,
    groups,
    searchQuery,
    activeFilter,
    selectedContactForVerification,
    isAddContactOpen,
    prefilledFingerprint,
    prefilledName,
    openAddContactWithPeer,
    isSafetyNumberModalOpen,
    isCreateGroupOpen,
    isLoading,
    error,
    filteredContacts,
    verifiedContacts,
    setStorageAdapter,
    setLocalFingerprint,
    loadContacts,
    loadGroups,
    addContact,
    verifyContact,
    blockContact,
    deleteContact,
    createGroup,
    addMemberToGroup,
    removeMemberFromGroup,
    deleteGroup,
    parseQrPayload,
  };
});
