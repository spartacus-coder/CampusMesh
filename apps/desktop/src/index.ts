/**
 * CampusMesh Tauri 2 Desktop Shell Integration
 */

export const DESKTOP_TARGET = "windows-nsis";

export interface DesktopPlatformInfo {
  platform: "tauri" | "web";
  isDesktop: boolean;
  version: string;
  target: string;
  protocolHandler: string;
}

export interface DeepLinkAction {
  action: "invite" | "chat" | "room";
  params: Record<string, string>;
}

export function isTauriEnvironment(): boolean {
  return (
    typeof window !== "undefined" &&
    ("__TAURI_INTERNALS__" in window || "__TAURI__" in window)
  );
}

export function getDesktopPlatformInfo(): DesktopPlatformInfo {
  const isDesktop = isTauriEnvironment();
  return {
    platform: isDesktop ? "tauri" : "web",
    isDesktop,
    version: "0.1.0",
    target: DESKTOP_TARGET,
    protocolHandler: "campusmesh://",
  };
}

export function parseDesktopDeepLink(rawUri: string): DeepLinkAction | null {
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

export class DesktopWindowManager {
  private isMaximized = false;

  public async toggleMaximize(): Promise<boolean> {
    this.isMaximized = !this.isMaximized;
    return this.isMaximized;
  }

  public getWindowState(): { isMaximized: boolean } {
    return { isMaximized: this.isMaximized };
  }
}
