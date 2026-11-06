/**
 * Cloudflare Worker Gateway & Ephemeral Room Coordinator constants
 */

export const SIGNALING_LIMITS = {
  MAX_CLIENTS_PER_ROOM: 8,
  ROOM_EXPIRATION_SECONDS: 900, // 15 minutes TTL
  MAX_MESSAGE_BYTES: 32768, // 32 KB signaling frame
} as const;

export interface SignalingRoomMessage {
  type: "offer" | "answer" | "candidate" | "ping" | "pong" | "join" | "leave";
  senderFingerprint: string;
  targetFingerprint?: string;
  data?: unknown;
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
