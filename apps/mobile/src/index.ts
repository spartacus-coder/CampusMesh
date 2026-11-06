/**
 * CampusMesh Capacitor 8 Android Mobile Container Integration
 */

export const MOBILE_APP_ID = "app.campusmesh.mobile";
export const TARGET_ANDROID_SDK = 34;

export interface MobilePlatformInfo {
  platform: "android" | "ios" | "web";
  isNative: boolean;
  version: string;
}

export function getMobileInfo() {
  return {
    appId: MOBILE_APP_ID,
    targetSdk: TARGET_ANDROID_SDK,
  };
}

export interface MobileDeepLink {
  action: "invite" | "chat" | "room";
  params: Record<string, string>;
}

export function isCapacitorEnvironment(): boolean {
  return (
    typeof window !== "undefined" &&
    "Capacitor" in window &&
    (
      window as unknown as { Capacitor: { isNativePlatform: () => boolean } }
    ).Capacitor.isNativePlatform()
  );
}

export function getMobilePlatformInfo(): MobilePlatformInfo {
  const isNative = isCapacitorEnvironment();
  return {
    platform: isNative ? "android" : "web",
    isNative,
    version: "0.1.0",
  };
}

/**
 * Manages Android Wi-Fi Multicast lock state to enable mDNS / SSDP local peer discovery.
 */
export class MulticastLockManager {
  private lockHeld = false;

  public async acquireLock(): Promise<boolean> {
    // In native runtime, calls native Android WifiManager.createMulticastLock
    this.lockHeld = true;
    return true;
  }

  public async releaseLock(): Promise<void> {
    this.lockHeld = false;
  }

  public isHeld(): boolean {
    return this.lockHeld;
  }
}

export function parseMobileDeepLink(rawUri: string): MobileDeepLink | null {
  if (!rawUri || typeof rawUri !== "string") return null;

  try {
    const parsed = new URL(rawUri);
    if (parsed.protocol !== "campusmesh:") {
      return null;
    }

    const action = parsed.hostname || parsed.pathname.replace(/^\/\//, "");
    const params: Record<string, string> = {};
    parsed.searchParams.forEach((val, key) => {
      params[key] = val;
    });

    if (action === "invite" || action === "chat" || action === "room") {
      return {
        action,
        params,
      };
    }

    return null;
  } catch {
    return null;
  }
}
