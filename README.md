# CampusMesh

[![CI](https://github.com/spartacus-coder/CampusMesh/actions/workflows/ci.yml/badge.svg)](https://github.com/spartacus-coder/CampusMesh/actions/workflows/ci.yml)
[![Release Binaries](https://github.com/spartacus-coder/CampusMesh/actions/workflows/build-native-artifacts.yml/badge.svg)](https://github.com/spartacus-coder/CampusMesh/actions/workflows/build-native-artifacts.yml)
[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![Zero-Cost Budget](https://img.shields.io/badge/Infrastructure_Cost-%240.00%2Fmo-brightgreen)](docs/COST_POLICY.md)

CampusMesh (`v1.0.6`) is a privacy-first, decentralized peer-to-peer (P2P) communication platform built for college campuses, study circles, and off-grid / private messaging under a strict **`$0.00/month` infrastructure budget**.

It runs across **Windows Desktop**, **Android**, and **Web PWA**, combining **End-to-End Encrypted Double Ratchet messaging**, **WebRTC Voice/Video calling**, **Chunked P2P file transfer**, **Air-gapped Local Radios (UDP/TCP LAN, Wi-Fi Direct, BLE Mesh)**, and a native **Holepunch (`Hyperswarm` + `HyperDHT` + `Autobase`) sidecar + Desktop Hybrid Gateway** for serverless WAN discovery and scalable 100-peer groups.

---

## Table of Contents

- [Direct Downloads & Platforms](#-direct-downloads--platforms)
- [Platform Capability Matrix](#platform-capability-matrix)
- [Complete User Guide: How to Use Every Feature](#complete-user-guide-how-to-use-every-feature)
  - [1. Cryptographic Identity, Onboarding & Vault Backups](#1-cryptographic-identity-onboarding--vault-backups)
  - [2. Adding Contacts, QR Pairing & Invite Links](#2-adding-contacts-qr-pairing--invite-links)
  - [3. Verifying Safety Numbers (MITM Protection)](#3-verifying-safety-numbers-mitm-protection)
  - [4. Direct 1-to-1 Messaging & Offline Delivery States](#4-direct-1-to-1-messaging--offline-delivery-states)
  - [5. Encrypted P2P Voice & Video Calling + Background Ringing](#5-encrypted-p2p-voice--video-calling--background-ringing)
  - [6. Direct P2P Encrypted File Sharing (Up to 50 MB)](#6-direct-p2p-encrypted-file-sharing-up-to-50-mb)
  - [7. Decentralized Groups: Autobase Swarm (100 Peers) vs. Direct WebRTC Mesh (8 Peers)](#7-decentralized-groups-autobase-swarm-100-peers-vs-direct-webrtc-mesh-8-peers)
  - [8. Holepunch Hyperswarm, HyperDHT & Desktop Hybrid Gateway](#8-holepunch-hyperswarm-hyperdht--desktop-hybrid-gateway)
  - [9. Zero-Internet / Air-Gapped Mode (LAN TCP, Wi-Fi Direct, BLE Mesh & Manual SDP)](#9-zero-internet--air-gapped-mode-lan-tcp-wi-fi-direct-ble-mesh--manual-sdp)
  - [10. Appearance, Keyboard Shortcuts & Budget Guard](#10-appearance-keyboard-shortcuts--budget-guard)
- [Key Architectural Principles](#key-architectural-principles)
- [Transport & Hybrid Gateway Architecture](#transport--hybrid-gateway-architecture)
- [Monorepo Layout](#monorepo-layout)
- [Quick Start & Building from Source](#quick-start--building-from-source)
- [Documentation](#documentation)
- [License](#license)

---

## 📦 Direct Downloads & Platforms

| Platform                                  | Format    | Direct Download                                                                                                                           | Notes / Target                                                                                                                                                              |
| :---------------------------------------- | :-------- | :---------------------------------------------------------------------------------------------------------------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Windows Desktop (Installer)**           | `.exe`    | [**CampusMesh-setup.exe**](https://github.com/spartacus-coder/CampusMesh/releases/latest/download/CampusMesh-setup.exe)                   | **Recommended for Windows 10/11 (x64).** Includes full `swarm-runtime/` Holepunch + Bare sidecar (`Hyperswarm` + `HyperDHT` + `Autobase`) and `campusmesh://` deep linking. |
| **Windows Desktop (Portable + Swarm)**    | `.zip`    | [**CampusMesh-portable-swarm.zip**](https://github.com/spartacus-coder/CampusMesh/releases/latest/download/CampusMesh-portable-swarm.zip) | Extract and keep `CampusMesh-portable.exe` beside `swarm-runtime/` for full Holepunch Swarm support without installing.                                                     |
| **Windows Desktop (Standalone Portable)** | `.exe`    | [**CampusMesh-portable.exe**](https://github.com/spartacus-coder/CampusMesh/releases/latest/download/CampusMesh-portable.exe)             | Single-file executable. Runs WebRTC + Direct LAN natively; gracefully falls back when `swarm-runtime/` is absent.                                                           |
| **Android Mobile**                        | `.apk`    | [**CampusMesh.apk**](https://github.com/spartacus-coder/CampusMesh/releases/latest/download/CampusMesh.apk)                               | Universal Android 7.0+ (API 24+). Native Wi-Fi Multicast, Direct LAN TCP (`7778`), Wi-Fi Direct, BLE Mesh & foreground keepalive service.                                   |
| **Web App (Cloudflare Pages)**            | SPA / PWA | [**https://campusmesh.pages.dev**](https://campusmesh.pages.dev)                                                                          | Chrome, Firefox, Safari, Edge. Installable PWA + connects to Holepunch Swarm via any paired Desktop Hybrid Gateway.                                                         |
| **Web App (GitHub Pages)**                | SPA / PWA | [**https://spartacus-coder.github.io/CampusMesh/**](https://spartacus-coder.github.io/CampusMesh/)                                        | Static fallback mirror.                                                                                                                                                     |

Browse all versioned artifacts on [**GitHub Releases**](https://github.com/spartacus-coder/CampusMesh/releases/latest).

---

## Platform Capability Matrix

| Capability                                                                           | Windows Desktop (`.exe` w/ `swarm-runtime`) | Android Native (`.apk`)               | Web Browser (PWA)                                   |
| :----------------------------------------------------------------------------------- | :------------------------------------------ | :------------------------------------ | :-------------------------------------------------- |
| **Double Ratchet E2EE Direct Chat & 50 MB File Transfer**                            | Yes                                         | Yes                                   | Yes                                                 |
| **1-to-1 E2EE WebRTC Voice & Video Calls**                                           | Yes                                         | Yes                                   | Yes                                                 |
| **Background Call Notifications & Synthesized Ringtone**                             | Yes                                         | Yes (Native Notification + Vibration) | Yes (Tab Title Flash + Web Audio + OS Notification) |
| **Cloudflare Durable Object Signaling + 24h Offline Mailbox**                        | Yes                                         | Yes                                   | Yes                                                 |
| **Manual Air-Gapped Offer/Answer P2P Pairing**                                       | Yes                                         | Yes                                   | Yes                                                 |
| **Local UDP Multicast Discovery (`239.255.255.250:7777`) & Direct LAN TCP (`7778`)** | Yes                                         | Yes                                   | No (Browser sandbox restriction)                    |
| **Wi-Fi Direct (`Wi-Fi P2P`) & Bluetooth LE (`BLE Mesh`)**                           | No                                          | Yes                                   | No                                                  |
| **Full Holepunch Sidecar (`Bare` + `Hyperswarm` + `HyperDHT` + `Autobase`)**         | **Yes (Native UTP + Noise)**                | Bridged via Desktop Hybrid Gateway    | Bridged via Desktop Hybrid Gateway                  |
| **Direct WebRTC Mesh Groups (up to 8 peers)**                                        | Yes                                         | Yes                                   | Yes                                                 |
| **Autobase Swarm Groups (up to 100 peers)**                                          | **Yes (Full multi-writer)**                 | **Yes (via Gateway / FAN-out)**       | **Yes (via Gateway / FAN-out)**                     |

---

## Complete User Guide: How to Use Every Feature

### 1. Cryptographic Identity, Onboarding & Vault Backups

CampusMesh has **no centralized login, email, or phone database**. Your account lives locally on your device as an encrypted Ed25519 (signing) + X25519 (key exchange) identity derived from a **24-word BIP-39 mnemonic phrase**.

- **Creating a new identity (`New` tab):**
  1. Launch CampusMesh and open the **New** tab on the **Cryptographic Identity** modal.
  2. Enter a **Display Name / Alias** (this alias is shared with peers when you chat or call) and a **Local Keystore Passphrase** (minimum 8 characters), then confirm it.
  3. Write down or click **Copy Words** for your **24-Word Recovery Phrase**.
  4. Check **I have saved my recovery phrase** and click **Enter CampusMesh**.
- **Unlocking an existing vault:**
  - When reopening CampusMesh, enter your passphrase under **Unlock Your Vault** and click **Unlock Identity**.
- **Locking or backing up from Settings (`/settings`):**
  1. Navigate to **Settings** in the left rail (or bottom bar on mobile).
  2. In the **Cryptographic Identity** card:
     - Click **Copy** to copy your **Safety Fingerprint**.
     - Click **Show QR Card** to display your shareable identity card.
     - Click **Export Encrypted Backup**, confirm your passphrase, and click **Download** to save `campusmesh-backup-<timestamp>.json`.
     - Click **Lock Vault** whenever stepping away from a shared device.
- **Restoring on another device (`Restore Phrase` or `Import Backup`):**
  - Use **Restore Phrase** and paste the exact 24 words (space-separated) with a new local passphrase, **or** open **Import Backup**, paste the contents of your exported `.json` backup file, and enter the backup passphrase.
  - _Tip:_ If you run CampusMesh on both your laptop (`.exe`) and phone/browser with separate accounts for testing, keep separate recovery phrases on each device so peers can verify two distinct Safety Fingerprints cleanly.

---

### 2. Adding Contacts, QR Pairing & Invite Links

You can add peers before messaging them, or save them straight from an incoming message:

1. **Share your own identity:**
   - Open **Contacts** (`/contacts`) → click **My QR** (or **Settings** → **Show QR Card**).
   - Either let your peer scan the **Identity QR Card**, click **Copy Invite Link** (copies a `campusmesh://identity?v=1&name=...&fp=...&edPk=...&xPk=...` URI), or click **Copy Fingerprint**.
2. **Add a peer (`Contacts` → `Add Contact`):**
   - **Scan Camera tab:** Uses your device camera (`html5-qrcode`) to scan a peer's QR card instantly.
   - **Paste Invite / QR tab:** Paste a `campusmesh://identity?...` invite link or raw QR payload shared over another channel; CampusMesh previews the peer's Display Name, Fingerprint, and public keys before saving.
   - **Manual Entry tab:** Enter the peer's Display Name and Safety Fingerprint directly if exchanging fingerprints out-of-band.
3. **One-click save from an incoming chat:**
   - If someone messages you using your invite link or over LAN before you've added them, CampusMesh displays their Display Name (falling back to a short peer label only if no alias was sent) and shows an **Add Contact** button in the top chat header. Saving a custom alias updates the conversation title automatically.
4. **Organizing contacts:**
   - Use the **All**, **Verified**, and **Blocked** filter tabs in **Contacts**, search by name or fingerprint, or use the per-row actions (**Message**, **Verify**, **Block/Unblock Contact**, **Delete Contact**).

---

### 3. Verifying Safety Numbers (MITM Protection)

To verify that no third party intercepted your public key exchange:

1. Open **Contacts** and click **Verify** next to any contact (or click the **Verified / Unverified** badge directly).
2. Compare the **6-block numeric Safety Number grid** on your screen with the same screen on your peer's device (in person or over a trusted voice call).
3. Click the confirmation button to toggle the contact's status to **Verified**.
4. Inside any active chat, click the **`ⓘ` (`Inspect Verification & Details`)** button in the header to view the peer's **Safety Number (Fingerprint)** and key verification badge at any time.

---

### 4. Direct 1-to-1 Messaging & Offline Delivery States

1. Select a contact in **Messages** (or click **Message** from **Contacts**, or tap **Browse Contacts** / **New Chat**).
2. Type in the bottom composer (`Type an encrypted message...`) and press Enter or **Send**.
3. Every outgoing message moves through local persistence and delivery confirmations shown under the bubble:
   - **Clock icon (`Saved locally`):** Encrypted and queued in IndexedDB / Desktop SQLite while offline or waiting for a route.
   - **Single check (`Sent to peer`):** Dispatched over at least one active path.
   - **Double check (`Delivered` / `Read`):** Confirmed delivered or read when the recipient views the conversation.
4. **How CampusMesh routes your message (automatically in parallel):**
   - Over an open **WebRTC P2P DataChannel** (`cm-messages`) whenever connected.
   - Over **Direct LAN TCP (`port 7778`)** when the peer is on your local Wi-Fi / Ethernet (`lanPeers`).
   - Over **Holepunch Hyperswarm** (`cm_data` / Protomux `campusmesh/rpc/v1`) when running Desktop or bridged through a Desktop Gateway.
   - Over the zero-cost **Cloudflare Durable Object ephemeral signaling / 24-hour offline mailbox** if the direct socket isn't established yet.

---

### 5. Encrypted P2P Voice & Video Calling + Background Ringing

CampusMesh supports direct peer-to-peer **Voice** and **Video** calls over encrypted WebRTC media streams (SRTP/DTLS) in any 1-to-1 conversation:

1. **Placing a call:**
   - Open a 1-to-1 chat and click the **Phone icon** (`Start P2P Voice Call`) or **Video icon** (`Start P2P Video Call`) in the top-right chat header.
   - Grant microphone (and camera, for video calls) permission when prompted by Windows/Android/browser.
   - You will hear an outgoing ringtone (`Ringing peer directly...`) until the recipient answers or declines.
2. **Receiving calls — even in minimized/background browser tabs:**
   - CampusMesh plays a synthesized Web Audio incoming ringtone, flashes the browser tab title (`📞 Incoming Voice/Video Call — <Caller>`), vibrates supported mobile devices, triggers a browser/OS notification, and displays the **Encrypted P2P Incoming Call** modal.
   - Click the green **Answer** button to connect or the red **Decline Call** button to reject.
   - _Tip for Web Browsers:_ Allow **Notifications** and ensure tab sound is unmuted so background call alerts work like WhatsApp Web even when the browser window is minimized.
3. **In-call controls:**
   - **Mute / Unmute Microphone** and **Turn Camera On / Off** (video calls).
   - Picture-in-picture mirrored local self-preview on video calls with connected call timer (`Connected • MM:SS`).
   - If browser autoplay blocks remote audio on first join, an amber **Tap to Enable Call Speaker** button appears at the top of the call modal — tap it once to resume remote speaker audio cleanly.
   - Click the red **End Call** button to hang up.

---

### 6. Direct P2P Encrypted File Sharing (Up to 50 MB)

1. Open a conversation with a peer and click the **Paperclip icon** (`Attach File (Direct P2P)`) on the left side of the message composer.
2. Select any file up to **`50 MB`**.
3. CampusMesh computes a **SHA-256 checksum**, splits the file into chunks, and streams them directly over the WebRTC binary DataChannel (`cm-binary`) with backpressure control and a live **progress bar** inside the chat bubble.
4. Once received and verified, the recipient can download/open the verified attachment directly from the message bubble.

---

### 7. Decentralized Groups: Autobase Swarm (100 Peers) vs. Direct WebRTC Mesh (8 Peers)

1. Go to **Contacts** → click **Group** (`New Mesh Group`) in the top-right header to open **Create Mesh Group**.
2. Pick the **Swarm Topology Mode** best suited for your group:
   - **Autobase Swarm (`Up to 100 peers • HyperDHT + LAN`):** Recommended for classes, clubs, and larger dorm circles. Replicates group messages across an **Autobase** multi-writer append-only hypercore log over HyperDHT/Hyperswarm (with parallel direct WebRTC, LAN TCP, and signaling fan-out for instant delivery).
   - **Direct WebRTC Mesh (`Up to 8 peers • Browser P2P`):** Bounded peer-to-peer WebRTC mesh ideal for small browser-only groups without any desktop gateway node.
3. Enter a **Group Name** (and optional Description), check initial members from your contact list (watch the `N / 100 Peers` or `N / 8 Peers` badge), and submit.
4. Group chats are isolated cleanly (`grp-*`) from 1-to-1 DMs (`conv-*`), so the same friend's messages in a group never collide with your private DM thread.

---

### 8. Holepunch Hyperswarm, HyperDHT & Desktop Hybrid Gateway

CampusMesh adapts its Holepunch P2P layer to each device's networking capabilities:

- **Windows Desktop (`.exe` installed via `CampusMesh-setup.exe` or `CampusMesh-portable-swarm.zip`):**
  - Automatically launches the bundled **Bare runtime (`bare.exe` + `swarm.bundle`)** sidecar as a quiet background process supervised by Rust (`SwarmSidecarManager`).
  - Derives a persistent Corestore Noise keypair, joins **HyperDHT** topics (`deriveTopicHex`) via UDP/UTP NAT hole-punching (requiring zero STUN/TURN or cloud signaling once peered), multiplexes CampusMesh packets over **Protomux** (`campusmesh/rpc/v1`), and replicates **Autobase** group logs across peers.
- **Web PWA & Android APK (`Hybrid Gateway` mode):**
  - Browsers and Android WebViews cannot bind raw UDP/UTP HyperDHT sockets directly.
  - Whenever an Android APK or Web PWA client connects to a CampusMesh Windows Desktop peer over WebRTC, the Desktop client automatically sends a `gateway_announce` packet over the `cm-control` DataChannel.
  - The Web/Android client pairs via `WebRtcSwarmGatewayAdapter` and transparently delegates HyperDHT topic joins, broadcasts, and Autobase log reads/appends through that Desktop peer.
- **Checking live status:**
  - Open **Settings** → **Holepunch Swarm & Parallel Mesh** to see:
    - Connection badge: **`HyperDHT Online`** (Desktop native), **`Gateway Connected`** (Web/Android bridged to Desktop), or **`WebRTC Direct`**.
    - **Swarm Node Key**, **Swarm UTP Peers** count, **Local LAN Peers** count (`Direct TCP Active` or `Multicast Standby`), and connected **Desktop Gateway** fingerprint.
  - Open any chat header's **`ⓘ` button** → **Session Diagnostics** to inspect the live transport stack (`Hyperswarm UTP + WebRTC + LAN TCP` vs `WebRTC + Desktop Hybrid Gateway` vs `WebRTC DataChannel + LAN`) and Group Log mode (`Autobase Multi-Writer` vs `WebRTC Bounded Mesh`).

---

### 9. Zero-Internet / Air-Gapped Mode (LAN TCP, Wi-Fi Direct, BLE Mesh & Manual SDP)

CampusMesh keeps working even if your campus Wi-Fi loses internet access or Cloudflare is completely unreachable:

1. **Zero-Server Campus LAN (`0ms LAN`) — Windows Desktop & Android:**
   - Native builds continuously broadcast presence over **UDP Multicast (`239.255.255.250:7777`)** and listen on **TCP (`port 7778`, ephemeral fallback)** for direct encrypted JSON payloads (`lan_send_direct` / `sendLanDirect`).
   - Discovered peers appear automatically in the left sidebar under **`Nearby on Campus`**. Click any `0ms LAN` peer to open a direct conversation with zero internet.
2. **Android Wi-Fi Direct (`Wi-Fi P2P`) & Bluetooth Low Energy (`BLE Mesh`):**
   - On Android, grant nearby Wi-Fi / Bluetooth permissions when prompted. Nearby Android peers appear in **`Nearby on Campus`** tagged `Wi-Fi P2P` or `BLE Mesh` alongside `0ms LAN`.
   - A native Android foreground service (`MeshForegroundService`) helps preserve background mesh connectivity.
3. **Air-Gapped Manual P2P Connect (`Manual P2P Connect (Offline / Air-Gapped)`):**
   - Works even across two browsers with zero internet or LAN multicast:
   - Click the **Radio icon** in any chat's top header.
   - Peer A chooses offer generation, enters Peer B's fingerprint, and shares the generated **Offer** string (via clipboard, QR, USB, or local file).
   - Peer B pastes the Offer string, generates an **Answer** string, and sends it back; Peer A accepts the Answer to open a direct WebRTC DataChannel.

---

### 10. Appearance, Keyboard Shortcuts & Budget Guard

- **Themes (`Dark` / `Light` / `High Contrast`):** Switch anytime in **Settings** → **Appearance Theme** or using the sun/moon icon in the bottom-left navigation rail (bottom bar on mobile).
- **Command Palette:** Press `Cmd+K` / `Ctrl+K` (or click the **Command** icon in the bottom-left rail) to jump straight to Contacts, Groups, QR Scanner, Security, or Settings.
- **Zero-Cost Guard (`$0.00/mo`):** Inspect free-tier boundaries in **Settings** → **Infrastructure Budget & Fail-Closed Guard** (`Cloudflare Workers`, `Cloudflare DO SQLite`, and public STUN servers on ports `3478` and `19302`). If free signaling quotas are ever exhausted, CampusMesh fails closed and switches gracefully to direct LAN / manual P2P rather than incurring charges.

---

## Key Architectural Principles

1. **Peer-to-Peer First:** Communication flows directly between user devices. No centralized message server stores conversation plaintext.
2. **Strictly Zero-Cost Infrastructure:** Operates with a hard `$0.00/month` cap using fail-closed free-tier Cloudflare primitives only for optional WAN bootstrapping and ephemeral 24-hour signaling mailboxes.
3. **Decentralized Local-First Identity:** Ed25519 + X25519 keypairs generated and stored locally from a 24-word BIP-39 seed.
4. **End-to-End Encryption:** Double Ratchet protocol providing Forward Secrecy (FS) and Post-Compromise Security (PCS), paired with Holepunch Noise transport encryption on Desktop swarm links.
5. **Cross-Platform Shared Core:** Shared TypeScript domain packages power the Vue 3 Web PWA, Windows Tauri 2 Desktop (plus Bare Holepunch runtime), and Capacitor 8 Android APK.

---

## Transport & Hybrid Gateway Architecture

```text
+-------------------------------------------------------------------------+
|                    CampusMesh Client (Identity & E2EE)                  |
+-------------------------------------------------------------------------+
          |                    |                          |
          v                    v                          v
  [1. WebRTC P2P]      [2. Local Radios]       [3. Holepunch Swarm]
  • cm-messages        • UDP Multicast :7777   • Windows Desktop Bare Sidecar
  • cm-binary (50MB)   • Direct LAN TCP :7778    (HyperDHT + Hyperswarm + Autobase)
  • cm-control         • Android Wi-Fi Direct  • Web / Android via Hybrid Gateway
  • Audio/Video SRTP   • Android BLE Mesh        relayed over WebRTC cm-control
          |                    |                          |
          +--------------------+--------------------------+
                               | (Fallback when direct P2P offline)
                               v
         [Cloudflare Worker + Durable Objects + Public STUN]
         (Ephemeral WebSocket room signaling & 24h TTL mailbox)
```

---

## Monorepo Layout

```text
campusmesh/
├── apps/
│   ├── web/                         # Vue 3 SPA + Vite + Tailwind + shadcn-vue + PWA
│   ├── desktop/                     # Tauri 2 Desktop container (Windows NSIS & Portable)
│   │   ├── src-tauri/               # Rust host: LAN multicast/TCP engine, SQLite queue, Bare supervisor
│   │   └── swarm-sidecar/           # Standalone Bare ESM sidecar (Hyperswarm, HyperDHT, Corestore, Autobase)
│   └── mobile/                      # Capacitor 8 Android container (LAN TCP, Wi-Fi Direct, BLE, FG Service)
│
├── packages/
│   ├── shared-types/                # Core domain types, DTOs, Conversation & MeshGroup swarm schemas
│   ├── crypto/                      # WebCrypto / Libsodium Double Ratchet, Ed25519, X25519, BIP-39
│   ├── storage/                     # Dexie IndexedDB adapter, migrations, message/contact persistence
│   ├── protocol/                    # Zod wire schemas, envelope validation, serialization
│   ├── transport/                   # WebRTC DataChannels, IPeerSwarmAdapter, Desktop IPC & Hybrid Gateway adapters
│   ├── identity/                    # Key generation, QR identity cards, encrypted JSON backup/restore
│   ├── contacts/                    # Contact book, 6-block Safety Numbers, trust verification
│   ├── messaging/                   # Ratchet engine, 6 delivery states, WebRTC call session state machine
│   ├── groups/                      # Bounded WebRTC mesh (2..8 peers) & Autobase Swarm groups (up to 100 peers)
│   ├── file-transfer/               # Chunked binary streaming (up to 50 MB), backpressure, SHA-256 verification
│   ├── notifications/               # Cross-platform notification port (Browser + Tauri + Android)
│   └── ui/                          # Design tokens, shadcn-vue & Reka UI components, Command Palette
│
├── infrastructure/
│   └── cloudflare/                  # Ephemeral WebSocket signaling & DO room coordinator ($0.00/mo free tier)
│
└── docs/                            # Architecture specs, ADRs, threat model, research & cost policy
```

---

## Quick Start & Building from Source

### Prerequisites

- **Node.js:** `>= 20.0.0`
- **pnpm:** `>= 9.0.0`
- **Rust toolchain + Tauri prerequisites** _(only needed when building the Windows `.exe` installer locally)_
- **Android SDK / Java 17+** _(only needed when building the Android `.apk` locally)_

### Workspace Setup & Verification

```bash
# Clone the repository
git clone https://github.com/spartacus-coder/CampusMesh.git
cd CampusMesh

# Install monorepo workspace dependencies
pnpm install

# Start the Web PWA in development mode
pnpm dev

# Check code formatting, lint rules, TypeScript/Vue types, and run all 120 unit tests
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
```

### Building Platform Targets

```bash
# 1. Production Web PWA bundle (outputs to apps/web/dist)
pnpm --filter @campusmesh/web build

# 2. Bundle the standalone Bare Holepunch sidecar into apps/desktop/src-tauri/swarm-runtime/
pnpm --filter @campusmesh/desktop build:sidecar

# 3. Build Windows Desktop Tauri application (builds web + sidecar + NSIS/portable binaries)
pnpm --filter @campusmesh/desktop build

# 4. Sync Web build into Capacitor Android project (then open or assemble in apps/mobile/android)
pnpm --filter @campusmesh/mobile build
```

---

## Documentation

- [System Architecture](docs/ARCHITECTURE.md)
- [Hyperswarm & Holepunch Evaluation](docs/research/HYPERSWARM_EVALUATION.md)
- [Zero-Cost Budget Policy](docs/COST_POLICY.md)
- [Security & Cryptographic Model](docs/SECURITY.md)
- [Threat Model](docs/THREAT_MODEL.md)
- [Protocol Specification](docs/PROTOCOL_SPECIFICATION.md)
- [Performance & Benchmarking Standards](docs/PERFORMANCE.md)
- [Implementation Status](docs/IMPLEMENTATION_STATUS.md)
- [Development Roadmap](docs/ROADMAP.md)
- [Deployment Guide](docs/DEPLOYMENT.md)
- [Release Process](docs/RELEASE_PROCESS.md)
- [Branching & Collaboration Strategy](docs/BRANCHING_STRATEGY.md)
- [Contributing Guidelines](docs/CONTRIBUTING.md)
- [Architecture Decision Records (ADRs)](docs/adr/)

---

## License

Licensed under the [Apache License, Version 2.0](LICENSE).
