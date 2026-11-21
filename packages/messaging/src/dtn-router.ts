/**
 * Epidemic Store-and-Forward Delay-Tolerant Networking (DTN) Router
 *
 * Implements opportunistic store-and-forward "Data Mule" routing across physical peer encounters.
 * Messages for unreachable/offline peers are encapsulated into tamper-evident encrypted
 * DtnEnvelopes, carried by roaming student nodes over BLE, Wi-Fi Direct, LAN, and WebRTC,
 * and delivered when the target peer is encountered.
 */

import type {
  DtnEnvelope,
  DtnInventory,
  DtnRequest,
  DtnAck,
} from "@campusmesh/shared-types";
import type { IStoragePort } from "@campusmesh/storage";

export interface DtnRouterConfig {
  localFingerprint: string;
  storage: IStoragePort;
  maxMuleEnvelopes?: number; // default: 100 envelopes
  defaultTtlMs?: number; // default: 24 hours (86,400,000 ms)
  maxHops?: number; // default: 5 hops
}

export interface IngestResult {
  delivered: DtnEnvelope[];
  muled: DtnEnvelope[];
  rejected: string[];
}

export class DtnRouter {
  private localFingerprint: string;
  private storage: IStoragePort;
  private maxMuleEnvelopes: number;
  private defaultTtlMs: number;
  private maxHops: number;
  private knownAcks = new Set<string>();

  constructor(config: DtnRouterConfig) {
    this.localFingerprint = config.localFingerprint;
    this.storage = config.storage;
    this.maxMuleEnvelopes = config.maxMuleEnvelopes ?? 100;
    this.defaultTtlMs = config.defaultTtlMs ?? 24 * 60 * 60 * 1000;
    this.maxHops = config.maxHops ?? 5;
  }

  public setLocalFingerprint(fp: string): void {
    this.localFingerprint = fp;
  }

  /**
   * Package a payload destined for an offline peer into a DTN envelope and store locally.
   */
  public async createEnvelope(
    recipientFingerprint: string,
    encryptedPayload: string,
    ttlMs?: number,
  ): Promise<DtnEnvelope> {
    const now = Date.now();
    const id = `dtn_${now}_${Math.random().toString(36).substring(2, 10)}`;

    const envelope: DtnEnvelope = {
      id,
      senderFingerprint: this.localFingerprint,
      recipientFingerprint,
      encryptedPayload,
      timestamp: now,
      expiresAt: now + (ttlMs ?? this.defaultTtlMs),
      hopCount: 0,
      maxHops: this.maxHops,
    };

    await this.storage.saveDtnEnvelope(envelope);
    return envelope;
  }

  /**
   * Generate inventory list of currently stored envelope IDs to advertise to peers.
   */
  public async getInventory(): Promise<DtnInventory> {
    const all = await this.storage.getAllDtnEnvelopes();
    const now = Date.now();
    const validIds = all
      .filter((e) => e.expiresAt > now && !this.knownAcks.has(e.id))
      .map((e) => e.id);

    return {
      nodeFingerprint: this.localFingerprint,
      envelopeIds: validIds,
    };
  }

  /**
   * Compare remote peer inventory against local envelopes to determine missing envelopes.
   */
  public async handleInventory(
    remoteInventory: DtnInventory,
  ): Promise<string[]> {
    if (remoteInventory.nodeFingerprint === this.localFingerprint) {
      return [];
    }

    const currentCount = (await this.storage.getAllDtnEnvelopes()).length;
    const availableSlots = Math.max(0, this.maxMuleEnvelopes - currentCount);
    if (availableSlots === 0) {
      return [];
    }

    const localEnvelopes = await this.storage.getAllDtnEnvelopes();
    const localIdSet = new Set(localEnvelopes.map((e) => e.id));

    const needed: string[] = [];
    for (const remoteId of remoteInventory.envelopeIds) {
      if (
        !localIdSet.has(remoteId) &&
        !this.knownAcks.has(remoteId) &&
        needed.length < availableSlots
      ) {
        needed.push(remoteId);
      }
    }

    return needed;
  }

  /**
   * Generate request for envelopes needed from remote peer.
   */
  public createRequest(neededIds: string[]): DtnRequest {
    return {
      nodeFingerprint: this.localFingerprint,
      requestedIds: neededIds,
    };
  }

  /**
   * Respond to peer request by retrieving the requested envelopes.
   */
  public async handleRequest(request: DtnRequest): Promise<DtnEnvelope[]> {
    const results: DtnEnvelope[] = [];
    const now = Date.now();

    for (const id of request.requestedIds) {
      const env = await this.storage.getDtnEnvelope(id);
      if (env && env.expiresAt > now && !this.knownAcks.has(env.id)) {
        results.push(env);
      }
    }

    return results;
  }

  /**
   * Ingest envelopes transferred from a peer. Categorizes into delivered (for self)
   * or muled (to forward to future peers).
   */
  public async ingestEnvelopes(
    envelopes: DtnEnvelope[],
  ): Promise<IngestResult> {
    const delivered: DtnEnvelope[] = [];
    const muled: DtnEnvelope[] = [];
    const rejected: string[] = [];
    const now = Date.now();

    for (const env of envelopes) {
      // Check expiration
      if (env.expiresAt <= now) {
        rejected.push(env.id);
        continue;
      }

      // Check max hops
      const limit = env.maxHops ?? this.maxHops;
      if (env.hopCount >= limit) {
        rejected.push(env.id);
        continue;
      }

      // Check if already acknowledged
      if (this.knownAcks.has(env.id)) {
        rejected.push(env.id);
        continue;
      }

      // Increment hop count for store-and-forward relay
      const updatedEnv: DtnEnvelope = {
        ...env,
        hopCount: env.hopCount + 1,
      };

      if (updatedEnv.recipientFingerprint === this.localFingerprint) {
        // Local node IS the recipient!
        delivered.push(updatedEnv);
        this.knownAcks.add(updatedEnv.id);
        // Clean up from mule store if present
        await this.storage.removeDtnEnvelope(updatedEnv.id);
      } else {
        // Local node acts as a Data Mule
        const count = (await this.storage.getAllDtnEnvelopes()).length;
        if (count < this.maxMuleEnvelopes) {
          await this.storage.saveDtnEnvelope(updatedEnv);
          muled.push(updatedEnv);
        } else {
          rejected.push(updatedEnv.id);
        }
      }
    }

    return { delivered, muled, rejected };
  }

  /**
   * Create delivery acknowledgment for an envelope that reached its final destination.
   */
  public createAck(envelopeId: string): DtnAck {
    this.knownAcks.add(envelopeId);
    return {
      envelopeId,
      recipientFingerprint: this.localFingerprint,
      deliveredAt: Date.now(),
    };
  }

  /**
   * Handle incoming ACK: purge delivered envelope from local mule storage.
   */
  public async handleAck(ack: DtnAck): Promise<boolean> {
    this.knownAcks.add(ack.envelopeId);
    const existing = await this.storage.getDtnEnvelope(ack.envelopeId);
    if (existing) {
      await this.storage.removeDtnEnvelope(ack.envelopeId);
      return true;
    }
    return false;
  }

  /**
   * Find envelopes stored locally intended directly for an encountered peer.
   */
  public async getEnvelopesForPeer(
    peerFingerprint: string,
  ): Promise<DtnEnvelope[]> {
    const list = await this.storage.getDtnEnvelopesForPeer(peerFingerprint);
    const now = Date.now();
    return list.filter((e) => e.expiresAt > now && !this.knownAcks.has(e.id));
  }

  /**
   * Prune expired envelopes from storage.
   */
  public async pruneExpired(): Promise<number> {
    return this.storage.purgeExpiredDtnEnvelopes();
  }
}
