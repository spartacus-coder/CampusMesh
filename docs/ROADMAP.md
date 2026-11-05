# CampusMesh Development Roadmap

| Phase        | Branch                                                | Target Deliverable                                                                    | Status      |
| ------------ | ----------------------------------------------------- | ------------------------------------------------------------------------------------- | ----------- |
| **Phase 0**  | `chore/repository-foundation`                         | Monorepo setup, pnpm workspaces, toolchain, CI, architecture documentation            | In Progress |
| **Phase 1**  | `feat/web-pwa-foundation`                             | Vue 3 + Tailwind CSS + shadcn-vue + Reka UI app shell, desktop & mobile layouts, PWA  | Planned     |
| **Phase 2**  | `feat/local-identity`                                 | BIP-39 mnemonic, Ed25519/X25519 key generation, Argon2id encrypted keystore, QR codes | Planned     |
| **Phase 3**  | `feat/webrtc-transport` & `feat/cloudflare-signaling` | WebRTC DataChannels, Cloudflare Worker + DO room coordinator, Base45 manual fallback  | Planned     |
| **Phase 4**  | `feat/direct-messaging`                               | E2EE protocol evaluation (Double Ratchet vs MLS), 6 delivery states, virtualized chat | Planned     |
| **Phase 5**  | `feat/contact-management` & `feat/group-messaging`    | Safety numbers, bounded mesh groups (2, 4, 8 peers), authenticated membership         | Planned     |
| **Phase 6**  | `feat/p2p-file-transfer`                              | Chunked binary streaming, RTCDataChannel backpressure, SHA-256 verification           | Planned     |
| **Phase 7**  | `feat/offline-sync`                                   | Outbox pattern in IndexedDB, ephemeral Cloudflare DO encrypted mailbox (TTL 48h)      | Planned     |
| **Phase 8**  | `feat/desktop-tauri` & `feat/android-capacitor`       | Tauri 2 NSIS installer + auto-updater, Capacitor 8 Android APK packaging              | Planned     |
| **Phase 9**  | `feat/voice-messages` & `feat/voice-calls`            | Opus voice notes with waveform, 1-to-1 WebRTC audio/video calls                       | Planned     |
| **Phase 10** | `experiment/pear-hyperswarm`                          | Holepunch Pear / Hyperswarm / Autobase R&D spike and benchmark report                 | Planned     |
