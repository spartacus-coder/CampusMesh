export const MOBILE_APP_ID = "org.campusmesh.app";
export const TARGET_ANDROID_SDK = 34;

export function getMobileInfo() {
  return {
    appId: MOBILE_APP_ID,
    targetSdk: TARGET_ANDROID_SDK,
    platform: "android",
  };
}
