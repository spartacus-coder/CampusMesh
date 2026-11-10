import { describe, it, expect, beforeEach } from "vitest";
import { GroupManager, BoundedGroupMesh, MAX_GROUP_MESH_PEERS } from "./index";
import { InMemoryStorageAdapter } from "@campusmesh/storage";
import { GroupRole } from "@campusmesh/shared-types";

describe("@campusmesh/groups suite", () => {
  let storage: InMemoryStorageAdapter;
  let manager: GroupManager;
  const ownerFp = "fp-owner-alice";

  beforeEach(() => {
    storage = new InMemoryStorageAdapter();
    manager = new GroupManager(storage, ownerFp);
  });

  it("should create a group, assign owner, and register associated conversation", async () => {
    const group = await manager.createGroup({
      name: "Computer Science Study Mesh",
      description: "Distributed study circle for CS 301",
      initialMemberFingerprints: ["fp-peer-bob", "fp-peer-charlie"],
    });

    expect(group.id).toBeDefined();
    expect(group.name).toBe("Computer Science Study Mesh");
    expect(group.ownerFingerprint).toBe(ownerFp);
    expect(group.adminFingerprints).toContain(ownerFp);
    expect(group.memberFingerprints).toHaveLength(3); // Alice + Bob + Charlie
    expect(group.maxMembers).toBe(MAX_GROUP_MESH_PEERS);

    // Verify conversation was created
    const conversation = await storage.getConversation(group.id);
    expect(conversation).not.toBeNull();
    expect(conversation?.name).toBe("Computer Science Study Mesh");
    expect(conversation?.isGroup).toBe(true);
  });

  it("should strictly enforce zero-cost mesh boundary limit of 8 peers", async () => {
    const group = await manager.createGroup({
      name: "Boundary Test Group",
    });

    // Add 7 additional members (reaching 1 owner + 7 members = 8 total)
    for (let i = 1; i <= 7; i++) {
      await manager.addMember(group.id, `fp-peer-${i}`);
    }

    const fullGroup = await manager.getGroup(group.id);
    expect(fullGroup?.memberFingerprints).toHaveLength(8);

    // Attempt to add a 9th member must throw error
    await expect(
      manager.addMember(group.id, "fp-peer-overflow-9"),
    ).rejects.toThrow(/zero-cost mesh boundary/);
  });

  it("should enforce admin/owner permissions when adding members", async () => {
    const group = await manager.createGroup({
      name: "Restricted Group",
      initialMemberFingerprints: ["fp-member-regular"],
    });

    // A regular member attempts to add someone else
    await expect(
      manager.addMember(
        group.id,
        "fp-new-guest",
        GroupRole.MEMBER,
        "fp-member-regular",
      ),
    ).rejects.toThrow(/Only group owners or admins/);
  });

  it("should allow admins to be appointed and manage members", async () => {
    const group = await manager.createGroup({
      name: "Admin Test Group",
    });

    // Add Bob as an admin
    await manager.addMember(group.id, "fp-admin-bob", GroupRole.ADMIN, ownerFp);

    const updated = await manager.getGroup(group.id);
    expect(updated?.adminFingerprints).toContain("fp-admin-bob");

    // Bob can now add a member
    await manager.addMember(
      group.id,
      "fp-member-charlie",
      GroupRole.MEMBER,
      "fp-admin-bob",
    );
    const withCharlie = await manager.getGroup(group.id);
    expect(withCharlie?.memberFingerprints).toContain("fp-member-charlie");
  });

  it("should remove members and allow members to leave", async () => {
    const group = await manager.createGroup({
      name: "Membership Group",
      initialMemberFingerprints: ["fp-bob", "fp-charlie"],
    });

    // Owner removes Bob
    await manager.removeMember(group.id, "fp-bob", ownerFp);
    let current = await manager.getGroup(group.id);
    expect(current?.memberFingerprints).not.toContain("fp-bob");

    // Charlie leaves voluntarily
    await manager.removeMember(group.id, "fp-charlie", "fp-charlie");
    current = await manager.getGroup(group.id);
    expect(current?.memberFingerprints).not.toContain("fp-charlie");

    // Cannot remove owner
    await expect(
      manager.removeMember(group.id, ownerFp, "fp-random"),
    ).rejects.toThrow();
  });

  it("should compute correct fan-out recipients excluding sender", async () => {
    const group = await manager.createGroup({
      name: "Fanout Group",
      initialMemberFingerprints: ["fp-bob", "fp-charlie", "fp-dave"],
    });

    const recipientsFromAlice = manager.calculateFanOutRecipients(
      group,
      ownerFp,
    );
    expect(recipientsFromAlice).toEqual(["fp-bob", "fp-charlie", "fp-dave"]);

    const recipientsFromBob = manager.calculateFanOutRecipients(
      group,
      "fp-bob",
    );
    expect(recipientsFromBob).toEqual([ownerFp, "fp-charlie", "fp-dave"]);
  });

  it("should delete group only by owner", async () => {
    const group = await manager.createGroup({
      name: "Deletable Group",
      initialMemberFingerprints: ["fp-bob"],
    });

    // Non-owner cannot delete
    await expect(manager.deleteGroup(group.id, "fp-bob")).rejects.toThrow(
      /Only the group owner/,
    );

    // Owner deletes
    await manager.deleteGroup(group.id, ownerFp);
    expect(await manager.getGroup(group.id)).toBeNull();
  });

  it("should maintain BoundedGroupMesh backwards compatibility", () => {
    const mesh = new BoundedGroupMesh("mesh-1", "Local Mesh", "fp-alice");
    expect(mesh.getMemberCount()).toBe(1);
    expect(mesh.getMember("fp-alice")?.role).toBe(GroupRole.OWNER);

    for (let i = 1; i <= 7; i++) {
      expect(mesh.addMember(`peer-${i}`)).toBe(true);
    }
    expect(mesh.getMemberCount()).toBe(8);
    expect(mesh.addMember("peer-overflow")).toBe(false);
  });

  it("should allow 50+ peer groups when using autobase-swarm mode", async () => {
    const members = Array.from({ length: 55 }, (_, i) => `fp-peer-${i}`);
    const swarmGroup = await manager.createGroup({
      name: "University Campus Commons",
      mode: "autobase-swarm",
      initialMemberFingerprints: members,
    });

    expect(swarmGroup.mode).toBe("autobase-swarm");
    expect(swarmGroup.maxMembers).toBe(100);
    expect(swarmGroup.memberFingerprints.length).toBe(56); // owner + 55 peers
  });
});
