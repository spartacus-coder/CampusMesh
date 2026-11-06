import { createApp } from "vue";
import { createPinia } from "pinia";
import router from "./router";
import App from "./App.vue";
import "@campusmesh/ui/styles/theme.css";
import "./style.css";

// PWA auto-update registration
import { registerSW } from "virtual:pwa-register";
registerSW({ immediate: true });

const app = createApp(App);
app.use(createPinia());
app.use(router);

app.mount("#app");
