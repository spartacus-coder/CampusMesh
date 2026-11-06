/**
 * CampusMesh Shared Domain Types, Enumerations, and Wire Interfaces
 */

/**
 * 6-state message delivery lifecycle.
 */
export enum DeliveryState {
  SAVED_LOCALLY = "SAVED_LOCALLY",
  CONNECTING = "CONNECTING",
  SENT = "SENT",
  DELIVERED = "DELIVERED",
  READ = "READ",
  FAILED = "FAILED",
}

/**
 * Serverless signaling gateway connection states.
 */
export enum SignalingState {
  IDLE = "IDLE",
  CONNECTING = "CONNECTING",
  CONNECTED = "CONNECTED",
  DISCONNECTED = "DISCONNECTED",
  UNAVAILABLE_QUOTA = "UNAVAILABLE_QUOTA",
  FAILED = "FAILED",
}

/**
 * WebRTC P2P transport connection states.
 */
export enum PeerConnectionState {
  NEW = "NEW",
  CONNECTING = "CONNECTING",
  CONNECTED = "CONNECTED",
  DISCONNECTED = "DISCONNECTED",
  FAILED = "FAILED",
  CLOSED = "CLOSED",
}

/**
 * Supported message payload types.
 */
export enum MessageType {
  TEXT = "TEXT",
  ATTACHMENT = "ATTACHMENT",
  VOICE = "VOICE",
  ACK = "ACK",
  READ_RECEIPT = "READ_RECEIPT",
  GROUP_MEMBERSHIP = "GROUP_MEMBERSHIP",
}

/**
 * Roles within a group conversation.
 */
export enum GroupRole {
  OWNER = "OWNER",
  ADMIN = "ADMIN",
  MEMBER = "MEMBER",
}

/**
 * User cryptographic identity profile.
 */
export interface IdentityProfile {
  id: string;
  fingerprint: string;
  displayName: string;
  avatarUrl?: string;
  ed25519PublicKey: string; // Base64URL
  x25519PublicKey: string; // Base64URL
  createdAt: number;
}

/**
 * Contact record stored in local persistence.
 */
export interface Contact {
  id: string;
  fingerprint: string;
  displayName: string;
  avatarUrl?: string;
  safetyNumber: string;
  isVerified: boolean;
  isBlocked: boolean;
  lastSeen?: number;
}

/**
 * Conversation model representing 1-to-1 or group chats.
 */
export interface Conversation {
  id: string;
  isGroup: boolean;
  name: string;
  avatarUrl?: string;
  peerFingerprint?: string; // For 1-to-1
  groupId?: string; // For groups
  lastMessagePreview?: string;
  lastMessageTimestamp?: number;
  unreadCount: number;
  isPinned: boolean;
  isArchived: boolean;
}

/**
 * Wire envelope transferred over WebRTC DataChannels.
 */
export interface WireEnvelope {
  version: 1;
  id: string;
  type: MessageType;
  conversationId: string;
  senderFingerprint: string;
  timestamp: number;
  sequenceNumber: number;
  ratchetHeader?:
    | {
        dhPublicKey: string;
        previousChainLength: number;
        messageIndex: number;
      }
    | undefined;
  payloadCiphertext: string;
  authTag: string;
  signature: string;
}
