import { describe, it, expect, beforeEach } from "vitest";
import { DtnRouter } from "./dtn-router";
import { InMemoryStorageAdapter } from "@campusmesh/storage";

describe("@campusmesh/messaging DtnRouter (Epidemic Store-and-Forward DTN)", () => {
  let storageAlice: InMemoryStorageAdapter;
  let storageBob: InMemoryStorageAdapter;
  let storageCharlie: InMemoryStorageAdapter;

  let routerAlice: DtnRouter;
  let routerBob: DtnRouter;
  let routerCharlie: DtnRouter;

  const FP_ALICE = "fp-alice-1111";
  const FP_BOB = "fp-bob-2222";
  const FP_CHARLIE = "fp-charlie-3333";

  beforeEach(() => {
    storageAlice = new InMemoryStorageAdapter();
    storageBob = new InMemoryStorageAdapter();
    storageCharlie = new InMemoryStorageAdapter();

    routerAlice = new DtnRouter({
      localFingerprint: FP_ALICE,
      storage: storageAlice,
      maxMuleEnvelopes: 50,
      defaultTtlMs: 3600000, // 1 hour
      maxHops: 4,
    });

    routerBob = new DtnRouter({
      localFingerprint: FP_BOB,
      storage: storageBob,
      maxMuleEnvelopes: 50,
      defaultTtlMs: 3600000,
      maxHops: 4,
    });

    routerCharlie = new DtnRouter({
      localFingerprint: FP_CHARLIE,
      storage: storageCharlie,
      maxMuleEnvelopes: 50,
      defaultTtlMs: 3600000,
      maxHops: 4,
    });
  });

  it("should create DTN envelopes and save to outbox storage", async () => {
    const envelope = await routerAlice.createEnvelope(
      FP_CHARLIE,
      "encrypted_data_for_charlie",
    );

    expect(envelope.id).toBeDefined();
    expect(envelope.senderFingerprint).toBe(FP_ALICE);
    expect(envelope.recipientFingerprint).toBe(FP_CHARLIE);
    expect(envelope.hopCount).toBe(0);
    expect(envelope.expiresAt).toBeGreaterThan(Date.now());

    const stored = await storageAlice.getDtnEnvelope(envelope.id);
    expect(stored).toEqual(envelope);
  });

  it("should generate inventory and exchange missing envelopes with a data mule", async () => {
    // 1. Alice creates envelope for Charlie (who is currently offline)
    const env = await routerAlice.createEnvelope(
      FP_CHARLIE,
      "hello_charlie_from_alice",
    );

    // 2. Alice encounters Bob (the data mule)
    const aliceInventory = await routerAlice.getInventory();
    expect(aliceInventory.envelopeIds).toContain(env.id);

    // 3. Bob inspects Alice's inventory and identifies missing envelopes
    const bobNeeded = await routerBob.handleInventory(aliceInventory);
    expect(bobNeeded).toContain(env.id);

    // 4. Bob requests the envelope from Alice
    const bobRequest = routerBob.createRequest(bobNeeded);
    const aliceResponse = await routerAlice.handleRequest(bobRequest);
    expect(aliceResponse).toHaveLength(1);
    expect(aliceResponse[0]?.id).toBe(env.id);

    // 5. Bob ingests the envelope into his mule storage
    const bobIngest = await routerBob.ingestEnvelopes(aliceResponse);
    expect(bobIngest.delivered).toHaveLength(0); // Not for Bob
    expect(bobIngest.muled).toHaveLength(1); // Bob carries it as mule
    expect(bobIngest.muled[0]?.hopCount).toBe(1); // Hop incremented

    const bobStored = await storageBob.getDtnEnvelope(env.id);
    expect(bobStored).toBeDefined();
    expect(bobStored?.hopCount).toBe(1);
  });

  it("should deliver envelope when the data mule encounters the recipient", async () => {
    // 1. Alice created envelope for Charlie
    const env = await routerAlice.createEnvelope(
      FP_CHARLIE,
      "charlie_offline_message",
    );

    // 2. Bob muled it from Alice
    await routerBob.ingestEnvelopes([env]);

    // 3. Later, Bob encounters Charlie
    const charlieEnvelopes = await routerBob.getEnvelopesForPeer(FP_CHARLIE);
    expect(charlieEnvelopes).toHaveLength(1);
    expect(charlieEnvelopes[0]?.id).toBe(env.id);

    // 4. Charlie ingests the envelope
    const charlieIngest = await routerCharlie.ingestEnvelopes(charlieEnvelopes);
    expect(charlieIngest.delivered).toHaveLength(1);
    expect(charlieIngest.delivered[0]?.id).toBe(env.id);
    expect(charlieIngest.muled).toHaveLength(0);

    // 5. Charlie generates an ACK
    const ack = routerCharlie.createAck(env.id);
    expect(ack.envelopeId).toBe(env.id);
    expect(ack.recipientFingerprint).toBe(FP_CHARLIE);

    // 6. Bob receives Charlie's ACK and purges envelope from mule storage
    const purgedFromBob = await routerBob.handleAck(ack);
    expect(purgedFromBob).toBe(true);
    expect(await storageBob.getDtnEnvelope(env.id)).toBeNull();

    // 7. Alice eventually receives the ACK and purges envelope from outbox
    const purgedFromAlice = await routerAlice.handleAck(ack);
    expect(purgedFromAlice).toBe(true);
    expect(await storageAlice.getDtnEnvelope(env.id)).toBeNull();
  });

  it("should reject expired envelopes or envelopes exceeding max hops", async () => {
    const expiredEnv = {
      id: "env-expired",
      senderFingerprint: FP_ALICE,
      recipientFingerprint: FP_CHARLIE,
      encryptedPayload: "old_data",
      timestamp: Date.now() - 10000,
      expiresAt: Date.now() - 1000, // already expired
      hopCount: 1,
      maxHops: 4,
    };

    const maxHopsEnv = {
      id: "env-maxhops",
      senderFingerprint: FP_ALICE,
      recipientFingerprint: FP_CHARLIE,
      encryptedPayload: "too_many_hops",
      timestamp: Date.now(),
      expiresAt: Date.now() + 60000,
      hopCount: 4,
      maxHops: 4, // limit reached
    };

    const ingestResult = await routerBob.ingestEnvelopes([
      expiredEnv,
      maxHopsEnv,
    ]);
    expect(ingestResult.delivered).toHaveLength(0);
    expect(ingestResult.muled).toHaveLength(0);
    expect(ingestResult.rejected).toContain("env-expired");
    expect(ingestResult.rejected).toContain("env-maxhops");
  });
});
