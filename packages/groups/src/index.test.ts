import { describe, it, expect } from "vitest";
import { BoundedGroupMesh } from "./index";
import { GroupRole } from "@campusmesh/shared-types";

describe("@campusmesh/groups", () => {
  it("should enforce MAX_ACTIVE_PEERS limit of 8", () => {
    const mesh = new BoundedGroupMesh("grp_1", "Study Circle", "owner_fp");
    expect(mesh.getMemberCount()).toBe(1);
    expect(mesh.getMember("owner_fp")?.role).toBe(GroupRole.OWNER);

    // Add 7 more peers to reach 8
    for (let i = 1; i <= 7; i++) {
      const added = mesh.addMember(`peer_${i}`);
      expect(added).toBe(true);
    }
    expect(mesh.getMemberCount()).toBe(8);

    // 9th peer must be rejected to prevent full-mesh quadratic explosion
    const rejected = mesh.addMember("peer_overflow");
    expect(rejected).toBe(false);
    expect(mesh.getMemberCount()).toBe(8);
  });
});
