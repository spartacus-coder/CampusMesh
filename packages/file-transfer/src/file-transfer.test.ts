import { describe, it, expect, vi } from "vitest";
import {
  CHUNK_SIZE_BYTES,
  MAX_DIRECT_FILE_SIZE_BYTES,
  createFileMetadata,
  serializeFileChunk,
  deserializeFileChunk,
  ChunkedFileSender,
  ChunkedFileReceiver,
  FileTransferStatus,
  type FileChunk,
} from "./index";

describe("@campusmesh/file-transfer streaming suite", () => {
  it("should create accurate metadata and reject files exceeding max direct size", () => {
    const sampleData = new Uint8Array(50000).fill(0x42);
    const meta = createFileMetadata(
      sampleData,
      "lecture_notes.pdf",
      "application/pdf",
    );

    expect(meta.name).toBe("lecture_notes.pdf");
    expect(meta.size).toBe(50000);
    expect(meta.mimeType).toBe("application/pdf");
    expect(meta.totalChunks).toBe(Math.ceil(50000 / CHUNK_SIZE_BYTES));
    expect(meta.sha256).toMatch(/^[0-9a-f]{64}$/);

    // Oversized data rejection (> 50 MB)
    const fakeOversized = {
      byteLength: MAX_DIRECT_FILE_SIZE_BYTES + 1024,
    } as Uint8Array;
    expect(() => createFileMetadata(fakeOversized, "huge.iso")).toThrow(
      /exceeds maximum allowed direct transfer size/,
    );
  });

  it("should correctly serialize and deserialize binary file chunks", () => {
    const rawChunkData = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
    const chunk: FileChunk = {
      fileId: "file-xyz",
      chunkIndex: 3,
      totalChunks: 10,
      chunkData: rawChunkData,
      chunkSha256: "fake-sha-hash",
    };

    const serialized = serializeFileChunk(chunk);
    expect(serialized.byteLength).toBeGreaterThan(rawChunkData.byteLength);

    const deserialized = deserializeFileChunk(serialized);
    expect(deserialized.fileId).toBe("file-xyz");
    expect(deserialized.chunkIndex).toBe(3);
    expect(deserialized.totalChunks).toBe(10);
    expect(deserialized.chunkSha256).toBe("fake-sha-hash");
    expect(Array.from(deserialized.chunkData)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8,
    ]);
  });

  it("should successfully transfer and assemble multi-chunk files end-to-end", async () => {
    // 60 KB data = ~4 chunks
    const originalData = new Uint8Array(60000);
    for (let i = 0; i < originalData.length; i++) {
      originalData[i] = i % 256;
    }

    const metadata = createFileMetadata(
      originalData,
      "project_diagram.png",
      "image/png",
    );

    let completedData: Uint8Array | null = null;
    const receiver = new ChunkedFileReceiver({
      metadata,
      onComplete: (data) => {
        completedData = data;
      },
    });

    const sender = new ChunkedFileSender({
      metadata,
      fileData: originalData,
      sendChunk: (chunk) => {
        // Wire simulation: serialize then deserialize
        const wireBytes = serializeFileChunk(chunk);
        const received = deserializeFileChunk(wireBytes);
        return receiver.receiveChunk(received);
      },
    });

    await sender.start();

    expect(sender.getStatus()).toBe(FileTransferStatus.COMPLETED);
    expect(receiver.getStatus()).toBe(FileTransferStatus.COMPLETED);
    expect(completedData).not.toBeNull();
    expect(completedData).toEqual(originalData);
    expect(receiver.getMissingChunks()).toHaveLength(0);
  });

  it("should handle out-of-order chunk arrival gracefully", async () => {
    const originalData = new Uint8Array(CHUNK_SIZE_BYTES * 3);
    originalData.fill(0x77);

    const metadata = createFileMetadata(
      originalData,
      "dataset.csv",
      "text/csv",
    );
    const receivedChunks: FileChunk[] = [];

    const sender = new ChunkedFileSender({
      metadata,
      fileData: originalData,
      sendChunk: (chunk) => {
        receivedChunks.push(chunk);
        return true;
      },
    });

    await sender.start();
    expect(receivedChunks).toHaveLength(3);

    // Deliver chunks out of order: chunk 2, then chunk 0, then chunk 1
    let completedData: Uint8Array | null = null;
    const receiver = new ChunkedFileReceiver({
      metadata,
      onComplete: (data) => {
        completedData = data;
      },
    });

    receiver.receiveChunk(receivedChunks[2]!);
    expect(receiver.getMissingChunks()).toEqual([0, 1]);

    receiver.receiveChunk(receivedChunks[0]!);
    expect(receiver.getMissingChunks()).toEqual([1]);

    receiver.receiveChunk(receivedChunks[1]!);
    expect(receiver.getMissingChunks()).toEqual([]);
    expect(receiver.getStatus()).toBe(FileTransferStatus.COMPLETED);
    expect(completedData).toEqual(originalData);
  });

  it("should detect and reject corrupted chunks", () => {
    const originalData = new Uint8Array(1000).fill(0x33);
    const metadata = createFileMetadata(originalData, "corrupt_test.bin");

    const onError = vi.fn();
    const receiver = new ChunkedFileReceiver({
      metadata,
      onError,
    });

    const corruptedChunk: FileChunk = {
      fileId: metadata.id,
      chunkIndex: 0,
      totalChunks: 1,
      chunkData: new Uint8Array(1000).fill(0x99), // Corrupted content
      chunkSha256:
        "0000000000000000000000000000000000000000000000000000000000000000",
    };

    const accepted = receiver.receiveChunk(corruptedChunk);
    expect(accepted).toBe(false);
    expect(receiver.getStatus()).toBe(FileTransferStatus.FAILED);
    expect(onError).toHaveBeenCalledWith(expect.any(Error));
  });

  it("should respect pause, resume, and cancel on sender", async () => {
    const data = new Uint8Array(CHUNK_SIZE_BYTES * 10);
    const metadata = createFileMetadata(data, "large_file.zip");

    const delivered: number[] = [];
    const sender = new ChunkedFileSender({
      metadata,
      fileData: data,
      sendChunk: (chunk) => {
        delivered.push(chunk.chunkIndex);
        if (chunk.chunkIndex === 3) {
          sender.pause();
        }
        return true;
      },
    });

    await sender.start();
    expect(sender.getStatus()).toBe(FileTransferStatus.PAUSED);
    expect(delivered.length).toBe(4); // 0, 1, 2, 3

    sender.cancel();
    expect(sender.getStatus()).toBe(FileTransferStatus.CANCELLED);
  });
});
