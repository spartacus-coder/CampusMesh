import { describe, it, expect } from "vitest";
import { getAppInfo, APP_NAME } from "./index";

describe("@campusmesh/web", () => {
  it("should return app info for web platform", () => {
    const info = getAppInfo();
    expect(info.name).toBe(APP_NAME);
    expect(info.platform).toBe("web");
  });
});
