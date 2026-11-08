# CampusMesh

[![CI](https://github.com/spartacus-coder/CampusMesh/actions/workflows/ci.yml/badge.svg)](https://github.com/spartacus-coder/CampusMesh/actions/workflows/ci.yml)
[![Release Binaries](https://github.com/spartacus-coder/CampusMesh/actions/workflows/build-native-artifacts.yml/badge.svg)](https://github.com/spartacus-coder/CampusMesh/actions/workflows/build-native-artifacts.yml)
[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![Zero-Cost Budget](https://img.shields.io/badge/Infrastructure_Cost-%240.00%2Fmo-brightgreen)](docs/COST_POLICY.md)

CampusMesh is a privacy-first, decentralized peer-to-peer (P2P) communication platform designed for college communities, student circles, and personal private communication with a strict **$0.00/month infrastructure budget**.

---

## 📦 Direct Downloads & Platforms

| Platform | Format | Direct Download | Target |
| :--- | :--- | :--- | :--- |
| **Android Mobile** | `.apk` | [**CampusMesh.apk**](https://github.com/spartacus-coder/CampusMesh/releases/latest/download/CampusMesh.apk) | Universal Android 8.0+ |
| **Windows Desktop (Installer)** | `.exe` | [**CampusMesh-setup.exe**](https://github.com/spartacus-coder/CampusMesh/releases/latest/download/CampusMesh-setup.exe) | Windows 10 / 11 (x64) |
| **Windows Desktop (Portable)** | `.exe` | [**CampusMesh-portable.exe**](https://github.com/spartacus-coder/CampusMesh/releases/latest/download/CampusMesh-portable.exe) | Windows 10 / 11 (Standalone) |
| **Web App (Cloudflare Pages)** | SPA / PWA | [**https://campusmesh.pages.dev**](https://campusmesh.pages.dev) | Chrome, Firefox, Safari, Edge |
| **Web App (GitHub Pages)** | SPA / PWA | [**https://spartacus-coder.github.io/CampusMesh/**](https://spartacus-coder.github.io/CampusMesh/) | Fallback Static Mirror |

---

## Key Architectural Principles

1. **Peer-to-Peer First:** Communication flows directly between user devices. No centralized message server stores conversation plaintext.
2. **Strictly Zero-Cost Infrastructure:** Operates with a hard $0.00/month infrastructure cap. Uses fail-closed free-tier cloud primitives only.
3. **Decentralized Local-First Identity:** Cryptographic keypairs (Ed25519 & X25519) generated on-device. No email, phone number, or centralized account database.
4. **End-to-End Encryption:** Formal asynchronous ratchet protocols guaranteeing Forward Secrecy (FS) and Post-Compromise Security (PCS).
5. **Cross-Platform Shared Core:** Shared TypeScript domain logic powering a responsive Web PWA, Windows Desktop installer (Tauri 2), and Android APK (Capacitor 8).
6. **Premium UI/UX:** Built on Vue 3, Tailwind CSS, shadcn-vue, and Reka UI with full keyboard navigation, conversation virtualization, and complete UX state machines.

---

## Monorepo Layout

```text
campusmesh/
├── apps/
│   ├── web/                         # Vue 3 SPA + Vite + Tailwind + shadcn-vue + PWA
│   ├── desktop/                     # Tauri 2 Desktop container (Windows NSIS target)
│   └── mobile/                      # Capacitor 8 Android container
│
├── packages/
│   ├── shared-types/                # Core domain types, DTOs, wire schemas
│   ├── crypto/                      # WebCrypto / Libsodium engine, WebWorker offload
│   ├── storage/                     # Dexie IndexedDB adapter, queries, migration pipeline
│   ├── protocol/                    # Zod wire schemas, envelope validation, serialization
│   ├── transport/                   # ITransportAdapter, WebRTC DataChannels, STUN/ICE pool
│   ├── identity/                    # Key generation, QR card generation/scanning
│   ├── contacts/                    # Contact book, safety numbers, trust verification
│   ├── messaging/                   # Ratchet engine, 6 delivery states, conversation model
│   ├── groups/                      # Bounded mesh coordinator (2, 4, 8 peers), group rekeying
│   ├── file-transfer/               # Chunked binary streaming, backpressure, SHA-256 checks
│   ├── notifications/               # Cross-platform notification port (Browser + Native)
│   └── ui/                          # Design tokens, shadcn-vue & Reka UI components
│
├── infrastructure/
│   └── cloudflare/                  # Ephemeral WebSocket signaling & DO room coordinator
│
└── docs/                            # Architectural specifications & governance policies
```

---

## Quick Start (Development)

### Prerequisites

- **Node.js:** `>= 20.0.0`
- **pnpm:** `>= 9.0.0`

### Installation

```bash
# Clone the repository
git clone https://github.com/spartacus-coder/CampusMesh.git
cd CampusMesh

# Install all workspace dependencies
pnpm install

# Run type check and linting
pnpm typecheck
pnpm lint

# Execute all package unit tests
pnpm test

# Start the web application in development mode
pnpm dev
```

---

## Documentation

- [System Architecture](docs/ARCHITECTURE.md)
- [Zero-Cost Budget Policy](docs/COST_POLICY.md)
- [Performance & Benchmarking Standards](docs/PERFORMANCE.md)
- [Security & Cryptographic Model](docs/SECURITY.md)
- [Threat Model](docs/THREAT_MODEL.md)
- [Protocol Specification](docs/PROTOCOL_SPECIFICATION.md)
- [Branching & Collaboration Strategy](docs/BRANCHING_STRATEGY.md)
- [Implementation Status](docs/IMPLEMENTATION_STATUS.md)
- [Development Roadmap](docs/ROADMAP.md)
- [Architecture Decision Records (ADRs)](docs/adr/)

---

## License

Licensed under the [Apache License, Version 2.0](LICENSE).
