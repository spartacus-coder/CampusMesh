# CampusMesh Release & Key Management Process

## 1. Release Channels

| Channel         | Trigger             | Deliverables                                                                     | Audience                   |
| --------------- | ------------------- | -------------------------------------------------------------------------------- | -------------------------- |
| **Development** | Merge to `main`     | Automatic Cloudflare Pages preview & dev manifest                                | Internal / Nightly testers |
| **Beta**        | Tag `v*.*.*-beta.*` | Desktop NSIS beta installer & Android beta APK                                   | Community testers          |
| **Stable**      | Tag `v*.*.*`        | Signed Windows NSIS `.exe`, signed Android APK, release notes, SHA-256 checksums | General public             |

---

## 2. Desktop (Tauri 2) Update Signing & Recovery

1. **Application ID:** `com.campusmesh.desktop`
2. **Signing Keys:** Tauri auto-updater validates updates using an Ed25519 keypair.
3. **CI Secret Storage:** The private key resides exclusively in GitHub Actions Encrypted Secrets (`TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_KEY_PASSWORD`).
4. **Offline Air-Gapped Cold Storage:** The release private key is backed up offline in an encrypted physical drive.
5. **Key Rotation (`ADR-007`):** The desktop client embeds a primary public key and a secondary disaster-recovery public key. If the primary key is compromised, an update signed by the recovery key can migrate the client to a new primary keypair.

---

## 3. Android (Capacitor 8) Signing & Update Handoff

1. **Application ID:** `app.campusmesh.mobile`
2. **Keystore Management:** Generated with RSA 4096 / PKCS#12, stored base64-encoded in GitHub Secrets (`ANDROID_KEYSTORE_BASE64`, `KEYSTORE_PASSWORD`, `KEY_ALIAS`, `KEY_PASSWORD`). Never committed to source control.
3. **Signature Verification:** Built with APK Signature Scheme v2 and v3.
4. **Update Handoff:** The application queries GitHub Releases, verifies the downloaded APK SHA-256 against the signed release manifest, and triggers Android's `FileProvider` to invoke `android.content.Intent.ACTION_INSTALL_PACKAGE`.
