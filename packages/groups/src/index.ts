export * from "./group-manager";

import { GroupRole, type GroupMember } from "@campusmesh/shared-types";

export type { GroupMember };

export class BoundedGroupMesh {
  public static readonly MAX_ACTIVE_PEERS = 8;
  private members = new Map<string, GroupMember>();

  constructor(
    public readonly groupId: string,
    public readonly name: string,
    ownerFingerprint: string,
  ) {
    this.members.set(ownerFingerprint, {
      fingerprint: ownerFingerprint,
      role: GroupRole.OWNER,
      joinedAt: Date.now(),
    });
  }

  addMember(fingerprint: string, role: GroupRole = GroupRole.MEMBER): boolean {
    if (this.members.size >= BoundedGroupMesh.MAX_ACTIVE_PEERS) {
      return false; // Mesh peer boundary reached
    }
    this.members.set(fingerprint, {
      fingerprint,
      role,
      joinedAt: Date.now(),
    });
    return true;
  }

  getMemberCount(): number {
    return this.members.size;
  }

  getMember(fingerprint: string): GroupMember | undefined {
    return this.members.get(fingerprint);
  }
}
