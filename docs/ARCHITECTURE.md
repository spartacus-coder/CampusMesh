# CampusMesh System Architecture

## 1. Architectural Style: Hexagonal Architecture (Ports & Adapters)

CampusMesh is engineered using Hexagonal Architecture (Ports and Adapters) to isolate core business rules and protocols from external technical concerns (transport layer, storage engine, cryptographic implementation, UI framework).

```mermaid
graph TD
    subgraph Core Domain Logic
        IdentityDomain[Identity Entity & Fingerprint]
        MessageDomain[Message Model & 6 Delivery States]
        GroupDomain[Group Mesh Entity & Membership]
        FileDomain[File Transfer Engine]
    end

    subgraph Ports Application Interfaces
        AuthPort[IIdentityPort]
        StoragePort[IStoragePort]
        CryptoPort[ICryptoPort]
        TransportPort[ITransportPort]
        NotifPort[INotificationPort]
    end

    subgraph Adapters Implementations
        DexieAdapter[Dexie IndexedDB Adapter]
        WebCryptoAdapter[WebCrypto / Libsodium Adapter]
        WebRtcAdapter[WebRTC DataChannel Adapter]
        SignalingAdapter[Cloudflare Worker WebSocket Adapter]
        VueAdapter[Vue 3 / shadcn-vue Frontend Adapter]
        NativeAdapter[Tauri / Capacitor Adapters]
    end

    CoreDomain Logic --> Ports
    Adapters --> Ports
```

### Decoupling Rules

1. **Core packages never import platform APIs:** `packages/messaging`, `packages/protocol`, `packages/identity`, and `packages/contacts` are pure TypeScript. They never import `window`, `document`, `navigator`, or Node-specific built-ins directly.
2. **Platform abstractions behind adapters:** Storage is abstracted behind `IStoragePort` (implemented via Dexie for Web and SQLite for Native). Networking is abstracted behind `ITransportPort` (implemented via WebRTC DataChannels).
3. **Transport Independence:** Messages are serialized envelopes independent of whether they are transmitted via WebRTC DataChannel, manual QR token, or experimental Hyperswarm feeds.

---

## 2. Layered Package Responsibility Matrix

| Package                     | Layer          | Responsibility                                       | Public Interface                                                                    |
| --------------------------- | -------------- | ---------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `@campusmesh/shared-types`  | Foundation     | Shared DTOs, enumerations, common type guards        | Type declarations                                                                   |
| `@campusmesh/crypto`        | Infrastructure | Pure cryptographic primitives, WebWorker offload     | `generateIdentitySeed()`, `deriveKeyPair()`, `encryptPayload()`, `decryptPayload()` |
| `@campusmesh/storage`       | Infrastructure | Dexie IndexedDB schemas, migrations, transactions    | `IStorageAdapter`, `MessageStore`, `ContactStore`, `KeystoreStore`                  |
| `@campusmesh/protocol`      | Domain         | Wire serialization, Zod envelope validation          | `encodeEnvelope()`, `decodeEnvelope()`, `validateSchema()`                          |
| `@campusmesh/transport`     | Infrastructure | `ITransportAdapter`, WebRTC connection manager, ICE  | `connect()`, `disconnect()`, `send()`, `onMessage()`                                |
| `@campusmesh/identity`      | Application    | Identity lifecycle, BIP-39 recovery, QR encoding     | `createIdentity()`, `exportBackup()`, `importBackup()`                              |
| `@campusmesh/contacts`      | Application    | Contact book, safety numbers, block list             | `addContact()`, `verifySafetyNumber()`, `blockPeer()`                               |
| `@campusmesh/messaging`     | Application    | Ratchet turns, 6 delivery states, conversation model | `sendMessage()`, `processIncoming()`, `markAsRead()`                                |
| `@campusmesh/groups`        | Application    | Bounded mesh (2, 4, 8 peers), membership events      | `createGroup()`, `joinGroup()`, `broadcast()`                                       |
| `@campusmesh/file-transfer` | Application    | Chunked streaming, backpressure flow control         | `sendFile()`, `receiveChunk()`, `verifyHash()`                                      |
| `@campusmesh/notifications` | Infrastructure | Platform-agnostic notification delivery              | `showNotification()`, `requestPermission()`                                         |
| `@campusmesh/ui`            | Presentation   | Design tokens, shadcn-vue & Reka UI primitives       | Vue component library                                                               |

---

## 3. Scalability Tiers

1. **Tier 1 (MVP Direct 1-to-1):** Direct WebRTC DataChannels with ephemeral room-partitioned Cloudflare Durable Objects.
2. **Tier 2 (Medium-Term Bounded Mesh):** Small-group mesh (2, 4, 8 peers) with resource monitoring and vector clock event ordering.
3. **Tier 3 (Long-Term Advanced Decentralized Mesh):** Peer discovery and append-only log replication via Holepunch Pear / Hyperswarm / Autobase (kept in isolated `experiment/*` branches).
