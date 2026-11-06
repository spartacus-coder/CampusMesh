import { defineStore } from "pinia";
import { ref } from "vue";
import {
  type FileMetadata,
  type FileTransferProgress,
  createFileMetadata,
  serializeFileChunk,
  deserializeFileChunk,
  ChunkedFileSender,
  ChunkedFileReceiver,
  MAX_DIRECT_FILE_SIZE_BYTES,
} from "@campusmesh/file-transfer";
import { useChatStore } from "./chat";
import { DeliveryState, MessageType } from "@campusmesh/shared-types";
import type { StoredMessage } from "@campusmesh/storage";

export interface StoredAttachmentPayload {
  fileId: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  sha256: string;
  totalChunks: number;
}

export const useFileTransferStore = defineStore("fileTransfer", () => {
  const chatStore = useChatStore();

  const transfers = ref<Record<string, FileTransferProgress>>({});
  const completedFiles = ref<
    Record<string, { data: Uint8Array; metadata: FileMetadata }>
  >({});
  const activeReceivers = new Map<string, ChunkedFileReceiver>();
  const activeSenders = new Map<string, ChunkedFileSender>();

  // Mock or real WebRTC transport hook
  let transportSendBinary:
    ((peerFp: string, data: Uint8Array) => boolean) | null = null;

  function setBinaryTransport(
    fn: (peerFp: string, data: Uint8Array) => boolean,
  ) {
    transportSendBinary = fn;
  }

  async function sendFile(
    file: File,
    conversationId: string,
    recipientFingerprint?: string,
  ): Promise<FileMetadata> {
    if (file.size > MAX_DIRECT_FILE_SIZE_BYTES) {
      throw new Error(
        `File exceeds maximum direct P2P size limit of ${Math.round(MAX_DIRECT_FILE_SIZE_BYTES / (1024 * 1024))} MB.`,
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const fileBytes = new Uint8Array(arrayBuffer);
    const metadata = createFileMetadata(
      fileBytes,
      file.name,
      file.type || "application/octet-stream",
    );

    // Record in local cache
    completedFiles.value[metadata.id] = {
      data: fileBytes,
      metadata,
    };

    // Format attachment payload
    const payload: StoredAttachmentPayload = {
      fileId: metadata.id,
      fileName: metadata.name,
      fileSize: metadata.size,
      mimeType: metadata.mimeType,
      sha256: metadata.sha256,
      totalChunks: metadata.totalChunks,
    };

    const msg: StoredMessage = {
      id: `msg_file_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      conversationId,
      senderFingerprint: "me",
      ...(recipientFingerprint ? { recipientFingerprint } : {}),
      content: JSON.stringify(payload),
      contentType: MessageType.ATTACHMENT,
      timestamp: Date.now(),
      deliveryState: DeliveryState.SENT,
      isOutgoing: true,
    };

    chatStore.appendMessage(msg);

    // Setup sender
    const sender = new ChunkedFileSender({
      metadata,
      fileData: fileBytes,
      sendChunk: (chunk) => {
        const wireBytes = serializeFileChunk(chunk);
        if (transportSendBinary && recipientFingerprint) {
          return transportSendBinary(recipientFingerprint, wireBytes);
        }
        return true;
      },
      onProgress: (prog) => {
        transfers.value[metadata.id] = { ...prog };
      },
    });

    activeSenders.set(metadata.id, sender);
    await sender.start();

    return metadata;
  }

  function handleIncomingBinaryChunk(
    wireBytes: Uint8Array,
    metadataLookup?: FileMetadata,
  ): boolean {
    const chunk = deserializeFileChunk(wireBytes);
    let receiver = activeReceivers.get(chunk.fileId);

    if (!receiver && metadataLookup) {
      receiver = new ChunkedFileReceiver({
        metadata: metadataLookup,
        onProgress: (prog) => {
          transfers.value[chunk.fileId] = { ...prog };
        },
        onComplete: (data, meta) => {
          completedFiles.value[meta.id] = { data, metadata: meta };
          activeReceivers.delete(meta.id);
        },
      });
      activeReceivers.set(chunk.fileId, receiver);
    }

    if (receiver) {
      return receiver.receiveChunk(chunk);
    }
    return false;
  }

  function downloadFile(fileId: string): void {
    const record = completedFiles.value[fileId];
    if (!record) return;

    const blob = new Blob([record.data as unknown as BlobPart], {
      type: record.metadata.mimeType,
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = record.metadata.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function getFileBlobUrl(fileId: string): string | null {
    const record = completedFiles.value[fileId];
    if (!record) return null;
    const blob = new Blob([record.data as unknown as BlobPart], {
      type: record.metadata.mimeType,
    });
    return URL.createObjectURL(blob);
  }

  return {
    transfers,
    completedFiles,
    setBinaryTransport,
    sendFile,
    handleIncomingBinaryChunk,
    downloadFile,
    getFileBlobUrl,
  };
});
