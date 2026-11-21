import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { LoRaSerialAdapter, type LoRaPacket } from "./lora-serial-adapter";

describe("@campusmesh/transport LoRaSerialAdapter (Tier 3 Hardware Radio Bridge)", () => {
  let adapter: LoRaSerialAdapter;

  beforeEach(() => {
    adapter = new LoRaSerialAdapter({
      baudRate: 115200,
      frequencyBand: "868MHz",
    });
  });

  afterEach(async () => {
    await adapter.disconnect();
  });

  it("should initialize in disconnected state with configured frequency band", () => {
    expect(adapter.connectionStatus).toBe("disconnected");
    expect(adapter.frequencyBand).toBe("868MHz");

    adapter.setFrequencyBand("915MHz");
    expect(adapter.frequencyBand).toBe("915MHz");
  });

  it("should parse framed binary packets delimited by FRAME_DELIMITER", () => {
    const receivedPackets: LoRaPacket[] = [];
    adapter.onPacket((pkt) => {
      receivedPackets.push(pkt);
    });

    const msg = "PING_LORA_NODE";
    const msgBytes = new TextEncoder().encode(msg);

    // Frame: [0xaa, length, ...payload]
    const buffer = [
      LoRaSerialAdapter.FRAME_DELIMITER,
      msgBytes.length,
      ...Array.from(msgBytes),
    ];

    const remainder = adapter.processRxBuffer(buffer);
    expect(remainder).toEqual([]);
    expect(receivedPackets).toHaveLength(1);
    expect(receivedPackets[0]?.text).toBe(msg);
    expect(receivedPackets[0]?.raw).toEqual(msgBytes);
  });

  it("should support line-delimited ASCII telemetry packets", () => {
    const receivedPackets: LoRaPacket[] = [];
    adapter.onPacket((pkt) => {
      receivedPackets.push(pkt);
    });

    const line = "+RCV=1,12,HELLO_CAMPUS\n";
    const lineBytes = Array.from(new TextEncoder().encode(line));

    const remainder = adapter.processRxBuffer(lineBytes);
    expect(remainder).toEqual([]);
    expect(receivedPackets).toHaveLength(1);
    expect(receivedPackets[0]?.text).toBe("+RCV=1,12,HELLO_CAMPUS");
  });

  it("should buffer partial chunks until full payload arrives", () => {
    const receivedPackets: LoRaPacket[] = [];
    adapter.onPacket((pkt) => {
      receivedPackets.push(pkt);
    });

    // Send header stating length is 6, but only send 3 bytes
    const partial1 = [LoRaSerialAdapter.FRAME_DELIMITER, 6, 0x01, 0x02, 0x03];
    const rem1 = adapter.processRxBuffer(partial1);
    expect(receivedPackets).toHaveLength(0);
    expect(rem1).toEqual(partial1);

    // Now send the rest of the bytes
    const partial2 = [...rem1, 0x04, 0x05, 0x06];
    const rem2 = adapter.processRxBuffer(partial2);
    expect(rem2).toEqual([]);
    expect(receivedPackets).toHaveLength(1);
    expect(receivedPackets[0]?.raw).toEqual(
      new Uint8Array([0x01, 0x02, 0x03, 0x04, 0x05, 0x06]),
    );
  });

  it("should reject packets exceeding LoRa MTU limit (240 bytes)", async () => {
    const oversizedPayload = new Uint8Array(245);
    await expect(adapter.sendPacket(oversizedPayload)).rejects.toThrow(
      /exceeds maximum MTU/,
    );
  });
});
