import { describe, it, expect, vi } from "vitest";
import { CampusMeshMessagingEngine } from "./engine";
import { InMemoryStorageAdapter } from "@campusmesh/storage";
import {
  generateEd25519FromSeed,
  generateX25519FromSeed,
  DoubleRatchetSession,
} from "@campusmesh/crypto";
import { DeliveryState } from "@campusmesh/shared-types";
import type { WebRtcPeerTransport } from "@campusmesh/transport";

describe("@campusmesh/messaging engine suite", () => {
  it("should encrypt, sign, send, receive, and acknowledge direct E2EE messages", async () => {
    const storageAlice = new InMemoryStorageAdapter();
    const storageBob = new InMemoryStorageAdapter();

    const aliceSigning = generateEd25519FromSeed(new Uint8Array(32).fill(0x11));
    const bobSigning = generateEd25519FromSeed(new Uint8Array(32).fill(0x22));

    const sharedMasterSecret = new Uint8Array(32).fill(0x88);
    const aliceDh = generateX25519FromSeed(new Uint8Array(32).fill(0x33));
    const bobDh = generateX25519FromSeed(new Uint8Array(32).fill(0x44));

    const aliceRatchet = new DoubleRatchetSession(
      sharedMasterSecret,
      aliceDh,
      bobDh.publicKey,
      true,
    );
    const bobRatchet = new DoubleRatchetSession(sharedMasterSecret, bobDh);

    // Mock direct transport wiring
    const pendingDeliveries: Promise<unknown>[] = [];

    const forwarders = {
      toBob: (_data: Uint8Array): Promise<unknown> => Promise.resolve(),
      toAlice: (_data: Uint8Array): Promise<unknown> => Promise.resolve(),
    };

    const mockAliceTransport = {
      sendData: vi.fn((_peerFp: string, _channel: string, data: Uint8Array) => {
        pendingDeliveries.push(forwarders.toBob(data));
        return true;
      }),
    };

    const mockBobTransport = {
      sendData: vi.fn((_peerFp: string, _channel: string, data: Uint8Array) => {
        pendingDeliveries.push(forwarders.toAlice(data));
        return true;
      }),
    };

    const aliceEngine = new CampusMeshMessagingEngine({
      storage: storageAlice,
      localFingerprint: "fp-alice",
      signingKeyPair: aliceSigning,
      transport: mockAliceTransport as unknown as WebRtcPeerTransport,
    });
    aliceEngine.registerPeerCryptoSession(
      "fp-bob",
      aliceRatchet,
      bobSigning.publicKey,
    );

    const bobEngine = new CampusMeshMessagingEngine({
      storage: storageBob,
      localFingerprint: "fp-bob",
      signingKeyPair: bobSigning,
      transport: mockBobTransport as unknown as WebRtcPeerTransport,
    });
    bobEngine.registerPeerCryptoSession(
      "fp-alice",
      bobRatchet,
      aliceSigning.publicKey,
    );

    forwarders.toBob = (data: Uint8Array) =>
      bobEngine.processIncomingData("fp-alice", data);
    forwarders.toAlice = (data: Uint8Array) =>
      aliceEngine.processIncomingData("fp-bob", data);

    // 1. Alice sends direct message to Bob
    const sentMsg = await aliceEngine.sendTextMessage(
      "conv_alice_bob",
      "fp-bob",
      "Hello Bob! E2EE messaging works!",
    );

    // Await async processing
    await Promise.all(pendingDeliveries);

    // Verify Bob received and decrypted the message
    const bobMessages = await storageBob.getMessages("conv_alice_bob");
    expect(bobMessages).toHaveLength(1);
    expect(bobMessages[0]?.content).toBe("Hello Bob! E2EE messaging works!");
    expect(bobMessages[0]?.deliveryState).toBe(DeliveryState.DELIVERED);

    // Verify Alice received Bob's automatic ACK -> state progressed to DELIVERED
    const aliceMessages = await storageAlice.getMessages("conv_alice_bob");
    expect(aliceMessages).toHaveLength(1);
    expect(aliceMessages[0]?.deliveryState).toBe(DeliveryState.DELIVERED);

    // 2. Bob sends Read Receipt to Alice
    pendingDeliveries.length = 0;
    bobEngine.sendReadReceipt("fp-alice", sentMsg.id, "conv_alice_bob");
    await Promise.all(pendingDeliveries);

    const aliceUpdated = await storageAlice.getMessages("conv_alice_bob");
    expect(aliceUpdated[0]?.deliveryState).toBe(DeliveryState.READ);
  });

  it("should queue messages in outbox when peer transport is offline and flush upon reconnection", async () => {
    const storageAlice = new InMemoryStorageAdapter();
    const aliceSigning = generateEd25519FromSeed(new Uint8Array(32).fill(0x55));
    const bobSigning = generateEd25519FromSeed(new Uint8Array(32).fill(0x66));

    const sharedSecret = new Uint8Array(32).fill(0x99);
    const aliceDh = generateX25519FromSeed(new Uint8Array(32).fill(0x77));
    const bobDh = generateX25519FromSeed(new Uint8Array(32).fill(0x88));

    const aliceRatchet = new DoubleRatchetSession(
      sharedSecret,
      aliceDh,
      bobDh.publicKey,
      true,
    );

    // Transport currently fails to deliver (offline)
    const mockOfflineTransport = {
      sendData: vi.fn(() => false),
    };

    const aliceEngine = new CampusMeshMessagingEngine({
      storage: storageAlice,
      localFingerprint: "fp-alice",
      signingKeyPair: aliceSigning,
      transport: mockOfflineTransport as unknown as WebRtcPeerTransport,
    });
    aliceEngine.registerPeerCryptoSession(
      "fp-bob",
      aliceRatchet,
      bobSigning.publicKey,
    );

    const msg = await aliceEngine.sendTextMessage(
      "conv_offline",
      "fp-bob",
      "Queued offline message",
    );
    expect(msg.deliveryState).toBe(DeliveryState.SAVED_LOCALLY);

    // Check outbox has queued item
    const outbox = await storageAlice.getPendingOutboxMessages();
    expect(outbox).toHaveLength(1);
    expect(outbox[0]?.id).toBe(msg.id);

    // Reconnection: transport now succeeds
    mockOfflineTransport.sendData = vi.fn(() => true);
    const flushedCount = await aliceEngine.flushOutbox("fp-bob");
    expect(flushedCount).toBe(1);

    // Outbox should now be empty
    const remainingOutbox = await storageAlice.getPendingOutboxMessages();
    expect(remainingOutbox).toHaveLength(0);
  });
});
