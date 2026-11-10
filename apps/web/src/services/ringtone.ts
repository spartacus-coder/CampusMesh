/**
 * Background-resilient Web Call Ringtone & Ringback Controller.
 *
 * Uses looping in-memory WAV Blob <audio> elements instead of setInterval + AudioContext
 * timers so Chrome/Edge/WebView2 keep ringing smoothly even when the browser tab is
 * minimized or running in the background (matching WhatsApp Web behavior).
 */

let incomingAudio: HTMLAudioElement | null = null;
let outgoingAudio: HTMLAudioElement | null = null;
let incomingUrl: string | null = null;
let outgoingUrl: string | null = null;
let audioUnlocked = false;
let unlockListenersAttached = false;
let isIncomingRinging = false;
let isOutgoingRinging = false;

let titleFlashInterval: ReturnType<typeof setInterval> | null = null;
let originalDocumentTitle: string | null = null;

interface ToneSegment {
  startSec: number;
  durationSec: number;
  freqA: number;
  freqB: number;
  amplitude: number;
}

/** Synthesizes a 16-bit mono PCM WAV Blob from dual-frequency tone segments. */
function buildWavBlobUrl(
  totalDurationSec: number,
  segments: ToneSegment[],
  sampleRate = 22050,
): string | null {
  if (
    typeof Blob === "undefined" ||
    typeof URL === "undefined" ||
    typeof URL.createObjectURL !== "function"
  ) {
    return null;
  }

  const numSamples = Math.floor(totalDurationSec * sampleRate);
  const buffer = new ArrayBuffer(44 + numSamples * 2);
  const view = new DataView(buffer);

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeString(0, "RIFF");
  view.setUint32(4, 36 + numSamples * 2, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, 1, true); // Mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, "data");
  view.setUint32(40, numSamples * 2, true);

  const fadeSamples = Math.floor(0.015 * sampleRate);

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    let sample = 0;

    for (const seg of segments) {
      if (t >= seg.startSec && t < seg.startSec + seg.durationSec) {
        const localIdx = i - Math.floor(seg.startSec * sampleRate);
        const segTotalSamples = Math.floor(seg.durationSec * sampleRate);
        let env = 1;
        if (localIdx < fadeSamples) {
          env = localIdx / fadeSamples;
        } else if (segTotalSamples - localIdx < fadeSamples) {
          env = Math.max(0, (segTotalSamples - localIdx) / fadeSamples);
        }
        const wave =
          0.5 * Math.sin(2 * Math.PI * seg.freqA * t) +
          0.5 * Math.sin(2 * Math.PI * seg.freqB * t);
        sample += wave * seg.amplitude * env;
      }
    }

    const clamped = Math.max(-1, Math.min(1, sample));
    view.setInt16(44 + i * 2, Math.floor(clamped * 32767), true);
  }

  const blob = new Blob([buffer], { type: "audio/wav" });
  return URL.createObjectURL(blob);
}

function ensureAudioElements(): void {
  if (typeof Audio === "undefined") return;

  if (!incomingAudio) {
    incomingUrl = buildWavBlobUrl(2.8, [
      {
        startSec: 0.0,
        durationSec: 0.42,
        freqA: 523.25, // C5
        freqB: 659.25, // E5
        amplitude: 0.32,
      },
      {
        startSec: 0.56,
        durationSec: 0.42,
        freqA: 587.33, // D5
        freqB: 783.99, // G5
        amplitude: 0.34,
      },
    ]);
    if (incomingUrl) {
      incomingAudio = new Audio(incomingUrl);
      incomingAudio.loop = true;
      incomingAudio.preload = "auto";
      incomingAudio.volume = 0.85;
    }
  }

  if (!outgoingAudio) {
    outgoingUrl = buildWavBlobUrl(3.2, [
      {
        startSec: 0.0,
        durationSec: 0.75,
        freqA: 440,
        freqB: 480,
        amplitude: 0.14,
      },
    ]);
    if (outgoingUrl) {
      outgoingAudio = new Audio(outgoingUrl);
      outgoingAudio.loop = true;
      outgoingAudio.preload = "auto";
      outgoingAudio.volume = 0.5;
    }
  }
}

/**
 * Unlocks browser audio playback on the user's first interaction so later
 * incoming calls can ring continuously even while the browser tab is minimized.
 */
export function initCallAudioUnlock(): void {
  if (typeof window === "undefined" || unlockListenersAttached) return;
  unlockListenersAttached = true;

  const detachUnlockListeners = () => {
    window.removeEventListener("pointerdown", unlock);
    window.removeEventListener("keydown", unlock);
  };

  const unlock = () => {
    if (audioUnlocked) {
      detachUnlockListeners();
      return;
    }
    ensureAudioElements();
    const entries: Array<{ el: HTMLAudioElement; isActive: () => boolean }> =
      [];
    if (incomingAudio) {
      entries.push({ el: incomingAudio, isActive: () => isIncomingRinging });
    }
    if (outgoingAudio) {
      entries.push({ el: outgoingAudio, isActive: () => isOutgoingRinging });
    }
    if (entries.length === 0) {
      audioUnlocked = true;
      detachUnlockListeners();
      return;
    }
    for (const { el, isActive } of entries) {
      if (isActive() || !el.paused) {
        audioUnlocked = true;
        detachUnlockListeners();
        continue;
      }
      const prevMuted = el.muted;
      el.muted = true;
      const playPromise = el.play();
      if (playPromise && typeof playPromise.then === "function") {
        playPromise
          .then(() => {
            if (!isActive()) {
              el.pause();
              el.currentTime = 0;
              el.muted = prevMuted;
            }
            audioUnlocked = true;
            detachUnlockListeners();
          })
          .catch(() => {
            if (!isActive()) {
              el.muted = prevMuted;
            }
          });
      } else {
        audioUnlocked = true;
        detachUnlockListeners();
      }
    }
  };

  window.addEventListener("pointerdown", unlock, { passive: true });
  window.addEventListener("keydown", unlock, { passive: true });
}

export function startIncomingRingtone(): void {
  stopOutgoingRingtone();
  isIncomingRinging = true;
  ensureAudioElements();
  if (!incomingAudio) return;
  try {
    incomingAudio.muted = false;
    incomingAudio.currentTime = 0;
    incomingAudio.play().catch((err) => {
      console.warn("[CampusMesh Ringtone] Blocked by autoplay policy:", err);
    });
  } catch {
    // Ignore playback restrictions
  }
}

export function stopIncomingRingtone(): void {
  isIncomingRinging = false;
  if (!incomingAudio) return;
  try {
    incomingAudio.pause();
    incomingAudio.currentTime = 0;
  } catch {
    // Ignore
  }
}

export function startOutgoingRingtone(): void {
  stopIncomingRingtone();
  isOutgoingRinging = true;
  ensureAudioElements();
  if (!outgoingAudio) return;
  try {
    outgoingAudio.muted = false;
    outgoingAudio.currentTime = 0;
    outgoingAudio.play().catch(() => {});
  } catch {
    // Ignore
  }
}

export function stopOutgoingRingtone(): void {
  isOutgoingRinging = false;
  if (!outgoingAudio) return;
  try {
    outgoingAudio.pause();
    outgoingAudio.currentTime = 0;
  } catch {
    // Ignore
  }
}

export function stopAllRingtones(): void {
  stopIncomingRingtone();
  stopOutgoingRingtone();
  stopTitleFlash();
}

export function startTitleFlash(alertLabel: string): void {
  if (typeof document === "undefined") return;
  stopTitleFlash();
  originalDocumentTitle = document.title || "CampusMesh";
  let showAlert = true;
  document.title = alertLabel;
  titleFlashInterval = setInterval(() => {
    showAlert = !showAlert;
    document.title = showAlert
      ? alertLabel
      : originalDocumentTitle || "CampusMesh";
  }, 1000);
}

export function stopTitleFlash(): void {
  if (titleFlashInterval) {
    clearInterval(titleFlashInterval);
    titleFlashInterval = null;
  }
  if (typeof document !== "undefined" && originalDocumentTitle !== null) {
    document.title = originalDocumentTitle;
    originalDocumentTitle = null;
  }
}
