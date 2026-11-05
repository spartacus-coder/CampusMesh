# CampusMesh Wire Protocol & Cryptographic Specification

## 1. Cryptographic Key Derivation Hierarchy

All cryptographic keypairs are deterministically derived from a 24-word BIP-39 mnemonic seed using standard HKDF-SHA256 with explicit domain separation strings:

```text
24-Word BIP-39 Mnemonic
           │
           ▼ PBKDF2-HMAC-SHA512 (iterations=2048)
   512-bit Master Seed
           │
           ▼ HKDF-Extract-SHA256
  Master Identity Secret (256-bit)
           │
           ├─► HKDF-Expand (info="CampusMesh-Ed25519-IdentityKey-v1") ──► Ed25519 Identity Keypair (IK_A)
           ├─► HKDF-Expand (info="CampusMesh-X25519-SignedPreKey-v1") ──► X25519 Signed Prekey (SPK_A) + Sig
           ├─► HKDF-Expand (info="CampusMesh-Device-Binding-v1") ────────► Device UUID Key
           └─► HKDF-Expand (info="CampusMesh-OneTimePreKey-Batch-v1") ────► Pool of One-Time Prekeys (OPK_A)
```

---

## 2. Asynchronous Session Establishment (X3DH / PQXDH)

### 2.1 Out-of-Band Invitation Exchange (Option A - Primary MVP)

User A creates a secure invitation containing:

- $IK_A$: User A's Ed25519 Identity Public Key.
- $SPK_A$: User A's X25519 Signed Prekey.
- $Sig(IK_A, SPK_A)$: Ed25519 signature over $SPK_A$.
- $OPK_A$: Optional single-use One-Time Prekey.

When User B imports this invitation (via QR code or deep link `campusmesh://invite/...`), User B generates an ephemeral keypair $EK_B$ and computes:

- $DH_1 = X25519(IK_B, SPK_A)$
- $DH_2 = X25519(EK_B, IK_A)$
- $DH_3 = X25519(EK_B, SPK_A)$
- $DH_4 = X25519(EK_B, OPK_A)$ (if $OPK_A$ is present)

The master shared secret is derived via:
$$SK = \text{HKDF-Extract-SHA256}(DH_1 \parallel DH_2 \parallel DH_3 \parallel DH_4)$$

$SK$ initializes the root key of the Double Ratchet engine.

---

## 3. Wire Envelope Specification

Every packet transmitted over WebRTC DataChannels or stored in outbox queues adheres to the canonical Zod schema:

```json
{
  "$schema": "https://campusmesh.org/schemas/envelope/v1.json",
  "version": 1,
  "id": "urn:uuid:f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "type": "MESSAGE",
  "conversationId": "conv_9f83a04b",
  "senderFingerprint": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  "timestamp": 1793923200000,
  "sequenceNumber": 42,
  "ratchetHeader": {
    "dhPublicKey": "<base64url-x25519-public-key>",
    "previousChainLength": 3,
    "messageIndex": 0
  },
  "payloadCiphertext": "<base64url-aes-256-gcm-ciphertext>",
  "authTag": "<base64url-16-byte-tag>",
  "signature": "<base64url-ed25519-signature-over-header-and-ciphertext>"
}
```

---

## 4. Manual Signaling Token Specification (Base45)

When serverless signaling is unreachable, clients exchange manual connection tokens:

1. Client initializes `RTCPeerConnection` with STUN candidates and waits until `iceGatheringState === 'complete'`.
2. The entire SDP and candidate list is serialized into JSON:
   `{"v":1,"t":"OFFER","sdp":"...","c":[...],"ts":1793923200}`
3. The payload is compressed with DEFLATE (`pako`) and encoded as **Base45**.
4. Resulting string is prefixed with `CMESH1:` and displayed as a QR code or copyable token.
5. Tokens expire after 10 minutes and are wiped from memory after import.
