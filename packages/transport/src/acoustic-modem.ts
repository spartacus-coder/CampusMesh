/**
 * Near-Ultrasound Acoustic Modem (Data-over-Sound)
 *
 * Encodes and decodes arbitrary binary/hex payloads over near-ultrasound frequencies
 * (18.2 kHz - 19.9 kHz) using Web Audio API M-FSK (Multi-Frequency Shift Keying).
 *
 * Characteristics:
 * - 100% Inaudible to adult human ears (18,200 Hz - 19,900 Hz).
 * - Zero network required: Air-gapped physical layer transmission using standard device speakers & mic.
 * - Zero camera required: Alternative to QR codes in low-light or screenless scenarios.
 * - Works inside standard web browsers (PWA) and native WebViews with no external native drivers.
 */

export interface AcousticModemConfig {
  sampleRate?: number;
  preambleFreq?: number; // default 18,200 Hz
  baseDataFreq?: number; // default 18,400 Hz
  channelSpacing?: number; // default 100 Hz per nibble
  symbolDurationMs?: number; // default 60 ms
  preambleDurationMs?: number; // default 100 ms
}

export interface AcousticDecodeResult {
  raw: Uint8Array;
  text: string;
  crcValid: boolean;
}

export class AcousticModem {
  private config: Required<AcousticModemConfig>;
  private audioCtx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private micStream: MediaStream | null = null;
  private listenInterval: number | null = null;
  private isListeningActive = false;
  private isTransmittingActive = false;
  private activeOscillator: OscillatorNode | null = null;

  // Framing constants
  public static readonly START_BYTE = 0xaa;
  public static readonly END_BYTE = 0x55;
  public static readonly PREAMBLE_TONE = 18200;
  public static readonly BASE_DATA_TONE = 18400;
  public static readonly CHANNEL_SPACING = 100;
  public static readonly CHANNELS_COUNT = 16; // 4-bit nibbles (0x0 to 0xF)

  constructor(config?: AcousticModemConfig) {
    this.config = {
      sampleRate: config?.sampleRate ?? 48000,
      preambleFreq: config?.preambleFreq ?? AcousticModem.PREAMBLE_TONE,
      baseDataFreq: config?.baseDataFreq ?? AcousticModem.BASE_DATA_TONE,
      channelSpacing: config?.channelSpacing ?? AcousticModem.CHANNEL_SPACING,
      symbolDurationMs: config?.symbolDurationMs ?? 60,
      preambleDurationMs: config?.preambleDurationMs ?? 100,
    };
  }

  public get isListening(): boolean {
    return this.isListeningActive;
  }

  public get isTransmitting(): boolean {
    return this.isTransmittingActive;
  }

  /**
   * Calculate CRC-8 (standard polynomial 0x07)
   */
  public static calculateCrc8(data: Uint8Array): number {
    let crc = 0x00;
    for (let i = 0; i < data.length; i++) {
      crc ^= data[i]!;
      for (let j = 0; j < 8; j++) {
        if ((crc & 0x80) !== 0) {
          crc = ((crc << 1) ^ 0x07) & 0xff;
        } else {
          crc = (crc << 1) & 0xff;
        }
      }
    }
    return crc & 0xff;
  }

  /**
   * Modulate raw bytes into an array of frequencies to transmit.
   */
  public frameToFrequencies(payload: Uint8Array): number[] {
    const frequencies: number[] = [];
    const crc = AcousticModem.calculateCrc8(payload);

    // Frame layout: [START_BYTE, LENGTH, ...PAYLOAD, CRC, END_BYTE]
    const fullFrame = new Uint8Array(payload.length + 4);
    fullFrame[0] = AcousticModem.START_BYTE;
    fullFrame[1] = payload.length & 0xff;
    fullFrame.set(payload, 2);
    fullFrame[payload.length + 2] = crc;
    fullFrame[payload.length + 3] = AcousticModem.END_BYTE;

    // Convert each byte into two 4-bit nibbles (High nibble, then Low nibble)
    for (let i = 0; i < fullFrame.length; i++) {
      const byte = fullFrame[i]!;
      const highNibble = (byte >> 4) & 0x0f;
      const lowNibble = byte & 0x0f;

      frequencies.push(this.nibbleToFrequency(highNibble));
      frequencies.push(this.nibbleToFrequency(lowNibble));
    }

    return frequencies;
  }

  /**
   * Demodulate array of frequencies back to raw bytes, verifying CRC.
   */
  public frequenciesToFrame(
    frequencies: number[],
  ): AcousticDecodeResult | null {
    if (frequencies.length < 8) return null; // Minimum 4 bytes = 8 nibbles

    const nibbles: number[] = [];
    for (const freq of frequencies) {
      const nibble = this.frequencyToNibble(freq);
      if (nibble === null) return null;
      nibbles.push(nibble);
    }

    if (nibbles.length % 2 !== 0) return null;

    const bytes = new Uint8Array(nibbles.length / 2);
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = ((nibbles[i * 2]! & 0x0f) << 4) | (nibbles[i * 2 + 1]! & 0x0f);
    }

    // Locate start byte
    const startIndex = bytes.indexOf(AcousticModem.START_BYTE);
    if (startIndex === -1 || startIndex + 3 >= bytes.length) return null;

    const len = bytes[startIndex + 1]!;
    const payloadEnd = startIndex + 2 + len;
    const crcIndex = payloadEnd;
    const endIndex = payloadEnd + 1;

    if (endIndex >= bytes.length) return null;
    if (bytes[endIndex] !== AcousticModem.END_BYTE) return null;

    const payload = bytes.slice(startIndex + 2, payloadEnd);
    const expectedCrc = bytes[crcIndex]!;
    const actualCrc = AcousticModem.calculateCrc8(payload);
    const crcValid = actualCrc === expectedCrc;

    let text = "";
    try {
      text = new TextDecoder().decode(payload);
    } catch {
      text = "";
    }

    return {
      raw: payload,
      text,
      crcValid,
    };
  }

  public nibbleToFrequency(nibble: number): number {
    return (
      this.config.baseDataFreq + (nibble & 0x0f) * this.config.channelSpacing
    );
  }

  public frequencyToNibble(freq: number): number | null {
    const diff = freq - this.config.baseDataFreq;
    const index = Math.round(diff / this.config.channelSpacing);
    if (index >= 0 && index < AcousticModem.CHANNELS_COUNT) {
      const center =
        this.config.baseDataFreq + index * this.config.channelSpacing;
      // Accept within 40 Hz of bin center
      if (Math.abs(freq - center) <= 45) {
        return index;
      }
    }
    return null;
  }

  /**
   * Transmit payload via speaker using Web Audio API.
   */
  public async transmit(
    data: Uint8Array | string,
    onProgress?: (percent: number) => void,
  ): Promise<void> {
    const payload =
      typeof data === "string" ? new TextEncoder().encode(data) : data;

    const frequencies = this.frameToFrequencies(payload);
    const totalSymbols = frequencies.length + 1; // 1 preamble + data symbols

    if (
      typeof window === "undefined" ||
      (!window.AudioContext &&
        !(window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext)
    ) {
      // In headless or test environment, simulate transmission
      this.isTransmittingActive = true;
      if (onProgress) onProgress(100);
      this.isTransmittingActive = false;
      return;
    }

    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;

    if (!this.audioCtx || this.audioCtx.state === "closed") {
      this.audioCtx = new AudioContextClass();
    }
    if (this.audioCtx.state === "suspended") {
      await this.audioCtx.resume();
    }

    this.isTransmittingActive = true;

    try {
      const ctx = this.audioCtx;
      let startTime = ctx.currentTime + 0.05; // 50ms lead time

      // 1. Play Preamble tone (18,200 Hz)
      const preambleDur = this.config.preambleDurationMs / 1000;
      this.scheduleTone(ctx, this.config.preambleFreq, startTime, preambleDur);
      startTime += preambleDur + 0.02; // 20ms guard band

      // 2. Play data symbols
      const symbolDur = this.config.symbolDurationMs / 1000;
      for (let i = 0; i < frequencies.length; i++) {
        if (!this.isTransmittingActive) break;
        const freq = frequencies[i]!;
        this.scheduleTone(ctx, freq, startTime, symbolDur);
        startTime += symbolDur;

        if (onProgress) {
          const pct = Math.round(((i + 1) / totalSymbols) * 100);
          onProgress(pct);
        }
      }

      // Wait until audio schedule completes
      const totalWaitMs = Math.max(0, (startTime - ctx.currentTime) * 1000);
      await new Promise((resolve) => setTimeout(resolve, totalWaitMs));
    } finally {
      this.isTransmittingActive = false;
    }
  }

  private scheduleTone(
    ctx: AudioContext,
    freq: number,
    startTime: number,
    duration: number,
  ): void {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, startTime);

    // Apply smooth cosine-like envelope to prevent audible clicks
    const attack = Math.min(0.005, duration * 0.1);
    const release = Math.min(0.005, duration * 0.1);

    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(0.7, startTime + attack);
    gain.gain.setValueAtTime(0.7, startTime + duration - release);
    gain.gain.linearRampToValueAtTime(0, startTime + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(startTime);
    osc.stop(startTime + duration);
  }

  /**
   * Start listening for acoustic transmissions via microphone.
   */
  public async startListening(
    onPacket: (result: AcousticDecodeResult) => void,
    onSignalDb?: (db: number) => void,
  ): Promise<void> {
    if (this.isListeningActive) return;

    if (
      typeof window === "undefined" ||
      !navigator.mediaDevices ||
      !navigator.mediaDevices.getUserMedia
    ) {
      this.isListeningActive = true;
      return;
    }

    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;

    if (!this.audioCtx || this.audioCtx.state === "closed") {
      this.audioCtx = new AudioContextClass();
    }
    if (this.audioCtx.state === "suspended") {
      await this.audioCtx.resume();
    }

    try {
      this.micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });

      const source = this.audioCtx.createMediaStreamSource(this.micStream);
      this.analyser = this.audioCtx.createAnalyser();
      this.analyser.fftSize = 2048;
      this.analyser.smoothingTimeConstant = 0.2;
      source.connect(this.analyser);

      this.isListeningActive = true;

      const bufferLength = this.analyser.frequencyBinCount;
      const dataArray = new Float32Array(bufferLength);
      const binWidth = this.audioCtx.sampleRate / this.analyser.fftSize;

      const detectedFrequencies: number[] = [];
      let lastSymbolTime = 0;
      let isCapturingFrame = false;

      const poll = () => {
        if (!this.isListeningActive || !this.analyser) return;

        this.analyser.getFloatFrequencyData(dataArray);

        // Find peak frequency in the near-ultrasound band (18 kHz - 20 kHz)
        const minBin = Math.floor(18000 / binWidth);
        const maxBin = Math.min(bufferLength - 1, Math.ceil(20100 / binWidth));

        let maxDb = -150;
        let peakBin = -1;

        for (let b = minBin; b <= maxBin; b++) {
          const db = dataArray[b]!;
          if (db > maxDb) {
            maxDb = db;
            peakBin = b;
          }
        }

        if (onSignalDb && maxDb > -120) {
          onSignalDb(Math.max(-100, Math.min(0, maxDb)));
        }

        // Threshold for valid signal (-75 dB)
        if (maxDb > -75 && peakBin >= 0) {
          const peakFreq = peakBin * binWidth;
          const now = Date.now();

          // Check if preamble tone
          if (Math.abs(peakFreq - this.config.preambleFreq) < 60) {
            if (!isCapturingFrame) {
              isCapturingFrame = true;
              detectedFrequencies.length = 0;
              lastSymbolTime = now;
            }
          } else if (isCapturingFrame) {
            // Check if matches one of the 16 channels
            const nibble = this.frequencyToNibble(peakFreq);
            if (
              nibble !== null &&
              now - lastSymbolTime >= this.config.symbolDurationMs * 0.7
            ) {
              detectedFrequencies.push(peakFreq);
              lastSymbolTime = now;

              // Attempt decode periodically
              if (detectedFrequencies.length >= 8) {
                const result = this.frequenciesToFrame(detectedFrequencies);
                if (result && result.crcValid) {
                  onPacket(result);
                  // Reset state after valid packet
                  isCapturingFrame = false;
                  detectedFrequencies.length = 0;
                }
              }
            }
          }
        } else {
          // Timeout frame capture after 4 seconds of silence
          if (isCapturingFrame && Date.now() - lastSymbolTime > 4000) {
            isCapturingFrame = false;
            detectedFrequencies.length = 0;
          }
        }

        this.listenInterval = window.setTimeout(poll, 25);
      };

      poll();
    } catch (err) {
      this.isListeningActive = false;
      throw err;
    }
  }

  public stopListening(): void {
    this.isListeningActive = false;
    if (this.listenInterval !== null) {
      clearTimeout(this.listenInterval);
      this.listenInterval = null;
    }
    if (this.micStream) {
      this.micStream.getTracks().forEach((t) => t.stop());
      this.micStream = null;
    }
    this.analyser = null;
  }

  public stopTransmitting(): void {
    this.isTransmittingActive = false;
    if (this.activeOscillator) {
      try {
        this.activeOscillator.stop();
      } catch {
        // Ignored
      }
      this.activeOscillator = null;
    }
  }
}
