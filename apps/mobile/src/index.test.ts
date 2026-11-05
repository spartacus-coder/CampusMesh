import { describe, it, expect } from "vitest";
import { getMobileInfo, MOBILE_APP_ID, TARGET_ANDROID_SDK } from "./index";

describe("@campusmesh/mobile", () => {
  it("should return mobile configuration with locked appId", () => {
    const info = getMobileInfo();
    expect(info.appId).toBe(MOBILE_APP_ID);
    expect(info.targetSdk).toBe(TARGET_ANDROID_SDK);
  });
});
