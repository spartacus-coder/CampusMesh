import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { AcousticModem } from "./acoustic-modem";

describe("@campusmesh/transport AcousticModem (Near-Ultrasound Data-over-Sound)", () => {
  let modem: AcousticModem;

  beforeEach(() => {
    modem = new AcousticModem({
      symbolDurationMs: 50,
      preambleFreq: 18200,
      baseDataFreq: 18400,
      channelSpacing: 100,
    });
  });

  afterEach(() => {
    modem.stopListening();
    modem.stopTransmitting();
  });

  it("should calculate correct CRC-8 checksums", () => {
    const data1 = new Uint8Array([0x01, 0x02, 0x03]);
    const crc1 = AcousticModem.calculateCrc8(data1);
    expect(crc1).toBeGreaterThanOrEqual(0);
    expect(crc1).toBeLessThanOrEqual(255);

    // Repeated calculation must be deterministic
    expect(AcousticModem.calculateCrc8(data1)).toBe(crc1);

    // Changed payload must result in different CRC
    const data2 = new Uint8Array([0x01, 0x02, 0x04]);
    expect(AcousticModem.calculateCrc8(data2)).not.toBe(crc1);
  });

  it("should modulate and demodulate text payload across near-ultrasound channels", () => {
    const message = "CAMPUS_P2P_MESH";
    const payload = new TextEncoder().encode(message);

    // Modulate bytes into frequency tones
    const frequencies = modem.frameToFrequencies(payload);
    expect(frequencies.length).toBe((payload.length + 4) * 2);

    // All data frequencies must be between 18.4 kHz and 19.9 kHz
    frequencies.forEach((f) => {
      expect(f).toBeGreaterThanOrEqual(18400);
      expect(f).toBeLessThanOrEqual(19900);
    });

    // Demodulate tones back into frame
    const result = modem.frequenciesToFrame(frequencies);
    expect(result).not.toBeNull();
    expect(result?.crcValid).toBe(true);
    expect(result?.text).toBe(message);
    expect(result?.raw).toEqual(payload);
  });

  it("should correctly decode frequencies with slight environmental drift (+/- 25 Hz)", () => {
    const payload = new Uint8Array([0x48, 0x69]); // "Hi"
    const perfectFreqs = modem.frameToFrequencies(payload);

    // Add jitter to frequencies
    const jitteredFreqs = perfectFreqs.map((f, i) =>
      i % 2 === 0 ? f + 20 : f - 20,
    );

    const result = modem.frequenciesToFrame(jitteredFreqs);
    expect(result).not.toBeNull();
    expect(result?.crcValid).toBe(true);
    expect(result?.text).toBe("Hi");
  });

  it("should reject corrupted or incomplete frames", () => {
    const payload = new TextEncoder().encode("SECURE_TOKEN");
    const frequencies = modem.frameToFrequencies(payload);

    // 1. Truncated frame
    const truncated = frequencies.slice(0, frequencies.length - 4);
    expect(modem.frequenciesToFrame(truncated)).toBeNull();

    // 2. Corrupt one frequency so nibble changes (CRC mismatch)
    const corrupted = [...frequencies];
    corrupted[4] = 19500; // Change a symbol
    const result = modem.frequenciesToFrame(corrupted);
    if (result) {
      expect(result.crcValid).toBe(false);
    }
  });

  it("should support headless transmit simulation without audio hardware", async () => {
    let progressReached = 0;
    await modem.transmit("TEST_BEACON", (p) => {
      progressReached = p;
    });
    expect(progressReached).toBe(100);
    expect(modem.isTransmitting).toBe(false);
  });
});
