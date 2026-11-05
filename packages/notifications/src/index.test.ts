import { describe, it, expect } from "vitest";
import { MockNotificationAdapter } from "./index";

describe("@campusmesh/notifications", () => {
  it("should deliver notifications to mock adapter", async () => {
    const adapter = new MockNotificationAdapter();
    const granted = await adapter.requestPermission();
    expect(granted).toBe(true);

    await adapter.show({ title: "New Message", body: "Hey Alice!" });
    expect(adapter.shownNotifications).toHaveLength(1);
    expect(adapter.shownNotifications[0]?.title).toBe("New Message");
  });
});
