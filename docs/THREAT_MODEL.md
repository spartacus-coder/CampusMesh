# CampusMesh Threat Model

## 1. System Assets & Trust Boundaries

### Protected Assets

1. **User Identity Secrets:** Master BIP-39 mnemonic seed, Ed25519 identity private keys, X25519 prekey private keys.
2. **Conversation Confidentiality:** Plaintext text messages, media files, and attachments.
3. **Conversation Integrity & Authenticity:** Immutability of message sequence, verification of sender signatures, tamper detection.
4. **Group State:** Authoritative member lists, role assignments, and group rekeying material.

### Untrusted Entities

1. **Signaling Server (Cloudflare Worker & Durable Object):** Assumed to be curious, untrusted, or potentially compromised. Must never receive plaintext or private keys.
2. **Network Adversaries:** ISP, Wi-Fi routers, STUN servers, passive eavesdroppers, and active Man-in-the-Middle (MitM) attackers.
3. **Malicious Peers:** Users attempting to spoof message origins, replay old packets, or tamper with group membership lists.

---

## 2. Threat Vector Matrix & Mitigations

| Threat Vector                          | Description                                           | Mitigation Strategy                                                                                                                                                                                        |
| -------------------------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Eavesdropping on Signaling**         | Adversary monitors WebSocket signaling on Cloudflare. | Signaling relays only encrypted SDP and ICE candidate tokens. Zero message plaintext or identity private keys are sent to signaling.                                                                       |
| **Identity Impersonation**             | Attacker claims to be User A to trick User B.         | Ed25519 public key fingerprints and visual Safety Numbers (QR / numeric comparisons). Messages without valid Ed25519 signatures are discarded.                                                             |
| **Message Tampering**                  | Attacker modifies ciphertext in transit.              | Authenticated Encryption with Associated Data (AEAD: AES-256-GCM / ChaCha20-Poly1305). Any modified ciphertext fails tag verification.                                                                     |
| **Replay Attacks**                     | Attacker re-sends valid historical messages.          | Wire envelopes contain monotonically increasing sequence counters, ephemeral ratcheting nonces, and sender timestamps. Duplicate envelopes are rejected.                                                   |
| **Ephemerality / Ratchet Compromise**  | Ephemeral session key is compromised at time $T$.     | Double Ratchet guarantees Forward Secrecy: prior messages cannot be decrypted. Full DH ratchet turn by both parties provides Post-Compromise Security (PCS).                                               |
| **In-Browser Origin Compromise (XSS)** | Cross-Site Scripting injected into client.            | Non-extractable WebCrypto keys prevent direct raw key export. Strict CSP disallows inline scripts and external domains. _Note: XSS can still invoke signing APIs during active session; CSP is mandatory._ |
| **Malicious Attachments**              | Peer sends executable malware disguised as image/PDF. | File transfers are strictly isolated. No automatic execution. Files are checked against MIME signatures and saved locally only on explicit user click.                                                     |
| **Malicious Desktop/Android Updates**  | Compromised update server distributes trojaned build. | Tauri updater enforces static Ed25519 update signature validation. Android APK requires matching keystore signature or Android PackageInstaller rejects installation.                                      |
