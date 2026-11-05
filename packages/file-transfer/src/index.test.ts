import { describe, it, expect } from "vitest";
import {
  calculateTotalChunks,
  validateFileSize,
  MAX_DIRECT_FILE_SIZE_BYTES,
} from "./index";

describe("@campusmesh/file-transfer", () => {
  it("should calculate chunk counts for 16KB standard chunking", () => {
    expect(calculateTotalChunks(16384)).toBe(1);
    expect(calculateTotalChunks(16385)).toBe(2);
    expect(calculateTotalChunks(0)).toBe(0);
  });

  it("should reject files exceeding 200MB max limit", () => {
    expect(validateFileSize(MAX_DIRECT_FILE_SIZE_BYTES)).toBe(true);
    expect(validateFileSize(MAX_DIRECT_FILE_SIZE_BYTES + 1)).toBe(false);
    expect(validateFileSize(-1)).toBe(false);
  });
});
