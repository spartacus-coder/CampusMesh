# CAMPUSMESH

## Master Product Problem Statement, Technical Architecture & Autonomous Development Specification

**Project category:** Decentralized Peer-to-Peer Communication Platform  
**Working name:** CampusMesh  
**Development approach:** Feature-driven, modular, open-source, collaborative  
**Primary objective:** Build a sophisticated, privacy-focused P2P communication platform with zero recurring infrastructure expenditure.

---

# 1. PROJECT VISION

Build a modern, sophisticated, decentralized messaging platform designed initially for college communities, student groups and personal communication.

The application should combine the most useful capabilities of applications such as:

- SimpleX Chat
- Keet
- Jami
- Tox
- Briar
- Session
- Element / Matrix
- Discord
- Telegram
- WhatsApp

However, CampusMesh must have its own architectural identity.

The defining characteristic must be that communication happens directly between user devices wherever technically possible, without depending on a conventional centralized messaging backend.

The project must be designed around these principles:

1. Peer-to-peer communication first.
2. No mandatory centralized message server.
3. No paid infrastructure.
4. No mandatory third-party APIs.
5. End-to-end encrypted communication.
6. Local-first data storage.
7. Decentralized identity and contact management.
8. Cross-platform compatibility.
9. Modular feature development.
10. Open-source collaboration.
11. Automatic deployment and software updates.
12. Long-term extensibility into a fully decentralized communication network.

The project should be usable for a small college community initially, but its architecture should be capable of evolving into a larger decentralized communication platform.

Do not build a conventional client-server messaging application and label it decentralized.

---

# 2. ABSOLUTE PROJECT CONSTRAINTS

These constraints are non-negotiable.

## 2.1 Zero-cost infrastructure

The project must not require me to pay for:

- VPS hosting.
- Dedicated servers.
- Cloud databases.
- Paid APIs.
- Paid authentication services.
- Paid file storage.
- Paid messaging gateways.
- Paid signaling services.
- Paid WebRTC infrastructure.
- Paid CI/CD services.
- Paid domains.
- Commercial SDK subscriptions.

Use free and open-source technologies wherever possible.

Free-tier cloud infrastructure is acceptable only when:

- It does not require a paid subscription.
- Its free quota is sufficient for the intended purpose.
- It does not automatically upgrade to a paid plan.
- The application can continue operating in a degraded pure-P2P mode if it becomes unavailable.

Do not introduce a paid dependency without first researching and documenting a free alternative.

## 2.2 Infrastructure cost protection

Implement a strict infrastructure budget policy.

The application must:

- Never automatically switch to a paid provider.
- Never silently start using a paid TURN provider.
- Never upload files to paid cloud storage.
- Avoid unnecessary background requests.
- Minimize server-side processing.
- Keep message contents out of server-side infrastructure.
- Use local storage wherever practical.
- Expose free-tier usage and quota warnings to administrators where applicable.

If a free service reaches its quota, the application must degrade gracefully.

It must not unexpectedly create a bill.

## 2.3 Serverless-first architecture

Do not create a conventional backend unless a feature genuinely requires one.

The intended architecture should consist primarily of:

- Client-side application logic.
- Direct P2P connections.
- Local databases.
- Cryptographic identities.
- Distributed peer discovery.
- Optional serverless signaling.
- Optional encrypted message relays.

Cloudflare Workers and Durable Objects may be used as lightweight serverless infrastructure, but they must not become the primary messaging system.

---

# 3. PLATFORM STRATEGY

This project must produce two major deliverables within one GitHub monorepo.

## 3.1 Product A: Responsive Web Application

Develop a complete web application that works on:

- Windows desktop browsers.
- Linux desktop browsers.
- macOS browsers.
- Android mobile browsers.
- iOS mobile browsers.

The application must use a responsive interface and adapt automatically to screen size.

It must also be installable as a Progressive Web Application.

Requirements:

- Desktop-first and mobile-first layouts.
- Installable PWA.
- Offline application shell.
- Local message history.
- Service-worker-based asset caching.
- Responsive navigation.
- Touch-friendly mobile interface.
- Desktop keyboard shortcuts.
- Browser compatibility.
- WebRTC support.
- Browser notification support where available.

Hosting:

Cloudflare Pages Free using the default `pages.dev` domain.

Deployment should happen automatically after approved changes are merged into the production branch.

## 3.2 Product B: Downloadable Native Applications

Develop downloadable applications using the same shared application logic.

Target platforms:

**Desktop:**

- Windows `.exe` installer.
- Linux distributable as a later target.
- macOS distributable as a later target.

**Mobile:**

- Android APK.
- iOS native application as a future optional target.

Recommended packaging:

- Tauri 2 for desktop.
- Capacitor for Android.
- Shared Vue frontend and shared TypeScript application packages.

The desktop application must support automatic updates through GitHub Releases.

The Android application must support update checking, APK downloading and installation handoff to the Android package installer.

Do not claim that Android can silently install an APK update without the necessary OS privileges.

The iOS PWA should remain available even when native iOS distribution is not implemented.

The native and web versions must share:

- Identity management.
- Contacts.
- Messaging protocol.
- Encryption logic.
- Group management.
- Conversation models.
- File-transfer protocol.
- Shared business logic.

Platform-specific integrations must be isolated behind adapters.

---

# 4. PROPOSED REPOSITORY ARCHITECTURE

Use a modular monorepo.

Suggested structure:

```text
campusmesh/
│
├── apps/
│   ├── web/
│   │   ├── src/
│   │   ├── public/
│   │   ├── pwa/
│   │   └── package.json
│   │
│   ├── desktop/
│   │   ├── src-tauri/
│   │   ├── updater/
│   │   └── package.json
│   │
│   └── mobile/
│       ├── android/
│       ├── ios/
│       ├── capacitor.config.ts
│       └── package.json
│
├── packages/
│   ├── core/
│   │
│   ├── identity/
│   │
│   ├── crypto/
│   │
│   ├── protocol/
│   │
│   ├── contacts/
│   │
│   ├── messaging/
│   │
│   ├── groups/
│   │
│   ├── storage/
│   │
│   ├── file-transfer/
│   │
│   ├── notifications/
│   │
│   ├── transport/
│   │   ├── interfaces/
│   │   ├── webrtc/
│   │   ├── peer-relay/
│   │   └── hypercore-experimental/
│   │
│   ├── ui/
│   │
│   └── shared-types/
│
├── infrastructure/
│   └── cloudflare/
│       ├── signaling-worker/
│       ├── room-coordinator/
│       ├── encrypted-mailbox/
│       └── wrangler.toml
│
├── docs/
│   ├── ARCHITECTURE.md
│   ├── SECURITY.md
│   ├── THREAT_MODEL.md
│   ├── COST_POLICY.md
│   ├── CONTRIBUTING.md
│   ├── BRANCHING_STRATEGY.md
│   ├── ROADMAP.md
│   ├── IMPLEMENTATION_STATUS.md
│   ├── API_CONTRACTS.md
│   ├── PROTOCOL_SPECIFICATION.md
│   └── adr/
│
├── .github/
│   ├── ISSUE_TEMPLATE/
│   ├── workflows/
│   ├── PULL_REQUEST_TEMPLATE.md
│   ├── CODEOWNERS
│   └── FUNDING.yml
│
├── tests/
│   ├── unit/
│   ├── integration/
│   ├── e2e/
│   ├── networking/
│   └── security/
│
├── LICENSE
├── README.md
├── CONTRIBUTING.md
├── SECURITY.md
├── CODE_OF_CONDUCT.md
├── package.json
└── pnpm-workspace.yaml
```

This is the intended logical structure. Adjust it where technically justified, but preserve separation of responsibilities.

Use pnpm workspaces.

Do not unnecessarily introduce expensive or overly complicated monorepo tooling.

Each package must have a clear responsibility and public interface.

The web frontend must not directly depend on desktop-specific or Android-specific APIs.

---

# 5. SHORT-TERM TECHNICAL ARCHITECTURE

The first production architecture must prioritize simplicity, reliability and zero recurring expenditure.

## 5.1 Frontend

Use:

- Vue 3.
- TypeScript.
- Vite.
- Tailwind CSS.
- Pinia where shared state management is needed.
- Vue Router.
- vite-plugin-pwa.
- Dexie for IndexedDB access.

Use modular feature-oriented frontend architecture.

Avoid creating a huge monolithic component.

## 5.2 Direct networking

Use WebRTC DataChannels as the initial communication transport.

Prefer an explicit WebRTC transport adapter built around standard browser APIs.

PeerJS may be used for an initial prototype or comparison, but do not tightly couple all business logic to PeerJS.

The transport layer must expose a provider-independent interface.

Required capabilities:

- Peer connection establishment.
- Data channel creation.
- Peer disconnection handling.
- ICE candidate exchange.
- Automatic reconnection attempts.
- Connection state tracking.
- Chunked file transmission.
- Message acknowledgement.
- Backpressure management.
- Network failure handling.

Every message must be independent of the underlying transport.

## 5.3 Signaling

WebRTC cannot automatically discover and connect to arbitrary peers without exchanging connection information.

Implement signaling through an optional Cloudflare infrastructure layer.

Recommended stack:

- Cloudflare Workers Free.
- Cloudflare Durable Objects with SQLite storage.
- WebSocket-based room coordination.

Signaling responsibilities:

- Exchange SDP offers and answers.
- Exchange ICE candidates.
- Manage temporary room membership.
- Track online connection presence.
- Coordinate peer invitations.
- Remove expired room state.

Signaling must NOT:

- Read messages.
- Store plaintext conversations.
- Store passwords.
- Maintain a centralized permanent user directory.
- Store permanent attachment files.
- Become the primary message delivery mechanism.

All signaling state should expire automatically.

Use WebSocket hibernation where appropriate to minimize unnecessary resource usage.

Create a signaling provider interface so it can be replaced later.

## 5.4 STUN and TURN

Implement ICE configuration with support for multiple configurable STUN and TURN providers.

Primary connection strategy:

1. Attempt direct connectivity.
2. Use STUN-assisted ICE negotiation.
3. Attempt alternate candidate pairs.
4. Try an optional free TURN provider when explicitly configured.
5. If all options fail, show a useful connection failure message.

Do not assume that STUN guarantees a direct connection.

Do not implement a mandatory paid relay.

The application must have a pure direct-connect mode that does not require TURN.

## 5.5 Local persistence

Use IndexedDB for web storage.

Use SQLite for native applications where platform integration is justified.

Local database responsibilities:

- Contacts.
- Conversations.
- Message metadata.
- Encrypted message payloads.
- Attachments metadata.
- Group information.
- Device identity references.
- Delivery state.
- Local application settings.
- Synchronization information.

The architecture must allow storage providers to be replaced without changing messaging business logic.

Do not use localStorage for cryptographic private keys.

## 5.6 Authentication and identity

Do not introduce email/password authentication as a mandatory account system.

Generate a cryptographic identity locally when a user creates a profile.

Identity should include:

- Public key.
- Private key.
- Unique identity fingerprint.
- Display name.
- Profile image stored locally or optionally shared.
- Device identifier.
- Identity creation timestamp.

Contacts should be added using:

- QR codes.
- Secure invitation links.
- Identity fingerprints.
- Manual identity exchange.

The serverless signaling layer must not become an authoritative identity provider.

Implement identity verification so users can detect impersonation or key changes.

---

# 6. ADVANCED LONG-TERM P2P ARCHITECTURE

The long-term goal is to move beyond WebRTC-only communication and develop a more sophisticated decentralized networking layer.

Investigate the Holepunch Pear ecosystem.

Technologies to evaluate:

| Technology | Role                                      |
| ---------- | ----------------------------------------- |
| Bare       | Lightweight JavaScript runtime            |
| Pear       | P2P app runtime and distribution          |
| Hypercore  | Append-only replicated data feeds         |
| Hyperbee   | Key-value data built on Hypercore         |
| Hyperdrive | Replicated file storage                   |
| HyperDHT   | Distributed peer discovery                |
| Hyperswarm | P2P peer networking                       |
| Corestore  | Manage multiple Hypercores                |
| Autobase   | Multi-writer replicated application state |

The purpose of this architecture is to explore a system where:

- Users discover peers through a distributed network.
- Messages can be represented as signed append-only events.
- Conversation data can replicate between participants.
- Multiple participants can contribute to shared conversation state.
- Online peers can help retain encrypted data.
- No single application server controls the entire network.
- Distribution and application updates can also use peer-to-peer infrastructure.

The long-term native P2P architecture should be evaluated against the WebRTC implementation using actual Windows and Android prototypes.

Do not replace a functioning cross-platform transport merely because an alternative appears more decentralized.

Create an experimental branch:

`experiment/pear-hyperswarm`

Benchmark:

- Peer discovery reliability.
- Connection establishment.
- Android compatibility.
- Windows compatibility.
- Network performance.
- Storage replication.
- Peer reconnection.
- Data consistency.
- App update reliability.

Only integrate the technology into production after the proof of concept meets the project requirements.

## 6.1 Distributed conversation storage

Explore an event-oriented model for conversations.

Every message should be represented as a signed event.

Use stable message identifiers and deterministic ordering rules.

Investigate:

- Append-only logs.
- Event sourcing.
- Multi-writer data replication.
- Conflict resolution.
- CRDTs where appropriate.
- Message deduplication.
- Event replay.
- Membership-change events.
- Device synchronization.

Hypercore provides individual writer feeds, while Autobase can coordinate multiple writers into a deterministic shared view.

Do not create a new synchronization algorithm without first evaluating existing primitives.

## 6.2 Peer-assisted offline delivery

Investigate the concept of volunteer peers or mailbox peers.

Potential model:

- A user's second device can retain encrypted messages.
- A desktop device can act as an always-on mailbox.
- A trusted peer can temporarily retain encrypted conversation data.
- Group peers can replicate messages to each other.
- Recipients synchronize missed messages when reconnecting.

All message contents must remain encrypted.

Make retention policies configurable.

Do not promise delivery when every possible storage peer is offline.

---

# 7. SECURITY AND CRYPTOGRAPHY

Security is one of the most important components.

Do not implement cryptographic primitives from scratch.

Use established, maintained and appropriately reviewed cryptographic libraries.

Evaluate:

- Web Crypto API.
- libsodium.
- Ed25519 identity signatures.
- X25519 key agreement.
- Authenticated encryption.
- Secure key derivation.
- Message authentication.
- MLS (Messaging Layer Security, RFC 9420) for advanced group encryption.
- Secure local key storage.

One-to-one messaging and group messaging must use an explicitly documented end-to-end encryption protocol.

WebRTC's built-in DTLS protection is useful but does not replace an authenticated application-level identity and key-management design.

The encryption implementation must bind peer identity to the communication session and protect against identity substitution.

## Required security functionality

1. Cryptographic identity creation.
2. Identity fingerprint verification.
3. Encrypted one-to-one communication.
4. Encrypted group communication.
5. Secure invitation exchange.
6. Secure key storage.
7. Key rotation.
8. Device revocation.
9. Secure local backups.
10. Message integrity verification.
11. Replay protection.
12. Message authentication.
13. Forward secrecy where supported by the selected protocol.
14. Secure group membership changes.
15. Protection against unauthorized group access.

Private keys must never be sent to signaling infrastructure.

Signaling services must never receive message plaintext.

The application must also explain to users the difference between transport encryption and end-to-end encryption.

## Threat model

Create a dedicated threat model covering:

- Malicious peers.
- Identity impersonation.
- Compromised devices.
- Stolen identity backups.
- Malicious invitation links.
- Replay attacks.
- Spam and flooding.
- Unauthorized group membership.
- Metadata leakage.
- Malicious attachments.
- Dependency compromise.
- Compromised update distribution.

Maintain a SECURITY.md responsible-disclosure policy.

---

# 8. FUNCTIONAL REQUIREMENTS

Develop the following feature modules independently.

Do not attempt to implement every feature in the first release.

## Module 1: User identity

- Create local identity.
- Generate cryptographic key pairs.
- Select display name.
- Set avatar.
- Generate user fingerprint.
- Generate QR identity card.
- Export encrypted identity backup.
- Import identity backup.
- Device recovery.

## Module 2: Contacts

- Add contacts through QR.
- Add contacts through invitation links.
- Accept or reject invitations.
- Contact verification.
- Contact blocking.
- Contact removal.
- Online/offline indicators.
- Last-seen indicator where privacy permits.
- Contact profile information.

## Module 3: One-to-one messaging

- Text messages.
- Message timestamps.
- Message replies.
- Message editing.
- Message deletion.
- Reactions.
- Message delivery states.
- Message read receipts.
- Typing indicators.
- Message search.
- Conversation pinning.
- Conversation archiving.
- Unread indicators.
- Disappearing messages.

Message delivery states must distinguish:

- Saved locally.
- Waiting for a connection.
- Sent to a peer.
- Delivered.
- Read.
- Failed.

Do not mark an unconfirmed message as delivered.

## Module 4: Group conversations

- Create groups.
- Group names and descriptions.
- Group avatars.
- Invite members.
- Remove members.
- Leave groups.
- Group ownership.
- Administrators and moderators.
- Member permissions.
- Invite revocation.
- Group announcements.
- Group replies.
- Group reactions.
- Group polls.
- Group message search.

Every group membership change must be authenticated.

Use a small-group WebRTC topology initially.

Do not implement unrestricted full mesh for arbitrarily large groups.

Set an initial tested active-peer limit and document it. Begin with small groups, for example 6–8 simultaneously connected peers, and benchmark before increasing that limit.

## Module 5: File sharing

Implement direct P2P file sharing.

Supported content:

- PDFs.
- Documents.
- Images.
- Audio.
- Video.
- General files.

Requirements:

- File metadata.
- Transfer progress.
- Transfer cancellation.
- Transfer retry.
- Chunked transfer.
- Integrity verification.
- File-size validation.
- Download location selection.
- Encrypted transmission.
- Memory-efficient transfer handling.

Do not route large files through the signaling Worker.

Do not upload attachments to a central bucket by default.

## Module 6: Voice messages

- Record voice messages.
- Preview before sending.
- Playback controls.
- Playback speed.
- Waveform visualization.
- Direct encrypted transfer.
- Local audio storage.

## Module 7: Notifications

Support:

- Browser notifications.
- PWA push notifications where available.
- Native Android notifications.
- Per-conversation notification settings.
- Mute options.

Do not promise uninterrupted background P2P connectivity on mobile browsers.

Notifications must be implemented through platform adapters.

## Module 8: Voice and video calls

Long-term feature.

Use WebRTC for:

- One-to-one voice calls.
- One-to-one video calls.
- Screen sharing.
- Call invitations.
- Call reconnection.

Group calls should initially be experimental and limited to small groups.

Do not introduce a paid SFU or managed video platform.

A large scalable video conference without a media server is outside the scope of the initial architecture.

## Module 9: College community features

- Department groups.
- Class groups.
- Semester groups.
- Subject-specific groups.
- Study circles.
- Announcement channels.
- Group polls.
- Study-material exchange.
- QR-based campus invitations.
- Group administration.
- Moderator tools.

These features should remain optional modules.

The application must also support ordinary private communication independent of college membership.

## Module 10: Multi-device support

Develop later.

Requirements:

- Link a second device through QR.
- Authenticate the new device.
- Transfer encrypted identity information.
- Synchronize conversation history.
- Revoke linked devices.
- Handle device replacement.
- Prevent unauthorized key duplication.

---

# 9. GROUP NETWORKING STRATEGY

A major architectural challenge is group messaging.

Do not assume that a browser can maintain unlimited simultaneous WebRTC connections.

For a group containing N connected participants, full mesh involves N(N-1)/2 total connections across the group.

Therefore, implement a transport abstraction that supports alternative topologies.

Initial topology:

Small-group direct WebRTC mesh.

Long-term candidates:

- Peer-assisted forwarding.
- Hierarchical P2P topology.
- Distributed group logs.
- Hypercore replication.
- Dynamic peer selection.

The system must be able to choose a suitable networking strategy based on:

- Number of participants.
- Connection health.
- Available bandwidth.
- Device capabilities.
- Battery conditions.
- NAT compatibility.

Do not silently introduce a centrally hosted forwarding server.

All topology changes must preserve encryption and authenticated membership.

---

# 10. OFFLINE AND RECONNECTION BEHAVIOUR

Offline handling is essential.

When a peer disconnects:

- Preserve unsent messages locally.
- Mark delivery status accurately.
- Queue outgoing messages.
- Reconnect using exponential backoff.
- Re-establish signaling when available.
- Exchange synchronization information.
- Deduplicate messages.
- Restore conversation state.
- Resume interrupted transfers where possible.

Optional encrypted mailbox:

Use Cloudflare Durable Objects as an experimental free-tier encrypted mailbox.

The mailbox may temporarily store ciphertext with:

- A maximum retention time.
- Message expiry.
- Storage quotas.
- Sender identification through cryptographic verification.
- Deletion after acknowledgement.

This feature must be optional and independent of ordinary direct P2P messaging.

Do not promise guaranteed offline delivery merely because a mailbox exists. Define delivery guarantees based on actual peer and mailbox availability.

---

# 11. USER INTERFACE AND EXPERIENCE

The interface must feel like a modern production-grade communication application.

Use a visually refined design system.

The interface should be:

- Modern.
- Minimal.
- Fast.
- Accessible.
- Responsive.
- Consistent across platforms.
- Customizable.

Suggested visual direction:

- Premium dark and light themes.
- Carefully selected typography.
- Rounded conversation surfaces.
- Subtle transitions.
- Message grouping.
- Clear connection-status indicators.
- Smooth conversation navigation.
- Responsive sidebars.
- Touch-friendly mobile interactions.
- Consistent modal and dialog systems.

Desktop interface:

- Left navigation/sidebar.
- Conversations list.
- Main conversation panel.
- Optional information panel.
- Search.
- Quick actions.
- Keyboard shortcuts.
- Context menus.

Mobile interface:

- Bottom navigation.
- Compact conversation list.
- Full-screen conversation view.
- Touch-friendly controls.
- Responsive group details.
- Native share integration where available.

Required application screens:

1. Welcome.
2. Create identity.
3. Import identity.
4. Contact discovery.
5. QR scanner.
6. Conversation list.
7. One-to-one chat.
8. Group chat.
9. New group creation.
10. Group administration.
11. Profile.
12. Security settings.
13. Linked devices.
14. File transfers.
15. Notifications.
16. Connection diagnostics.
17. Application settings.
18. Update manager.
19. About and open-source acknowledgements.

Do not build decorative screens that have no working functionality.

---

# 12. FEATURE-BY-FEATURE GIT BRANCH STRATEGY

This project must be developed in independent feature branches.

This requirement is especially important because other developers may collaborate later.

Do not put the entire application inside one enormous development branch.

## Branch model

Permanent branches:

- main — stable, deployable code.

Short-lived branches:

- feat/feature-name
- fix/issue-name
- security/security-name
- docs/document-name
- test/test-name
- refactor/module-name
- chore/task-name
- experiment/technology-name

Examples:

```text
feat/repository-foundation
feat/design-system
feat/local-identity
feat/qr-identity-exchange
feat/contact-management
feat/webrtc-signaling
feat/direct-messaging
feat/end-to-end-encryption
feat/group-messaging
feat/local-message-history
feat/file-transfer
feat/offline-mailbox
feat/browser-notifications
feat/voice-calls
feat/android-application
feat/desktop-application
feat/desktop-auto-updater
experiment/pear-hyperswarm
fix/reconnection-race-condition
security/group-key-rotation
```

## Collaboration rules

1. Every meaningful feature must have its own branch.
2. Every feature should have a corresponding GitHub issue.
3. Every feature should have a defined acceptance criterion.
4. Branches must be created from the latest main.
5. A branch must not contain unrelated functionality.
6. Every feature must be tested before merging.
7. Use Pull Requests for merging into main.
8. Never commit directly to main for feature development.
9. Use meaningful commit messages.
10. Delete obsolete branches after merging.

Use Conventional Commits:

```text
feat: add local identity creation
fix: prevent duplicate message delivery
docs: document WebRTC architecture
test: add group synchronization tests
security: validate group invitation signatures
refactor: isolate IndexedDB storage adapter
```

## GitHub collaboration support

Create:

- CONTRIBUTING.md
- CODE_OF_CONDUCT.md
- SECURITY.md
- PULL_REQUEST_TEMPLATE.md
- Issue templates.
- Feature request template.
- Bug-report template.
- CODEOWNERS.
- Architecture decision records.

Include documentation explaining how a new contributor can:

1. Clone the repository.
2. Install dependencies.
3. Configure the development environment.
4. Run the web application.
5. Run the desktop application.
6. Run the Android application.
7. Execute tests.
8. Create a feature branch.
9. Submit a PR.

Use automated checks to prevent broken code from entering main.

---

# 13. AUTOMATIC DEPLOYMENT AND APPLICATION UPDATES

This is a major requirement.

## 13.1 Web application

Whenever code is merged into main:

- Run tests.
- Build the web application.
- Deploy to Cloudflare Pages.
- Verify the deployed build.
- Preserve a rollback path.

Feature branches should have preview deployments when feasible.

## 13.2 Windows desktop updater

Use Tauri 2 and its official updater plugin.

The Windows application should be distributed as an NSIS `.exe` installer.

Implement the updater with:

- GitHub Releases.
- Signed updater artifacts.
- Static update manifest.
- Update version comparison.
- Download progress.
- Installation progress.
- Restart handling.
- Error recovery.
- Update channels.

Never commit the updater signing private key.

Store it in GitHub Actions secrets.

The updater must validate update signatures before installation.

Configure a stable release channel and an optional development/nightly channel.

### Required release workflow

When a commit is merged into main:

1. Run the tests.
2. Build the desktop application.
3. Generate the Windows installer.
4. Generate signed updater artifacts.
5. Publish or update a rolling development release on GitHub.
6. Update the corresponding development manifest.
7. Allow installed development-channel applications to detect the update.

For stable releases, use version tags:

```text
v0.1.0
v0.2.0
v0.3.0
v1.0.0
```

Stable releases must have release notes.

Do not distribute untested feature branches to normal users.

The desktop client should periodically check for updates and notify users.

Where technically safe, provide an automatic installation mode with appropriate installation privileges.

## 13.3 Android updater

Build an Android APK using Capacitor.

Publish APK files as GitHub Release assets.

The application must:

- Check the latest release manifest.
- Compare installed version with available version.
- Display release notes.
- Download the new APK.
- Verify the downloaded file's integrity.
- Launch the Android package installer.
- Preserve the user's existing local data.

Respect Android's package-signing and installation requirements.

Do not claim fully silent APK installation.

The user may have to enable installation from the relevant source and confirm installation.

Investigate F-Droid as an additional free distribution channel after the project satisfies its open-source and reproducible-build requirements.

## 13.4 iOS

Do not make a paid iOS publishing account a dependency.

Maintain a fully functional web/PWA experience for iPhone users.

Investigate a native iOS application only after the Android and desktop versions are stable.

Document platform distribution costs and restrictions clearly.

---

# 14. AUTOMATED CI/CD

Use GitHub Actions.

Create workflows for:

```text
.github/workflows/
    web-ci.yml
    web-deploy.yml
    cloudflare-deploy.yml
    desktop-build.yml
    desktop-release.yml
    android-build.yml
    android-release.yml
    unit-tests.yml
    integration-tests.yml
    security-audit.yml
    dependency-review.yml
    code-quality.yml
```

For a public open-source repository, GitHub-hosted standard runners are available free for public repositories.

For private repositories, respect the included monthly usage allowance.

Avoid unnecessarily building every native platform on every feature branch.

Pull request workflow:

- Lint.
- Type checking.
- Unit tests.
- Build verification.
- Dependency security checks.
- Architecture boundary checks.

Main branch workflow:

- Full CI.
- Web deployment.
- Serverless deployment.
- Nightly desktop build where configured.
- Android build where configured.

Version tag workflow:

- Production installers.
- Signed update manifests.
- Android APK.
- Release notes.
- Checksums.

Use separate release channels:

- Development.
- Beta.
- Stable.

---

# 15. SHORT-TERM DEVELOPMENT ROADMAP

Development must be incremental.

Do not start every feature simultaneously.

## Phase 0 — Engineering foundation

Branch: chore/repository-foundation

Deliverables:

- Monorepo.
- Package management.
- Folder architecture.
- TypeScript configuration.
- Linting.
- Formatting.
- Testing framework.
- CI workflows.
- Documentation foundation.
- Cost policy.
- Branching policy.

## Phase 1 — Web application foundation

Branch: feat/web-pwa-foundation

Deliverables:

- Vue application.
- Responsive layout.
- Design system.
- Desktop interface.
- Mobile interface.
- Routing.
- Theme system.
- PWA installation.
- Offline application shell.

## Phase 2 — Identity architecture

Branch: feat/local-identity

Deliverables:

- Local identity generation.
- Public/private key management.
- Identity fingerprint.
- Profile creation.
- QR code generation.
- QR code scanning.
- Encrypted identity export.
- Identity import.

## Phase 3 — Networking foundation

Branch: feat/webrtc-transport

Deliverables:

- Transport interface.
- WebRTC adapter.
- Connection manager.
- STUN configuration.
- ICE handling.
- Data channels.
- Connection diagnostics.
- Reconnection.

Branch: feat/cloudflare-signaling

Deliverables:

- Cloudflare Worker.
- Durable Object room coordinator.
- WebSocket signaling.
- Ephemeral connection state.
- Automatic state expiry.
- Connection authorization.
- Rate limiting.

## Phase 4 — Private messaging

Branch: feat/direct-messaging

Deliverables:

- One-to-one conversations.
- Message envelopes.
- End-to-end encryption.
- Message acknowledgements.
- Delivery states.
- Message history.
- Reconnection synchronization.
- Duplicate prevention.

## Phase 5 — Contacts and groups

Branch: feat/contact-management

Deliverables:

- Invitations.
- QR contact exchange.
- Contact verification.
- Contact list.
- Blocking.

Branch: feat/group-messaging

Deliverables:

- Group creation.
- Group invitations.
- Membership changes.
- Group roles.
- Encrypted group messaging.
- Group history.
- Small-group connectivity.

## Phase 6 — File sharing

Branch: feat/p2p-file-transfer

Deliverables:

- Chunked transfer.
- Transfer progress.
- Cancellation.
- Resume.
- Integrity verification.
- File previews.
- Attachment management.

## Phase 7 — Offline functionality

Branch: feat/offline-sync

Deliverables:

- Message queue.
- Local persistence.
- Synchronization.
- Duplicate prevention.
- Retry strategy.
- Optional encrypted mailbox.
- Expiration policies.

## Phase 8 — Desktop and mobile applications

Branch: feat/desktop-tauri

Deliverables:

- Tauri integration.
- Windows NSIS installer.
- Application identity.
- Native storage.
- Desktop notifications.
- Auto updater.

Branch: feat/android-capacitor

Deliverables:

- Android packaging.
- Native integration.
- Android notifications.
- Storage permissions.
- APK build.
- Update manager.

## Phase 9 — Advanced communication

Separate branches:

- feat/voice-messages
- feat/voice-calls
- feat/video-calls
- feat/screen-sharing
- feat/linked-devices

## Phase 10 — Advanced decentralized network

Experimental branches:

- experiment/hypercore-storage
- experiment/hyperswarm-discovery
- experiment/hyperdht-networking
- experiment/autobase-group-state
- experiment/pear-ota

Only promote experimental technologies after compatibility and reliability testing.

---

# 16. TESTING REQUIREMENTS

This is a messaging application, so functional correctness and reliability are more important than simply making the UI look finished.

## Required test environments

Test at least:

- Two users on the same Wi-Fi.
- Two users on different Wi-Fi networks.
- Wi-Fi to mobile data.
- Mobile data to mobile data.
- Browser to browser.
- Browser to desktop app.
- Browser to Android app.
- Desktop app to Android app.
- Temporary network disconnection.
- Application restart.
- Peer going offline.
- Peer returning online.
- Multiple participants joining simultaneously.

## Required automated tests

### Unit tests

- Identity generation.
- Message serialization.
- Message validation.
- Signature verification.
- Encryption/decryption.
- Local storage.
- Group permissions.
- Message deduplication.

### Integration tests

- WebRTC connections.
- Signaling.
- Group invitations.
- Message synchronization.
- File transfer.
- Reconnection.

### End-to-end tests

- Identity creation.
- Contact exchange.
- Private messaging.
- Group creation.
- Group messages.
- Application restart.
- Update detection.

### Security tests

- Tampered messages.
- Invalid signatures.
- Replayed messages.
- Unauthorized invitations.
- Malicious attachment metadata.
- Unauthorized group membership.
- Invalid update signatures.

---

# 17. NON-FUNCTIONAL REQUIREMENTS

The application should be:

**Privacy:** No unnecessary centralized collection of personal information.

**Security:** Encryption, identity verification, signed membership changes and authenticated updates.

**Performance:** Fast startup, efficient rendering, chunked file transfers and low memory usage.

**Reliability:** Robust reconnection, no false delivery acknowledgements and local persistence.

**Scalability:** Modular network transports and a documented path from small mesh groups to more sophisticated distributed replication.

**Portability:** Reuse application logic across web, Windows and Android.

**Maintainability:** Clear boundaries, documented APIs and modular feature packages.

**Accessibility:** Keyboard support, screen-reader compatibility and readable contrast.

**Cost:** No compulsory expenditure.

**Open-source readiness:** Clear licensing, documentation, issue management and contributor workflow.

---

# 18. REQUIRED TECHNICAL DOCUMENTATION

Maintain these documents throughout development:

- README.md
- ARCHITECTURE.md
- IMPLEMENTATION_STATUS.md
- ROADMAP.md
- COST_POLICY.md
- SECURITY.md
- THREAT_MODEL.md
- CONTRIBUTING.md
- PROTOCOL_SPECIFICATION.md
- API_CONTRACTS.md
- TESTING_STRATEGY.md
- DEPLOYMENT.md
- RELEASE_PROCESS.md
- BRANCHING_STRATEGY.md
- PRIVACY_POLICY.md
- LICENSE
- CHANGELOG.md

For major technical decisions, create Architecture Decision Records.

Example:

```text
docs/adr/
    ADR-001-monorepo-architecture.md
    ADR-002-webrtc-as-initial-transport.md
    ADR-003-cloudflare-serverless-signaling.md
    ADR-004-local-first-storage.md
    ADR-005-encryption-protocol.md
    ADR-006-tauri-desktop.md
    ADR-007-capacitor-android.md
    ADR-008-pear-hyperswarm-experiment.md
```

Every architectural decision must document:

- Problem.
- Alternatives considered.
- Selected option.
- Reason for selection.
- Cost implications.
- Security implications.
- Migration implications.

---

# 19. IMPORTANT ARCHITECTURAL RULES

1. Never place all messaging logic in the UI.
2. Never make the signaling server responsible for message storage by default.
3. Never store plaintext chat messages in Cloudflare infrastructure.
4. Never create a compulsory centralized account system.
5. Never implement encryption algorithms from scratch.
6. Never hardcode one STUN or TURN provider into the complete application.
7. Never assume every WebRTC connection will be direct.
8. Never assume mobile browsers can run P2P networking continuously in the background.
9. Never promise guaranteed delivery when all relevant peers are offline.
10. Never make desktop, Android and browser versions maintain separate messaging implementations.
11. Never introduce paid APIs without explicit approval.
12. Never introduce a dependency without checking its licensing and maintenance status.
13. Never merge untested code into main.
14. Never overwrite a user's existing local data during an update.
15. Never distribute updates without signature verification.
16. Never expose private signing keys in GitHub commits or client code.
17. Keep experimental networking technologies separate from production networking.
18. Do not disable security checks to make a feature appear to work.
19. Do not create fake functionality or buttons that do nothing.
20. Document limitations honestly.

---

# 20. ACCEPTANCE CRITERIA FOR THE FIRST MVP

The first MVP is considered successful when all of the following are true:

- A user can create an identity without registering an email or phone number.
- Two users can exchange identities using QR codes or invitations.
- Two users on different internet connections can establish a direct WebRTC connection in compatible network conditions.
- They can exchange encrypted messages.
- Messages appear in both users' conversations.
- Message delivery states are accurate.
- Conversation history survives application restarts.
- The system reconnects after temporary network loss.
- The signaling infrastructure does not receive plaintext messages.
- The web application works on desktop and mobile browsers.
- The PWA can be installed.
- The application can run without a mandatory paid backend.
- The project has working CI and feature branches.
- The web application can deploy automatically.
- A Windows installer can be built.
- An Android APK can be built.
- The desktop updater can verify and install a signed update from GitHub Releases.

Do not declare the MVP complete merely because two devices can exchange a message on the same local network.

Test different networks.

---

# 21. INSTRUCTIONS TO ANTIGRAVITY IDE

You are acting as the principal software architect, senior full-stack engineer, P2P networking engineer, application-security engineer and technical project manager.

Your job is to develop CampusMesh as a real, maintainable and collaborative open-source project.

Follow these instructions carefully.

## First: Research and architecture validation

Before writing major implementation code:

1. Examine the current repository.
2. Identify any existing code and reusable components.
3. Read the latest official documentation for relevant frameworks.
4. Validate technology compatibility across web, Windows and Android.
5. Check current free-tier restrictions.
6. Check licensing and maintenance status of dependencies.
7. Identify technical risks.
8. Write the architecture document.
9. Create Architecture Decision Records.
10. Produce a detailed implementation plan.

Do not assume that technologies mentioned in this specification are automatically compatible.

Verify them first.

## Second: Establish the project foundation

Create the monorepo, documentation, testing infrastructure and GitHub collaboration structure.

Create the required feature branches.

Do not start implementing every module at once.

## Third: Implement feature by feature

For every feature:

1. Create or identify the relevant GitHub issue.
2. Create a dedicated feature branch.
3. Implement the feature within its designated package.
4. Write tests.
5. Run linting and type checking.
6. Test integration with existing modules.
7. Update architecture and status documentation.
8. Verify there are no paid dependencies.
9. Prepare a PR-ready change.
10. Merge only when the feature is verified.

Do not combine unrelated features into one branch.

## Fourth: Maintain architectural discipline

Keep the application modular.

Use interfaces and adapters for:

- P2P networking.
- Signaling.
- Local storage.
- Cryptography.
- Notifications.
- File transfers.
- Native platform functionality.

The application must allow new transport providers and features to be added without rewriting the complete codebase.

## Fifth: Keep project documentation current

After every completed feature, update:

- IMPLEMENTATION_STATUS.md
- ROADMAP.md
- CHANGELOG.md where applicable
- Relevant architecture documents.
- Test documentation.

Maintain a clear record of what is implemented, what is partially implemented and what remains.

## Sixth: Cost discipline

Before introducing any external service:

- Check its current pricing.
- Check whether a free tier exists.
- Identify quota limitations.
- Identify whether a payment method is required.
- Identify what happens after quota exhaustion.
- Provide an alternative.

Never silently introduce a paid dependency.

## Seventh: Do not compromise security

Security requirements are mandatory.

Never invent a cryptographic protocol.

Use mature cryptographic libraries and document the security model.

Treat update-signing keys as highly sensitive secrets.

## Eighth: Long-term engineering

Do not optimize the entire application prematurely.

First deliver reliable direct messaging.

Then introduce groups, synchronization, file transfer and advanced networking.

Explore Hypercore, Hyperswarm, HyperDHT and Pear in isolated experimental branches.

Maintain interoperability between web and native clients.

---

# 22. OFFICIAL TECHNICAL REFERENCES

Use official documentation as the primary source of implementation truth.

### WebRTC and P2P

- WebRTC: https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API
- WebRTC protocols and ICE: https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Protocols
- WebRTC DataChannels: https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Using_data_channels
- PeerJS: https://peerjs.com/
- PeerJS FAQ: https://peerjs.com/client/faq

### Cloudflare

- Workers limits: https://developers.cloudflare.com/workers/platform/limits/
- Durable Objects pricing: https://developers.cloudflare.com/durable-objects/platform/pricing/
- Durable Objects limits: https://developers.cloudflare.com/durable-objects/platform/limits/
- Pages limits: https://developers.cloudflare.com/pages/platform/limits/
- Pages Git integration: https://developers.cloudflare.com/pages/get-started/git-integration/

### Decentralized networking

- Pear: https://docs.pears.com/
- Pear P2P: https://docs.pears.com/p2p/
- Autobase: https://docs.pears.com/p2p/reference/building-blocks/autobase/
- Pear CI publishing: https://docs.pears.com/pear/how-to/operate-an-app/github-actions/publish-with-github-actions/

### Application distribution

- Tauri updater: https://v2.tauri.app/plugin/updater/
- Tauri Windows installer: https://v2.tauri.app/distribute/windows-installer/
- Capacitor: https://capacitorjs.com/docs
- Android distribution: https://developer.android.com/studio/publish
- GitHub Actions: https://docs.github.com/en/actions
- GitHub Releases: https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases
- F-Droid inclusion policy: https://f-droid.org/en/docs/Inclusion_Policy/

---

# FINAL DEVELOPMENT DIRECTIVE

Build CampusMesh as a modular, zero-cost, serverless-first and P2P-centric communication platform.

The initial priority is a polished, responsive web application that supports reliable encrypted direct messaging.

The second priority is packaging that shared application into downloadable Windows and Android applications.

The third priority is progressively replacing external networking dependencies with more sophisticated decentralized technologies.

The long-term objective is an application that can provide useful communication functionality even when the optional coordination infrastructure is unavailable.

**Do not sacrifice reliability, security or maintainability merely to claim that the application is decentralized.**

**Do not sacrifice the zero-cost requirement merely to make development easier.**

The architecture, implementation and documentation must consistently respect both requirements.

Start with repository inspection, technology validation, architecture documentation and a feature-by-feature implementation plan. Then begin Phase 0.
