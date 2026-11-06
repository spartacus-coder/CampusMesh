/**
 * Cloudflare Worker Gateway & Ephemeral Room Coordinator constants
 */

export const SIGNALING_LIMITS = {
  MAX_CLIENTS_PER_ROOM: 8,
  ROOM_EXPIRATION_SECONDS: 900, // 15 minutes TTL for empty rooms
  MAX_MESSAGE_BYTES: 65536, // 64 KB signaling & envelope frame
  MAILBOX_TTL_SECONDS: 86400, // 24 hours TTL for offline mailbox
  MAX_MAILBOX_MESSAGES_PER_ROOM: 100, // Hard ceiling to prevent DO SQLite quota exhaustion
} as const;

export interface MailboxRecord {
  id: string;
  recipientFingerprint: string;
  senderFingerprint: string;
  envelope: string;
  createdAt: number;
  expiresAt: number;
}

export interface SignalingRoomMessage {
  type:
    | "offer"
    | "answer"
    | "candidate"
    | "ping"
    | "pong"
    | "join"
    | "leave"
    | "mailbox_deposit"
    | "mailbox_fetch"
    | "mailbox_deliver";
  senderFingerprint: string;
  targetFingerprint?: string | undefined;
  data?: unknown;
  mailboxRecord?: MailboxRecord | undefined;
  mailboxMessages?: MailboxRecord[] | undefined;
}

export function validateSignalingMessage(
  msg: unknown,
): msg is SignalingRoomMessage {
  if (typeof msg !== "object" || msg === null) return false;
  const cast = msg as Record<string, unknown>;
  return (
    typeof cast["type"] === "string" &&
    typeof cast["senderFingerprint"] === "string"
  );
}

export * from "./room-coordinator";
export * from "./worker";
import worker from "./worker";
export default worker;
