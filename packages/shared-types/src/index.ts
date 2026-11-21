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
 * Contact verification status.
 */
export enum ContactVerificationStatus {
  UNVERIFIED = "UNVERIFIED",
  VERIFIED = "VERIFIED",
  MISMATCH = "MISMATCH",
}

/**
 * Contact record stored in local persistence.
 */
export interface Contact {
  id: string;
  fingerprint: string;
  displayName: string;
  avatarUrl?: string | undefined;
  safetyNumber: string;
  isVerified: boolean;
  verificationStatus?: ContactVerificationStatus | undefined;
  isBlocked: boolean;
  ed25519PublicKey?: string | undefined;
  x25519PublicKey?: string | undefined;
  lastSeen?: number | undefined;
  addedAt?: number | undefined;
}

/**
 * Group member record.
 */
export interface GroupMember {
  fingerprint: string;
  role: GroupRole;
  joinedAt: number;
}

/**
 * Mesh group definition (max 8 peers for WebRTC mesh, or up to 100+ for Autobase Swarm).
 */
export interface MeshGroup {
  id: string;
  name: string;
  description?: string | undefined;
  avatarUrl?: string | undefined;
  ownerFingerprint: string;
  adminFingerprints: string[];
  memberFingerprints: string[];
  maxMembers: number;
  mode?: "webrtc-mesh" | "autobase-swarm" | undefined;
  autobaseKey?: string | undefined;
  autobaseDiscoveryKey?: string | undefined;
  createdAt: number;
  updatedAt: number;
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
  groupMode?: "webrtc-mesh" | "autobase-swarm" | undefined;
  swarmTopicHex?: string | undefined;
  autobaseKey?: string | undefined;
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

/**
 * Epidemic Delay-Tolerant Networking (DTN) Envelope for Store-and-Forward data mule routing.
 */
export interface DtnEnvelope {
  id: string;
  senderFingerprint: string;
  recipientFingerprint: string;
  encryptedPayload: string;
  timestamp: number;
  expiresAt: number;
  hopCount: number;
  maxHops?: number | undefined;
  signature?: string | undefined;
}

/**
 * DTN inventory announcement for epidemic gossip exchange.
 */
export interface DtnInventory {
  nodeFingerprint: string;
  envelopeIds: string[];
}

/**
 * DTN envelope batch request payload.
 */
export interface DtnRequest {
  nodeFingerprint: string;
  requestedIds: string[];
}

/**
 * Delivery acknowledgment gossip packet to purge delivered envelopes across the mesh.
 */
export interface DtnAck {
  envelopeId: string;
  recipientFingerprint: string;
  deliveredAt: number;
  signature?: string | undefined;
}

/**
 * Near-Ultrasound Acoustic Data-over-Sound packet format.
 */
export interface AcousticPacket {
  type: "identity" | "dtn_ping" | "contact_beacon";
  payload: string;
  checksum: number;
}
