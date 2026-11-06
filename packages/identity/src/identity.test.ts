import { describe, it, expect, beforeEach } from "vitest";
import { IdentityManager } from "./index";
import { InMemoryStorageAdapter } from "@campusmesh/storage";

describe("@campusmesh/identity - IdentityManager suite", () => {
  let storage: InMemoryStorageAdapter;
  let identityManager: IdentityManager;

  beforeEach(() => {
    storage = new InMemoryStorageAdapter();
    identityManager = new IdentityManager(storage);
  });

  it("should initialize as not configured", async () => {
    expect(await identityManager.isInitialized()).toBe(false);
    expect(identityManager.isUnlocked()).toBe(false);
    expect(identityManager.getActiveSession()).toBeNull();
  });

  it("should reject passphrase with less than 8 characters", async () => {
    await expect(
      identityManager.createIdentity("Alice", "short"),
    ).rejects.toThrow("Passphrase must be at least 8 characters long");
  });

  it("should create new identity with 24-word mnemonic and domain-separated keys", async () => {
    const { identity, mnemonic } = await identityManager.createIdentity(
      "Alice Campus",
      "SecurePassphrase123!",
    );

    expect(mnemonic.split(/\s+/)).toHaveLength(24);
    expect(identity.displayName).toBe("Alice Campus");
    expect(identity.fingerprint).toHaveLength(64);
    expect(identity.ed25519PublicKey).toBeDefined();
    expect(identity.x25519PublicKey).toBeDefined();

    expect(await identityManager.isInitialized()).toBe(true);
    expect(identityManager.isUnlocked()).toBe(true);

    const session = identityManager.getActiveSession();
    expect(session).not.toBeNull();
    expect(session?.identity.fingerprint).toBe(identity.fingerprint);
  });

  it("should lock identity, zero out active session, and re-unlock with passphrase", async () => {
    const { identity } = await identityManager.createIdentity(
      "Bob Campus",
      "PassphraseSecret888",
    );

    expect(identityManager.isUnlocked()).toBe(true);

    // Lock identity
    identityManager.lockIdentity();
    expect(identityManager.isUnlocked()).toBe(false);
    expect(identityManager.getActiveSession()).toBeNull();

    // Unlock with wrong passphrase should throw
    await expect(
      identityManager.unlockIdentity("WrongPassword"),
    ).rejects.toThrow();
    expect(identityManager.isUnlocked()).toBe(false);

    // Unlock with correct passphrase
    const restoredSession = await identityManager.unlockIdentity(
      "PassphraseSecret888",
    );
    expect(restoredSession.identity.fingerprint).toBe(identity.fingerprint);
    expect(identityManager.isUnlocked()).toBe(true);
  });

  it("should deterministically restore exact identity from 24-word mnemonic", async () => {
    const { identity: originalIdentity, mnemonic } =
      await identityManager.createIdentity(
        "Original Charlie",
        "FirstPassphrase123",
      );

    // New device / fresh storage
    const freshStorage = new InMemoryStorageAdapter();
    const freshManager = new IdentityManager(freshStorage);

    const restoredIdentity = await freshManager.restoreFromMnemonic(
      mnemonic,
      "Restored Charlie",
      "NewDevicePassphrase456",
    );

    // Fingerprint and public keys must match identically
    expect(restoredIdentity.fingerprint).toBe(originalIdentity.fingerprint);
    expect(restoredIdentity.ed25519PublicKey).toBe(
      originalIdentity.ed25519PublicKey,
    );
    expect(restoredIdentity.x25519PublicKey).toBe(
      originalIdentity.x25519PublicKey,
    );
  });

  it("should export and import encrypted identity backup", async () => {
    const { identity } = await identityManager.createIdentity(
      "Dana Student",
      "DanaBackupSecret99",
    );

    const backupJson = await identityManager.exportBackup("DanaBackupSecret99");
    expect(backupJson).toContain("CampusMesh");

    // Fresh storage
    const freshStorage = new InMemoryStorageAdapter();
    const freshManager = new IdentityManager(freshStorage);

    const importedIdentity = await freshManager.importBackup(
      backupJson,
      "DanaBackupSecret99",
    );
    expect(importedIdentity.fingerprint).toBe(identity.fingerprint);
    expect(freshManager.isUnlocked()).toBe(true);
  });

  it("should generate and parse QR code payloads correctly", async () => {
    await identityManager.createIdentity("Eve Scholar", "PasswordForEve123");

    const qr = identityManager.generateQrPayload();
    expect(qr.name).toBe("Eve Scholar");
    expect(qr.fp).toBeDefined();

    // Parse JSON
    const parsedFromJson = identityManager.parseQrPayload(JSON.stringify(qr));
    expect(parsedFromJson.fp).toBe(qr.fp);

    // Parse URI
    const uri = `campusmesh://identity?v=1&name=Eve%20Scholar&fp=${qr.fp}&edPk=${qr.edPk}&xPk=${qr.xPk}`;
    const parsedFromUri = identityManager.parseQrPayload(uri);
    expect(parsedFromUri.fp).toBe(qr.fp);
    expect(parsedFromUri.name).toBe("Eve Scholar");
  });
});
