import {
  generate24WordMnemonic,
  isValidMnemonic,
  mnemonicToMasterSeed,
  deriveSubkey,
  DOMAIN_SEPARATION,
  generateEd25519FromSeed,
  generateX25519FromSeed,
  computeFingerprint,
  encryptKeystore,
  decryptKeystore,
  type Ed25519KeyPair,
  type X25519KeyPair,
  type EncryptedKeystoreBlob,
} from "@campusmesh/crypto";
import type { IdentityProfile } from "@campusmesh/shared-types";
import type { IStoragePort } from "@campusmesh/storage";

export function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    const b = bytes[i];
    if (b !== undefined) {
      binary += String.fromCharCode(b);
    }
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export function base64UrlToBytes(base64: string): Uint8Array {
  let str = base64.replace(/-/g, "+").replace(/_/g, "/");
  while (str.length % 4) {
    str += "=";
  }
  const binary = atob(str);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export interface ActiveIdentitySession {
  identity: IdentityProfile;
  ed25519KeyPair: Ed25519KeyPair;
  x25519KeyPair: X25519KeyPair;
  masterSeed: Uint8Array;
}

export interface IdentityBackupPayload {
  version: 1;
  app: "CampusMesh";
  exportedAt: number;
  identity: IdentityProfile;
  keystore: EncryptedKeystoreBlob;
}

export interface IdentityQrPayload {
  v: 1;
  id: string;
  name: string;
  fp: string;
  edPk: string;
  xPk: string;
}

export interface IIdentityManager {
  isInitialized(): Promise<boolean>;
  isUnlocked(): boolean;
  createIdentity(
    displayName: string,
    passphrase: string,
    optionalMnemonic?: string,
  ): Promise<{ identity: IdentityProfile; mnemonic: string }>;
  restoreFromMnemonic(
    mnemonic: string,
    displayName: string,
    passphrase: string,
  ): Promise<IdentityProfile>;
  unlockIdentity(passphrase: string): Promise<ActiveIdentitySession>;
  lockIdentity(): void;
  getActiveSession(): ActiveIdentitySession | null;
  exportBackup(passphrase: string): Promise<string>;
  importBackup(
    backupJson: string,
    passphrase: string,
  ): Promise<IdentityProfile>;
  generateQrPayload(): IdentityQrPayload;
  parseQrPayload(qrString: string): IdentityQrPayload;
}

export class IdentityManager implements IIdentityManager {
  private activeSession: ActiveIdentitySession | null = null;

  constructor(private storage: IStoragePort) {}

  async isInitialized(): Promise<boolean> {
    const identity = await this.storage.getIdentity();
    const keystore = await this.storage.getKeystore();
    return identity !== null && keystore !== null;
  }

  isUnlocked(): boolean {
    return this.activeSession !== null;
  }

  getActiveSession(): ActiveIdentitySession | null {
    return this.activeSession;
  }

  lockIdentity(): void {
    if (this.activeSession) {
      // Memory protection: zero out master seed and private keys
      this.activeSession.masterSeed.fill(0);
      this.activeSession.ed25519KeyPair.privateKey.fill(0);
      this.activeSession.x25519KeyPair.privateKey.fill(0);
      this.activeSession = null;
    }
  }

  async createIdentity(
    displayName: string,
    passphrase: string,
    optionalMnemonic?: string,
  ): Promise<{ identity: IdentityProfile; mnemonic: string }> {
    if (!passphrase || passphrase.length < 8) {
      throw new Error("Passphrase must be at least 8 characters long");
    }

    const mnemonic = optionalMnemonic
      ? optionalMnemonic.trim()
      : generate24WordMnemonic();
    if (!isValidMnemonic(mnemonic)) {
      throw new Error("Invalid 24-word BIP-39 mnemonic phrase");
    }

    const masterSeed = await mnemonicToMasterSeed(mnemonic);

    // Derive domain-separated keys
    const edSeed = deriveSubkey(masterSeed, DOMAIN_SEPARATION.ED25519_IDENTITY);
    const xSeed = deriveSubkey(
      masterSeed,
      DOMAIN_SEPARATION.X25519_SIGNED_PREKEY,
    );

    const edKeyPair = generateEd25519FromSeed(edSeed);
    const xKeyPair = generateX25519FromSeed(xSeed);

    const fingerprint = computeFingerprint(edKeyPair.publicKey);
    const edPkBase64 = bytesToBase64Url(edKeyPair.publicKey);
    const xPkBase64 = bytesToBase64Url(xKeyPair.publicKey);

    const identity: IdentityProfile = {
      id: `usr_${fingerprint.substring(0, 16)}`,
      fingerprint,
      displayName: displayName.trim() || "Anonymous Peer",
      ed25519PublicKey: edPkBase64,
      x25519PublicKey: xPkBase64,
      createdAt: Date.now(),
    };

    // Encrypt keystore
    const keystoreBlob = await encryptKeystore(masterSeed, passphrase);

    // Persist to storage
    await this.storage.saveIdentity(identity);
    await this.storage.saveKeystore({
      id: "primary",
      blob: keystoreBlob,
      updatedAt: Date.now(),
    });

    // Set active unlocked session
    this.activeSession = {
      identity,
      ed25519KeyPair: edKeyPair,
      x25519KeyPair: xKeyPair,
      masterSeed,
    };

    return { identity, mnemonic };
  }

  async restoreFromMnemonic(
    mnemonic: string,
    displayName: string,
    passphrase: string,
  ): Promise<IdentityProfile> {
    const res = await this.createIdentity(displayName, passphrase, mnemonic);
    return res.identity;
  }

  async unlockIdentity(passphrase: string): Promise<ActiveIdentitySession> {
    const identity = await this.storage.getIdentity();
    const keystoreRecord = await this.storage.getKeystore();

    if (!identity || !keystoreRecord) {
      throw new Error(
        "No identity found in local storage. Please create or import an identity.",
      );
    }

    const masterSeed = await decryptKeystore(keystoreRecord.blob, passphrase);

    const edSeed = deriveSubkey(masterSeed, DOMAIN_SEPARATION.ED25519_IDENTITY);
    const xSeed = deriveSubkey(
      masterSeed,
      DOMAIN_SEPARATION.X25519_SIGNED_PREKEY,
    );

    const edKeyPair = generateEd25519FromSeed(edSeed);
    const xKeyPair = generateX25519FromSeed(xSeed);

    // Verify derived public key matches stored identity
    const derivedFp = computeFingerprint(edKeyPair.publicKey);
    if (derivedFp !== identity.fingerprint) {
      throw new Error(
        "Integrity error: derived fingerprint does not match stored identity profile",
      );
    }

    this.activeSession = {
      identity,
      ed25519KeyPair: edKeyPair,
      x25519KeyPair: xKeyPair,
      masterSeed,
    };

    return this.activeSession;
  }

  async exportBackup(passphrase: string): Promise<string> {
    const identity = await this.storage.getIdentity();
    const keystoreRecord = await this.storage.getKeystore();

    if (!identity || !keystoreRecord) {
      throw new Error("Cannot export backup: no identity or keystore present");
    }

    // Verify passphrase before exporting
    await decryptKeystore(keystoreRecord.blob, passphrase);

    const backup: IdentityBackupPayload = {
      version: 1,
      app: "CampusMesh",
      exportedAt: Date.now(),
      identity,
      keystore: keystoreRecord.blob,
    };

    return JSON.stringify(backup, null, 2);
  }

  async importBackup(
    backupJson: string,
    passphrase: string,
  ): Promise<IdentityProfile> {
    let payload: IdentityBackupPayload;
    try {
      payload = JSON.parse(backupJson);
    } catch {
      throw new Error("Invalid JSON backup file");
    }

    if (
      payload.app !== "CampusMesh" ||
      payload.version !== 1 ||
      !payload.keystore
    ) {
      throw new Error("Unsupported or corrupted CampusMesh backup file format");
    }

    // Verify passphrase can unlock the backup keystore
    const masterSeed = await decryptKeystore(payload.keystore, passphrase);

    // Derive and verify fingerprint
    const edSeed = deriveSubkey(masterSeed, DOMAIN_SEPARATION.ED25519_IDENTITY);
    const edKeyPair = generateEd25519FromSeed(edSeed);
    const derivedFp = computeFingerprint(edKeyPair.publicKey);

    if (derivedFp !== payload.identity.fingerprint) {
      throw new Error("Backup fingerprint mismatch");
    }

    // Persist
    await this.storage.saveIdentity(payload.identity);
    await this.storage.saveKeystore({
      id: "primary",
      blob: payload.keystore,
      updatedAt: Date.now(),
    });

    const xSeed = deriveSubkey(
      masterSeed,
      DOMAIN_SEPARATION.X25519_SIGNED_PREKEY,
    );
    const xKeyPair = generateX25519FromSeed(xSeed);

    this.activeSession = {
      identity: payload.identity,
      ed25519KeyPair: edKeyPair,
      x25519KeyPair: xKeyPair,
      masterSeed,
    };

    return payload.identity;
  }

  generateQrPayload(): IdentityQrPayload {
    if (!this.activeSession) {
      throw new Error("Identity is locked or not initialized");
    }

    return {
      v: 1,
      id: this.activeSession.identity.id,
      name: this.activeSession.identity.displayName,
      fp: this.activeSession.identity.fingerprint,
      edPk: this.activeSession.identity.ed25519PublicKey,
      xPk: this.activeSession.identity.x25519PublicKey,
    };
  }

  parseQrPayload(qrString: string): IdentityQrPayload {
    try {
      let data: Record<string, unknown>;
      if (qrString.startsWith("{")) {
        data = JSON.parse(qrString);
      } else if (qrString.startsWith("campusmesh://identity")) {
        const url = new URL(qrString);
        data = {
          v: parseInt(url.searchParams.get("v") || "1", 10),
          id: url.searchParams.get("id") ?? undefined,
          name: url.searchParams.get("name") ?? undefined,
          fp: url.searchParams.get("fp") ?? undefined,
          edPk: url.searchParams.get("edPk") ?? undefined,
          xPk: url.searchParams.get("xPk") ?? undefined,
        };
      } else {
        throw new Error("Unrecognized QR format");
      }

      const fp = typeof data.fp === "string" ? data.fp : "";
      const edPk = typeof data.edPk === "string" ? data.edPk : "";
      const xPk = typeof data.xPk === "string" ? data.xPk : "";

      if (!fp || !edPk || !xPk) {
        throw new Error("Missing required identity fields in QR payload");
      }

      return {
        v: 1,
        id:
          typeof data.id === "string" ? data.id : `peer_${fp.substring(0, 16)}`,
        name: typeof data.name === "string" ? data.name : "Anonymous Peer",
        fp,
        edPk,
        xPk,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`Failed to parse identity QR: ${msg}`);
    }
  }
}
