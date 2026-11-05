import { DeliveryState, type WireEnvelope } from "@campusmesh/shared-types";

export interface LocalMessage {
  id: string;
  conversationId: string;
  senderFingerprint: string;
  text: string;
  timestamp: number;
  state: DeliveryState;
}

export class MessagingEngine {
  private messages = new Map<string, LocalMessage>();

  createOutgoingMessage(
    conversationId: string,
    senderFingerprint: string,
    text: string,
  ): LocalMessage {
    const id = `msg_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const message: LocalMessage = {
      id,
      conversationId,
      senderFingerprint,
      text,
      timestamp: Date.now(),
      state: DeliveryState.SAVED_LOCALLY,
    };
    this.messages.set(id, message);
    return message;
  }

  updateDeliveryState(id: string, state: DeliveryState): void {
    const msg = this.messages.get(id);
    if (msg) {
      msg.state = state;
    }
  }

  getMessage(id: string): LocalMessage | undefined {
    return this.messages.get(id);
  }

  processIncomingEnvelope(envelope: WireEnvelope): boolean {
    if (!envelope.id || !envelope.payloadCiphertext) {
      return false;
    }
    return true;
  }
}
