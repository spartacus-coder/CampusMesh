import {
  type MeshGroup,
  GroupRole,
  type Conversation,
} from "@campusmesh/shared-types";
import type { IStoragePort } from "@campusmesh/storage";

export const MAX_GROUP_MESH_PEERS = 8;
export const MAX_SWARM_GROUP_PEERS = 100;

export interface CreateGroupOptions {
  name: string;
  description?: string | undefined;
  avatarUrl?: string | undefined;
  initialMemberFingerprints?: string[] | undefined;
  mode?: "webrtc-mesh" | "autobase-swarm" | undefined;
  autobaseKey?: string | undefined;
}

export class GroupManager {
  private storage: IStoragePort;
  private localFingerprint: string;

  constructor(storage: IStoragePort, localFingerprint: string) {
    this.storage = storage;
    this.localFingerprint = localFingerprint;
  }

  public async createGroup(options: CreateGroupOptions): Promise<MeshGroup> {
    const name = options.name.trim();
    if (!name) {
      throw new Error("Group name cannot be empty");
    }

    const mode = options.mode ?? "webrtc-mesh";
    const maxMembers =
      mode === "autobase-swarm" ? MAX_SWARM_GROUP_PEERS : MAX_GROUP_MESH_PEERS;

    const members = new Set<string>([this.localFingerprint]);
    if (options.initialMemberFingerprints) {
      for (const fp of options.initialMemberFingerprints) {
        if (members.size >= maxMembers) {
          break;
        }
        members.add(fp);
      }
    }

    const groupId = `grp-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const now = Date.now();

    const group: MeshGroup = {
      id: groupId,
      name,
      ...(options.description ? { description: options.description } : {}),
      ...(options.avatarUrl ? { avatarUrl: options.avatarUrl } : {}),
      ownerFingerprint: this.localFingerprint,
      adminFingerprints: [this.localFingerprint],
      memberFingerprints: Array.from(members),
      maxMembers,
      mode,
      ...(options.autobaseKey ? { autobaseKey: options.autobaseKey } : {}),
      createdAt: now,
      updatedAt: now,
    };

    await this.storage.saveGroup(group);

    // Also automatically register or sync associated conversation
    const conversation: Conversation = {
      id: groupId,
      isGroup: true,
      name: group.name,
      ...(group.avatarUrl ? { avatarUrl: group.avatarUrl } : {}),
      groupId: groupId,
      groupMode: mode,
      ...(options.autobaseKey ? { autobaseKey: options.autobaseKey } : {}),
      lastMessageTimestamp: now,
      unreadCount: 0,
      isPinned: false,
      isArchived: false,
    };
    await this.storage.saveConversation(conversation);

    return group;
  }

  public async getGroup(groupId: string): Promise<MeshGroup | null> {
    return this.storage.getGroup(groupId);
  }

  public async listGroups(): Promise<MeshGroup[]> {
    return this.storage.getGroups();
  }

  public async addMember(
    groupId: string,
    memberFingerprint: string,
    role: GroupRole = GroupRole.MEMBER,
    actorFingerprint = this.localFingerprint,
  ): Promise<MeshGroup> {
    const group = await this.storage.getGroup(groupId);
    if (!group) {
      throw new Error(`Group not found: ${groupId}`);
    }

    // Role check: Actor must be owner or admin
    const isOwner = group.ownerFingerprint === actorFingerprint;
    const isAdmin = group.adminFingerprints.includes(actorFingerprint);
    if (!isOwner && !isAdmin) {
      throw new Error("Only group owners or admins can add members");
    }

    // Zero-cost mesh boundary check
    if (group.memberFingerprints.length >= group.maxMembers) {
      throw new Error(
        `Group has reached the zero-cost mesh boundary of ${group.maxMembers} peers`,
      );
    }

    if (!group.memberFingerprints.includes(memberFingerprint)) {
      group.memberFingerprints.push(memberFingerprint);
    }

    if (
      role === GroupRole.ADMIN &&
      !group.adminFingerprints.includes(memberFingerprint)
    ) {
      group.adminFingerprints.push(memberFingerprint);
    }

    group.updatedAt = Date.now();
    await this.storage.saveGroup(group);
    return group;
  }

  public async removeMember(
    groupId: string,
    memberFingerprint: string,
    actorFingerprint = this.localFingerprint,
  ): Promise<MeshGroup> {
    const group = await this.storage.getGroup(groupId);
    if (!group) {
      throw new Error(`Group not found: ${groupId}`);
    }

    const isSelf = memberFingerprint === actorFingerprint;
    const isOwner = group.ownerFingerprint === actorFingerprint;
    const isAdmin = group.adminFingerprints.includes(actorFingerprint);

    if (!isSelf && !isOwner && !isAdmin) {
      throw new Error("Insufficient permissions to remove member");
    }

    // Prevent removing owner unless group is deleted
    if (memberFingerprint === group.ownerFingerprint && !isSelf) {
      throw new Error("Cannot remove the group owner");
    }

    group.memberFingerprints = group.memberFingerprints.filter(
      (fp) => fp !== memberFingerprint,
    );
    group.adminFingerprints = group.adminFingerprints.filter(
      (fp) => fp !== memberFingerprint,
    );

    group.updatedAt = Date.now();
    await this.storage.saveGroup(group);
    return group;
  }

  public async leaveGroup(groupId: string): Promise<void> {
    await this.removeMember(
      groupId,
      this.localFingerprint,
      this.localFingerprint,
    );
  }

  public async deleteGroup(
    groupId: string,
    actorFingerprint = this.localFingerprint,
  ): Promise<void> {
    const group = await this.storage.getGroup(groupId);
    if (!group) {
      return;
    }

    if (group.ownerFingerprint !== actorFingerprint) {
      throw new Error("Only the group owner can delete the group");
    }

    await this.storage.deleteGroup(groupId);
  }

  /**
   * Calculates the fan-out recipient list for a message broadcast within the bounded mesh.
   */
  public calculateFanOutRecipients(
    group: MeshGroup,
    senderFingerprint: string,
  ): string[] {
    return group.memberFingerprints.filter((fp) => fp !== senderFingerprint);
  }
}
