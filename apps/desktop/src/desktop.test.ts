import { describe, it, expect } from "vitest";
import {
  isTauriEnvironment,
  getDesktopPlatformInfo,
  parseDesktopDeepLink,
  DesktopWindowManager,
} from "./index";

describe("CampusMesh Desktop Target Suite", () => {
  it("should detect web environment when Tauri runtime is absent", () => {
    expect(isTauriEnvironment()).toBe(false);
    const info = getDesktopPlatformInfo();
    expect(info.isDesktop).toBe(false);
    expect(info.platform).toBe("web");
    expect(info.version).toBe("0.1.0");
  });

  it("should accurately parse valid campusmesh:// deep links", () => {
    // 1. Invite link
    const invite = parseDesktopDeepLink(
      "campusmesh://invite?fp=fp-12345&name=Alice",
    );
    expect(invite).not.toBeNull();
    expect(invite?.action).toBe("invite");
    expect(invite?.params["fp"]).toBe("fp-12345");
    expect(invite?.params["name"]).toBe("Alice");

    // 2. Chat link
    const chat = parseDesktopDeepLink("campusmesh://chat?id=conv-456");
    expect(chat?.action).toBe("chat");
    expect(chat?.params["id"]).toBe("conv-456");

    // 3. Room link
    const room = parseDesktopDeepLink("campusmesh://room?id=room-study-mesh");
    expect(room?.action).toBe("room");
    expect(room?.params["id"]).toBe("room-study-mesh");

    // 4. Invalid protocols and malformed URLs
    expect(parseDesktopDeepLink("https://example.com/invite")).toBeNull();
    expect(parseDesktopDeepLink("invalid-string")).toBeNull();
    expect(parseDesktopDeepLink("")).toBeNull();
  });

  it("should manage desktop window state", async () => {
    const wm = new DesktopWindowManager();
    expect(wm.getWindowState().isMaximized).toBe(false);

    const isMax = await wm.toggleMaximize();
    expect(isMax).toBe(true);
    expect(wm.getWindowState().isMaximized).toBe(true);

    const isRestored = await wm.toggleMaximize();
    expect(isRestored).toBe(false);
  });
});
