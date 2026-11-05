# CampusMesh Security Policy

## 1. Security Architecture Principles

1. **Zero Knowledge:** Servers, signaling relays, and coordination nodes never receive, decrypt, or log message plaintext or private keys.
2. **Local-First Cryptographic Key Storage:** All private keys reside in local, encrypted IndexedDB stores. Private keys are never stored in `localStorage` and never transmitted across the network.
3. **Formal Protocol Ratcheting:** End-to-end encryption utilizes formal ratcheting protocols (Double Ratchet / Signal Protocol / MLS RFC 9420) guaranteeing Forward Secrecy (FS) and Post-Compromise Security (PCS).
4. **Authenticity & Integrity:** Every message, invite, and group state transition is cryptographically signed using Ed25519.
5. **Defense in Depth:** Sensitive operations are isolated in Web Workers; Content Security Policy (CSP) strictly prohibits inline script execution and unauthorized network origins.

---

## 2. Cryptographic Algorithm Standards

| Purpose                                | Primitive / Algorithm           | Standard / Reference |
| -------------------------------------- | ------------------------------- | -------------------- |
| **Identity Signing**                   | Ed25519 (PureEd25519)           | RFC 8032             |
| **Key Agreement**                      | X25519                          | RFC 7748             |
| **Symmetric Payload Encryption**       | AES-256-GCM / ChaCha20-Poly1305 | RFC 5116 / RFC 8439  |
| **Key Derivation (Domain Separation)** | HKDF-SHA256                     | RFC 5869             |
| **Passphrase Keystore Encryption**     | Argon2id + AES-256-GCM          | RFC 9106             |
| **Cryptographic Hash**                 | SHA-256                         | FIPS 180-4           |

---

## 3. Vulnerability Reporting

If you discover a security vulnerability in CampusMesh, please email the security maintainers directly rather than opening a public issue. We commit to acknowledging receipt within 48 hours and providing a remediation timeline within 7 days.
