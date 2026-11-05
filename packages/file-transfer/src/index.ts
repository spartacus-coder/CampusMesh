export const CHUNK_SIZE_BYTES = 16384; // 16 KB chunks
export const MAX_DIRECT_FILE_SIZE_BYTES = 200 * 1024 * 1024; // 200 MB
export const BACKPRESSURE_HIGH_WATERMARK = 1024 * 1024; // 1 MB buffer pause

export interface FileMetadata {
  id: string;
  name: string;
  size: number;
  mimeType: string;
  sha256: string;
  totalChunks: number;
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
