import { createApp } from "vue";
import { createPinia } from "pinia";
import router from "./router";
import App from "./App.vue";
import "@campusmesh/ui/styles/theme.css";
import "./style.css";

// PWA auto-update registration (Web only — disabled in native Tauri/Capacitor to prevent stale caching)
if (typeof window !== "undefined") {
  const isNative = Boolean(
    (window as unknown as { __TAURI_INTERNALS__?: unknown })
      .__TAURI_INTERNALS__ ||
    (window as unknown as { __TAURI__?: unknown }).__TAURI__ ||
    window.location.origin.includes("tauri.localhost") ||
    (
      window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }
    ).Capacitor?.isNativePlatform?.(),
  );

  if (isNative) {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        for (const registration of registrations) {
          registration.unregister();
        }
      });
      if ("caches" in window) {
        caches.keys().then((names) => {
          for (const name of names) {
            caches.delete(name);
          }
        });
      }
    }
  } else {
    import("virtual:pwa-register").then(({ registerSW }) => {
      registerSW({ immediate: true });
    });
  }
}

const app = createApp(App);
app.use(createPinia());
app.use(router);

app.mount("#app");
