import { describe, it, expect } from "vitest";
import { getDesktopPlatformInfo, DESKTOP_TARGET } from "./index";

describe("@campusmesh/desktop", () => {
  it("should specify windows-nsis desktop target", () => {
    const info = getDesktopPlatformInfo();
    expect(info.target).toBe(DESKTOP_TARGET);
    expect(info.protocolHandler).toBe("campusmesh://");
  });
});
