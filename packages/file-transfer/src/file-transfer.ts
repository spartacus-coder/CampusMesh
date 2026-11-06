import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";

export const CHUNK_SIZE_BYTES = 16384; // 16 KB chunks
export const MAX_DIRECT_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB
export const BACKPRESSURE_HIGH_WATERMARK = 1024 * 1024; // 1 MB pause threshold
export const BACKPRESSURE_LOW_WATERMARK = 256 * 1024; // 256 KB resume threshold

export enum FileTransferStatus {
  PENDING = "PENDING",
  OFFERED = "OFFERED",
  TRANSFERRING = "TRANSFERRING",
  PAUSED = "PAUSED",
  COMPLETED = "COMPLETED",
  FAILED = "FAILED",
  CANCELLED = "CANCELLED",
}

export interface FileMetadata {
  id: string;
  name: string;
  size: number;
  mimeType: string;
  sha256: string;
  totalChunks: number;
}

export interface FileChunk {
  fileId: string;
  chunkIndex: number;
  totalChunks: number;
  chunkData: Uint8Array;
  chunkSha256: string;
}

export interface FileTransferProgress {
  fileId: string;
  fileName: string;
  totalBytes: number;
  transferredBytes: number;
  percentage: number;
  currentChunk: number;
  totalChunks: number;
  status: FileTransferStatus;
}

export function computeSha256Hex(data: Uint8Array): string {
  const hash = sha256(data);
  return bytesToHex(hash);
}

export function calculateTotalChunks(
  fileSize: number,
  chunkSize = CHUNK_SIZE_BYTES,
): number {
  if (fileSize <= 0) return 0;
  return Math.ceil(fileSize / chunkSize);
}

export function validateFileSize(size: number): boolean {
  return size > 0 && size <= MAX_DIRECT_FILE_SIZE_BYTES;
}

export function createFileMetadata(
  fileData: Uint8Array,
  name: string,
  mimeType = "application/octet-stream",
): FileMetadata {
  const size = fileData.byteLength;
  if (!validateFileSize(size)) {
    throw new Error(
      `File size (${size} bytes) exceeds maximum allowed direct transfer size (${MAX_DIRECT_FILE_SIZE_BYTES} bytes)`,
    );
  }

  const hash = computeSha256Hex(fileData);
  const totalChunks = calculateTotalChunks(size, CHUNK_SIZE_BYTES);
  const fileId = `file-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

  return {
    id: fileId,
    name,
    size,
    mimeType,
    sha256: hash,
    totalChunks,
  };
}

/**
 * Binary framing for transmitting chunks over RTCDataChannel `cm-binary`
 * Header layout:
 * [4 bytes] JSON header length (Uint32BE)
 * [N bytes] JSON string header (fileId, chunkIndex, totalChunks, chunkSha256)
 * [M bytes] Raw chunk binary payload
 */
export function serializeFileChunk(chunk: FileChunk): Uint8Array {
  const headerObj = {
    fid: chunk.fileId,
    idx: chunk.chunkIndex,
    tot: chunk.totalChunks,
    sha: chunk.chunkSha256,
  };
  const headerBytes = new TextEncoder().encode(JSON.stringify(headerObj));
  const totalLength = 4 + headerBytes.byteLength + chunk.chunkData.byteLength;
  const result = new Uint8Array(totalLength);
  const view = new DataView(
    result.buffer,
    result.byteOffset,
    result.byteLength,
  );

  view.setUint32(0, headerBytes.byteLength, false);
  result.set(headerBytes, 4);
  result.set(chunk.chunkData, 4 + headerBytes.byteLength);

  return result;
}

export function deserializeFileChunk(data: Uint8Array): FileChunk {
  if (data.byteLength < 4) {
    throw new Error("Invalid chunk payload: buffer too short");
  }
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const headerLen = view.getUint32(0, false);
  if (data.byteLength < 4 + headerLen) {
    throw new Error("Invalid chunk payload: truncated header");
  }

  const headerBytes = data.subarray(4, 4 + headerLen);
  const headerStr = new TextDecoder().decode(headerBytes);
  const header = JSON.parse(headerStr) as {
    fid: string;
    idx: number;
    tot: number;
    sha: string;
  };
  const chunkData = data.subarray(4 + headerLen);

  return {
    fileId: header.fid,
    chunkIndex: header.idx,
    totalChunks: header.tot,
    chunkData,
    chunkSha256: header.sha,
  };
}

export class ChunkedFileSender {
  private metadata: FileMetadata;
  private fileData: Uint8Array;
  private sendChunkCallback: (chunk: FileChunk) => Promise<boolean> | boolean;
  private getBufferedAmount?: (() => number) | undefined;
  private onProgress?: ((progress: FileTransferProgress) => void) | undefined;

  private status: FileTransferStatus = FileTransferStatus.PENDING;
  private currentChunkIndex = 0;
  private isPaused = false;
  private isCancelled = false;

  constructor(options: {
    metadata: FileMetadata;
    fileData: Uint8Array;
    sendChunk: (chunk: FileChunk) => Promise<boolean> | boolean;
    getBufferedAmount?: (() => number) | undefined;
    onProgress?: ((progress: FileTransferProgress) => void) | undefined;
  }) {
    this.metadata = options.metadata;
    this.fileData = options.fileData;
    this.sendChunkCallback = options.sendChunk;
    this.getBufferedAmount = options.getBufferedAmount;
    this.onProgress = options.onProgress;
  }

  public getStatus(): FileTransferStatus {
    return this.status;
  }

  public async start(): Promise<void> {
    if (this.status === FileTransferStatus.TRANSFERRING) {
      return;
    }
    this.status = FileTransferStatus.TRANSFERRING;
    this.isPaused = false;
    this.isCancelled = false;

    await this.sendLoop();
  }

  public pause(): void {
    if (this.status === FileTransferStatus.TRANSFERRING) {
      this.isPaused = true;
      this.status = FileTransferStatus.PAUSED;
      this.notifyProgress();
    }
  }

  public async resume(): Promise<void> {
    if (this.status === FileTransferStatus.PAUSED) {
      this.isPaused = false;
      this.status = FileTransferStatus.TRANSFERRING;
      await this.sendLoop();
    }
  }

  public cancel(): void {
    this.isCancelled = true;
    this.status = FileTransferStatus.CANCELLED;
    this.notifyProgress();
  }

  public async sendSpecificChunk(chunkIndex: number): Promise<boolean> {
    if (chunkIndex < 0 || chunkIndex >= this.metadata.totalChunks) {
      return false;
    }
    const chunk = this.sliceChunk(chunkIndex);
    return this.sendChunkCallback(chunk);
  }

  private sliceChunk(chunkIndex: number): FileChunk {
    const start = chunkIndex * CHUNK_SIZE_BYTES;
    const end = Math.min(start + CHUNK_SIZE_BYTES, this.fileData.byteLength);
    const chunkData = this.fileData.subarray(start, end);
    const chunkSha256 = computeSha256Hex(chunkData);

    return {
      fileId: this.metadata.id,
      chunkIndex,
      totalChunks: this.metadata.totalChunks,
      chunkData,
      chunkSha256,
    };
  }

  private async sendLoop(): Promise<void> {
    while (
      this.currentChunkIndex < this.metadata.totalChunks &&
      !this.isPaused &&
      !this.isCancelled
    ) {
      // Flow control & backpressure check
      if (this.getBufferedAmount) {
        const buffered = this.getBufferedAmount();
        if (buffered > BACKPRESSURE_HIGH_WATERMARK) {
          // Pause until buffer drains below low watermark
          await new Promise((resolve) => setTimeout(resolve, 50));
          continue;
        }
      }

      const chunk = this.sliceChunk(this.currentChunkIndex);
      const sent = await this.sendChunkCallback(chunk);
      if (!sent) {
        this.status = FileTransferStatus.FAILED;
        this.notifyProgress();
        return;
      }

      this.currentChunkIndex++;
      this.notifyProgress();

      // Yield slightly to maintain responsive event loop
      if (this.currentChunkIndex % 10 === 0) {
        await new Promise((resolve) => setTimeout(resolve, 1));
      }
    }

    if (
      this.currentChunkIndex >= this.metadata.totalChunks &&
      !this.isCancelled
    ) {
      this.status = FileTransferStatus.COMPLETED;
      this.notifyProgress();
    }
  }

  private notifyProgress(): void {
    if (this.onProgress) {
      const transferredBytes = Math.min(
        this.currentChunkIndex * CHUNK_SIZE_BYTES,
        this.metadata.size,
      );
      const percentage =
        this.metadata.size > 0
          ? Math.min(100, (transferredBytes / this.metadata.size) * 100)
          : 100;

      this.onProgress({
        fileId: this.metadata.id,
        fileName: this.metadata.name,
        totalBytes: this.metadata.size,
        transferredBytes,
        percentage,
        currentChunk: this.currentChunkIndex,
        totalChunks: this.metadata.totalChunks,
        status: this.status,
      });
    }
  }
}

export class ChunkedFileReceiver {
  private metadata: FileMetadata;
  private chunks = new Map<number, Uint8Array>();
  private status: FileTransferStatus = FileTransferStatus.TRANSFERRING;
  private onProgress?: ((progress: FileTransferProgress) => void) | undefined;
  private onComplete?:
    ((data: Uint8Array, metadata: FileMetadata) => void) | undefined;
  private onError?: ((err: Error) => void) | undefined;

  constructor(options: {
    metadata: FileMetadata;
    onProgress?: ((progress: FileTransferProgress) => void) | undefined;
    onComplete?:
      ((data: Uint8Array, metadata: FileMetadata) => void) | undefined;
    onError?: ((err: Error) => void) | undefined;
  }) {
    this.metadata = options.metadata;
    this.onProgress = options.onProgress;
    this.onComplete = options.onComplete;
    this.onError = options.onError;
  }

  public getStatus(): FileTransferStatus {
    return this.status;
  }

  public receiveChunk(chunk: FileChunk): boolean {
    if (this.status === FileTransferStatus.CANCELLED) {
      return false;
    }
    if (chunk.fileId !== this.metadata.id) {
      return false;
    }
    if (chunk.chunkIndex < 0 || chunk.chunkIndex >= this.metadata.totalChunks) {
      return false;
    }

    // Verify chunk integrity
    const computedChunkHash = computeSha256Hex(chunk.chunkData);
    if (computedChunkHash !== chunk.chunkSha256) {
      const err = new Error(
        `Chunk ${chunk.chunkIndex} hash mismatch: corrupted chunk received`,
      );
      this.status = FileTransferStatus.FAILED;
      this.onError?.(err);
      return false;
    }

    this.chunks.set(chunk.chunkIndex, chunk.chunkData);
    this.notifyProgress();

    // Check completion
    if (this.chunks.size === this.metadata.totalChunks) {
      const assembled = this.assemble();
      const finalHash = computeSha256Hex(assembled);

      if (finalHash !== this.metadata.sha256) {
        const err = new Error(
          `Final file hash mismatch. Expected ${this.metadata.sha256}, calculated ${finalHash}`,
        );
        this.status = FileTransferStatus.FAILED;
        this.onError?.(err);
        return false;
      }

      this.status = FileTransferStatus.COMPLETED;
      this.notifyProgress();
      this.onComplete?.(assembled, this.metadata);
    }

    return true;
  }

  public getMissingChunks(): number[] {
    const missing: number[] = [];
    for (let i = 0; i < this.metadata.totalChunks; i++) {
      if (!this.chunks.has(i)) {
        missing.push(i);
      }
    }
    return missing;
  }

  public getReceivedData(): Uint8Array | null {
    if (this.status !== FileTransferStatus.COMPLETED) {
      return null;
    }
    return this.assemble();
  }

  public cancel(): void {
    this.status = FileTransferStatus.CANCELLED;
    this.chunks.clear();
    this.notifyProgress();
  }

  private assemble(): Uint8Array {
    const result = new Uint8Array(this.metadata.size);
    let offset = 0;
    for (let i = 0; i < this.metadata.totalChunks; i++) {
      const chunk = this.chunks.get(i);
      if (chunk) {
        result.set(chunk, offset);
        offset += chunk.byteLength;
      }
    }
    return result;
  }

  private notifyProgress(): void {
    if (this.onProgress) {
      let transferredBytes = 0;
      for (const chunk of this.chunks.values()) {
        transferredBytes += chunk.byteLength;
      }
      const percentage =
        this.metadata.size > 0
          ? Math.min(100, (transferredBytes / this.metadata.size) * 100)
          : 100;

      this.onProgress({
        fileId: this.metadata.id,
        fileName: this.metadata.name,
        totalBytes: this.metadata.size,
        transferredBytes,
        percentage,
        currentChunk: this.chunks.size,
        totalChunks: this.metadata.totalChunks,
        status: this.status,
      });
    }
  }
}
