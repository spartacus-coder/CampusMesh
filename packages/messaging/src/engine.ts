import {
  DeliveryState,
  MessageType,
  type WireEnvelope,
} from "@campusmesh/shared-types";
import { DoubleRatchetSession, type Ed25519KeyPair } from "@campusmesh/crypto";
import {
  createSignedEnvelope,
  verifyEnvelopeSignature,
  serializeEnvelope,
  deserializeEnvelope,
} from "@campusmesh/protocol";
import type { IStoragePort, StoredMessage } from "@campusmesh/storage";
import { WebRtcPeerTransport } from "@campusmesh/transport";

export interface MessagingEngineOptions {
  storage: IStoragePort;
  localFingerprint: string;
  signingKeyPair: Ed25519KeyPair;
  transport?: WebRtcPeerTransport | undefined;
  mailboxDepositCallback?:
    | ((
        recipientFingerprint: string,
        envelopeString: string,
      ) => Promise<boolean> | boolean)
    | undefined;
}

export function calculateExponentialBackoff(
  retryCount: number,
  baseDelayMs = 2000,
  maxDelayMs = 60000,
): number {
  const jitter = Math.random() * 500;
  const delay =
    Math.min(baseDelayMs * Math.pow(2, retryCount), maxDelayMs) + jitter;
  return Math.round(delay);
}

export interface PeerCryptoSession {
  ratchet: DoubleRatchetSession;
  peerEd25519PublicKey: Uint8Array;
}

export class CampusMeshMessagingEngine {
  private storage: IStoragePort;
  private localFingerprint: string;
  private signingKeyPair: Ed25519KeyPair;
  private transport: WebRtcPeerTransport | undefined;
  private mailboxDepositCallback?:
    | ((
        recipientFingerprint: string,
        envelopeString: string,
      ) => Promise<boolean> | boolean)
    | undefined;
  private sessions = new Map<string, PeerCryptoSession>();
  private sequenceCounters = new Map<string, number>();

  public onMessageReceived?: (message: StoredMessage) => void;
  public onDeliveryStateChanged?: (
    messageId: string,
    state: DeliveryState,
  ) => void;

  constructor(options: MessagingEngineOptions) {
    this.storage = options.storage;
    this.localFingerprint = options.localFingerprint;
    this.signingKeyPair = options.signingKeyPair;
    this.transport = options.transport;
    this.mailboxDepositCallback = options.mailboxDepositCallback;

    if (this.transport) {
      this.transport.onDataMessage = (peerFp, channel, data) => {
        if (channel === "cm-messages") {
          this.processIncomingData(peerFp, data);
        }
      };
    }
  }

  public registerPeerCryptoSession(
    peerFingerprint: string,
    ratchet: DoubleRatchetSession,
    peerEd25519PublicKey: Uint8Array,
  ) {
    this.sessions.set(peerFingerprint, { ratchet, peerEd25519PublicKey });
  }

  public getPeerCryptoSession(
    peerFingerprint: string,
  ): PeerCryptoSession | undefined {
    return this.sessions.get(peerFingerprint);
  }

  private getNextSequence(conversationId: string): number {
    const current = this.sequenceCounters.get(conversationId) || 0;
    const next = current + 1;
    this.sequenceCounters.set(conversationId, next);
    return next;
  }

  /**
   * Encrypts and transmits a direct text message, updating delivery lifecycle.
   */
  public async sendTextMessage(
    conversationId: string,
    recipientFingerprint: string,
    text: string,
  ): Promise<StoredMessage> {
    const session = this.sessions.get(recipientFingerprint);
    if (!session) {
      throw new Error(
        `Cannot send message: no established cryptographic ratchet session with ${recipientFingerprint}`,
      );
    }

    const messageId = `msg_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const timestamp = Date.now();
    const sequenceNumber = this.getNextSequence(conversationId);

    // 1. Initial local record: SAVED_LOCALLY
    const storedMsg: StoredMessage = {
      id: messageId,
      conversationId,
      senderFingerprint: this.localFingerprint,
      recipientFingerprint,
      content: text,
      contentType: MessageType.TEXT,
      timestamp,
      deliveryState: DeliveryState.SAVED_LOCALLY,
      isOutgoing: true,
    };
    await this.storage.saveMessage(storedMsg);

    // 2. Encrypt payload with Double Ratchet
    const plaintextBytes = new TextEncoder().encode(text);
    const encrypted = await session.ratchet.encrypt(plaintextBytes);

    // 3. Create signed wire envelope
    const envelope = createSignedEnvelope({
      id: messageId,
      type: MessageType.TEXT,
      conversationId,
      senderFingerprint: this.localFingerprint,
      timestamp,
      sequenceNumber,
      ratchetHeader: encrypted.header,
      payloadCiphertext: encrypted.ciphertext,
      authTag: encrypted.iv,
      privateSigningKey: this.signingKeyPair.privateKey,
    });

    const envelopeBytes = new TextEncoder().encode(serializeEnvelope(envelope));

    // 4. Transmit via WebRTC DataChannel if transport available
    let sent = false;
    if (this.transport) {
      sent = this.transport.sendData(
        recipientFingerprint,
        "cm-messages",
        envelopeBytes,
      );
    }

    if (sent) {
      storedMsg.deliveryState = DeliveryState.SENT;
      await this.storage.updateMessageDeliveryState(
        messageId,
        DeliveryState.SENT,
      );
      this.onDeliveryStateChanged?.(messageId, DeliveryState.SENT);
    } else {
      let deposited = false;
      if (this.mailboxDepositCallback) {
        try {
          deposited = await this.mailboxDepositCallback(
            recipientFingerprint,
            serializeEnvelope(envelope),
          );
        } catch {
          deposited = false;
        }
      }

      if (deposited) {
        storedMsg.deliveryState = DeliveryState.SENT;
        await this.storage.updateMessageDeliveryState(
          messageId,
          DeliveryState.SENT,
        );
        this.onDeliveryStateChanged?.(messageId, DeliveryState.SENT);
      } else {
        // Queue to outbox for retry when peer connects
        await this.storage.queueOutboxMessage({
          id: messageId,
          envelope,
          recipientFingerprint,
          createdAt: timestamp,
          retryCount: 0,
          nextRetryAt: timestamp + calculateExponentialBackoff(0),
        });
      }
    }

    return storedMsg;
  }

  /**
   * Processes raw binary data received over WebRTC DataChannel (cm-messages).
   */
  public async processIncomingData(
    senderFingerprint: string,
    data: Uint8Array,
  ): Promise<StoredMessage | null> {
    const session = this.sessions.get(senderFingerprint);
    if (!session) {
      console.warn(
        `Ignoring incoming message: unauthenticated peer ${senderFingerprint}`,
      );
      return null;
    }

    let rawString = "";
    try {
      rawString = new TextDecoder().decode(data);
    } catch {
      return null;
    }

    let envelope: WireEnvelope;
    try {
      envelope = deserializeEnvelope(rawString);
    } catch {
      return null;
    }

    // Authenticate signature
    const isAuthentic = verifyEnvelopeSignature(
      envelope,
      session.peerEd25519PublicKey,
    );
    if (!isAuthentic) {
      console.warn(
        `Rejected envelope: invalid Ed25519 signature from ${senderFingerprint}`,
      );
      return null;
    }

    // Handle ACK & READ_RECEIPT
    if (envelope.type === MessageType.ACK) {
      await this.storage.updateMessageDeliveryState(
        envelope.id,
        DeliveryState.DELIVERED,
      );
      this.onDeliveryStateChanged?.(envelope.id, DeliveryState.DELIVERED);
      return null;
    }

    if (envelope.type === MessageType.READ_RECEIPT) {
      await this.storage.updateMessageDeliveryState(
        envelope.id,
        DeliveryState.READ,
      );
      this.onDeliveryStateChanged?.(envelope.id, DeliveryState.READ);
      return null;
    }

    if (envelope.type === MessageType.TEXT && envelope.ratchetHeader) {
      // Decrypt with Double Ratchet
      const decryptedBytes = await session.ratchet.decrypt({
        header: envelope.ratchetHeader,
        ciphertext: envelope.payloadCiphertext,
        iv: envelope.authTag,
      });

      const text = new TextDecoder().decode(decryptedBytes);

      const receivedMsg: StoredMessage = {
        id: envelope.id,
        conversationId: envelope.conversationId,
        senderFingerprint,
        content: text,
        contentType: MessageType.TEXT,
        timestamp: envelope.timestamp,
        deliveryState: DeliveryState.DELIVERED,
        isOutgoing: false,
      };

      await this.storage.saveMessage(receivedMsg);

      // Send ACK back to sender immediately
      this.sendAck(senderFingerprint, envelope.id, envelope.conversationId);

      this.onMessageReceived?.(receivedMsg);
      return receivedMsg;
    }

    return null;
  }

  private sendAck(
    recipientFingerprint: string,
    messageId: string,
    conversationId: string,
  ) {
    if (!this.transport) return;
    const ackEnvelope = createSignedEnvelope({
      id: messageId,
      type: MessageType.ACK,
      conversationId,
      senderFingerprint: this.localFingerprint,
      sequenceNumber: 0,
      payloadCiphertext: "",
      authTag: "",
      privateSigningKey: this.signingKeyPair.privateKey,
    });
    const bytes = new TextEncoder().encode(serializeEnvelope(ackEnvelope));
    this.transport.sendData(recipientFingerprint, "cm-messages", bytes);
  }

  public sendReadReceipt(
    recipientFingerprint: string,
    messageId: string,
    conversationId: string,
  ) {
    if (!this.transport) return;
    const receiptEnvelope = createSignedEnvelope({
      id: messageId,
      type: MessageType.READ_RECEIPT,
      conversationId,
      senderFingerprint: this.localFingerprint,
      sequenceNumber: 0,
      payloadCiphertext: "",
      authTag: "",
      privateSigningKey: this.signingKeyPair.privateKey,
    });
    const bytes = new TextEncoder().encode(serializeEnvelope(receiptEnvelope));
    this.transport.sendData(recipientFingerprint, "cm-messages", bytes);
  }

  /**
   * Flushes outbox queue for a peer when WebRTC connection is restored.
   */
  public async flushOutbox(peerFingerprint: string): Promise<number> {
    if (!this.transport) return 0;
    const pending = await this.storage.getPendingOutboxMessages();
    let sentCount = 0;

    for (const item of pending) {
      if (item.recipientFingerprint === peerFingerprint) {
        const bytes = new TextEncoder().encode(
          serializeEnvelope(item.envelope),
        );
        const success = this.transport.sendData(
          peerFingerprint,
          "cm-messages",
          bytes,
        );
        if (success) {
          await this.storage.removeOutboxMessage(item.id);
          await this.storage.updateMessageDeliveryState(
            item.id,
            DeliveryState.SENT,
          );
          this.onDeliveryStateChanged?.(item.id, DeliveryState.SENT);
          sentCount++;
        }
      }
    }

    return sentCount;
  }

  /**
   * Evaluates pending outbox queue and retries messages whose nextRetryAt <= now.
   */
  public async retryPendingOutbox(now = Date.now()): Promise<number> {
    if (!this.transport) return 0;
    const pending = await this.storage.getPendingOutboxMessages();
    let sentCount = 0;

    for (const item of pending) {
      if (item.nextRetryAt <= now) {
        const bytes = new TextEncoder().encode(
          serializeEnvelope(item.envelope),
        );
        const success = this.transport.sendData(
          item.recipientFingerprint,
          "cm-messages",
          bytes,
        );
        if (success) {
          await this.storage.removeOutboxMessage(item.id);
          await this.storage.updateMessageDeliveryState(
            item.id,
            DeliveryState.SENT,
          );
          this.onDeliveryStateChanged?.(item.id, DeliveryState.SENT);
          sentCount++;
        } else {
          // Increment retry count with exponential backoff
          const nextRetry = item.retryCount + 1;
          await this.storage.queueOutboxMessage({
            ...item,
            retryCount: nextRetry,
            nextRetryAt: now + calculateExponentialBackoff(nextRetry),
          });
        }
      }
    }

    return sentCount;
  }
}
