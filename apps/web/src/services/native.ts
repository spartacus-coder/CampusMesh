/**
 * CampusMesh Native Platform Bridge
 * Coordinates between Desktop (Tauri 2 Rust), Mobile (Capacitor 8 Android), and Web PWA
 */

export interface NativeBridge {
  isTauri: boolean;
  isAndroid: boolean;
  isNative: boolean;
  initNativeServices: () => Promise<void>;
  notifyMessage: (title: string, body: string, conversationId?: string) => Promise<void>;
  hapticFeedback: () => Promise<void>;
}

interface CampusMeshNativePluginApi {
  startForegroundService?: (
    options?: Record<string, unknown>,
  ) => Promise<unknown>;
  stopForegroundService?: (
    options?: Record<string, unknown>,
  ) => Promise<unknown>;
  isServiceRunning?: () => Promise<unknown>;
  showNotification?: (options: {
    title: string;
    body: string;
    conversationId?: string;
  }) => Promise<unknown>;
  triggerHaptic?: () => Promise<unknown>;
  [key: string]: unknown;
}

interface CapacitorGlobal {
  isNativePlatform?: () => boolean;
  Plugins?: Record<string, unknown>;
}

function getCampusMeshPlugin(): CampusMeshNativePluginApi | null {
  if (typeof window !== "undefined") {
    const cap = (window as unknown as { Capacitor?: CapacitorGlobal })
      .Capacitor;
    if (cap?.Plugins?.CampusMeshNative) {
      return cap.Plugins.CampusMeshNative as CampusMeshNativePluginApi;
    }
  }
  return null;
}

export const nativeService = {
  get isTauri(): boolean {
    return (
      typeof window !== "undefined" &&
      ("__TAURI_INTERNALS__" in window || "__TAURI__" in window)
    );
  },

  get isAndroid(): boolean {
    if (typeof window === "undefined") return false;
    const cap = (window as unknown as { Capacitor?: CapacitorGlobal })
      .Capacitor;
    return Boolean(cap?.isNativePlatform?.());
  },

  get isNative(): boolean {
    return this.isTauri || this.isAndroid;
  },

  async initNativeServices(): Promise<void> {
    // 1. Request Browser / System Notification Permissions
    if (typeof window !== "undefined" && "Notification" in window) {
      if (Notification.permission === "default") {
        try {
          await Notification.requestPermission();
        } catch {
          // Ignore rejection on strict browsers
        }
      }
    }

    // 2. If Android Native, start 24/7 Mesh Foreground Service
    if (this.isAndroid) {
      const nativePlugin = getCampusMeshPlugin();
      if (nativePlugin?.startForegroundService) {
        try {
          await nativePlugin.startForegroundService();
          console.info(
            "[CampusMesh Native] Android MeshForegroundService started successfully.",
          );
        } catch (err) {
          console.warn(
            "[CampusMesh Native] Failed to auto-start Android MeshForegroundService:",
            err,
          );
        }
      }
    }
  },

  async notifyMessage(
    title: string,
    body: string,
    conversationId?: string,
  ): Promise<void> {
    // Do not alert if document is currently focused and active
    if (typeof document !== "undefined" && document.hasFocus()) {
      return;
    }

    // A. Android Native via Custom Plugin
    if (this.isAndroid) {
      const nativePlugin = getCampusMeshPlugin();
      if (nativePlugin?.showNotification) {
        try {
          await nativePlugin.showNotification({
            title,
            body,
            conversationId: conversationId || "",
          });
          return;
        } catch (err) {
          console.warn(
            "[CampusMesh Native] Native notification failed, falling back to Web API:",
            err,
          );
        }
      }
    }

    // B. Desktop (Tauri) & Web PWA Notification
    if (
      typeof window !== "undefined" &&
      "Notification" in window &&
      Notification.permission === "granted"
    ) {
      try {
        const notif = new Notification(title, {
          body,
          icon: "/vite.svg",
          tag: conversationId || "campusmesh_msg",
        });
        notif.onclick = () => {
          window.focus();
        };
      } catch (err) {
        console.warn("[CampusMesh Native] Web Notification failed:", err);
      }
    }
  },

  async hapticFeedback(): Promise<void> {
    if (this.isAndroid) {
      const nativePlugin = getCampusMeshPlugin();
      if (nativePlugin?.triggerHaptic) {
        try {
          await nativePlugin.triggerHaptic();
          return;
        } catch {
          // Fall through
        }
      }
    }

    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate(35);
    }
  },
};
