import { describe, it, expect } from "vitest";
import {
  isCapacitorEnvironment,
  getMobilePlatformInfo,
  MulticastLockManager,
  parseMobileDeepLink,
} from "./index";
import capacitorConfig from "../capacitor.config";

describe("CampusMesh Mobile Target Suite", () => {
  it("should detect web environment when Capacitor runtime is absent", () => {
    expect(isCapacitorEnvironment()).toBe(false);
    const info = getMobilePlatformInfo();
    expect(info.isNative).toBe(false);
    expect(info.platform).toBe("web");
    expect(info.version).toBe("0.1.0");
  });

  it("should manage Wi-Fi multicast lock lifecycle for LAN discovery", async () => {
    const manager = new MulticastLockManager();
    expect(manager.isHeld()).toBe(false);

    const acquired = await manager.acquireLock();
    expect(acquired).toBe(true);
    expect(manager.isHeld()).toBe(true);

    await manager.releaseLock();
    expect(manager.isHeld()).toBe(false);
  });

  it("should parse mobile deep links accurately", () => {
    const invite = parseMobileDeepLink("campusmesh://invite?fp=fp-mobile-user");
    expect(invite).not.toBeNull();
    expect(invite?.action).toBe("invite");
    expect(invite?.params["fp"]).toBe("fp-mobile-user");

    const chat = parseMobileDeepLink("campusmesh://chat?id=conv-mobile-1");
    expect(chat?.action).toBe("chat");
    expect(chat?.params["id"]).toBe("conv-mobile-1");

    expect(parseMobileDeepLink("http://campusmesh.app/invalid")).toBeNull();
  });

  it("should load valid Capacitor 8 configuration", () => {
    expect(capacitorConfig.appId).toBe("app.campusmesh.mobile");
    expect(capacitorConfig.appName).toBe("CampusMesh");
    expect(capacitorConfig.webDir).toBe("../web/dist");
    expect(capacitorConfig.server?.androidScheme).toBe("https");
  });
});
