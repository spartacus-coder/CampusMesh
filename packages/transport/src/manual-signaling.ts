import { encodeBase45, decodeBase45 } from "./base45";

export interface ManualSignalPayload {
  version: 1;
  type: "offer" | "answer";
  senderFingerprint: string;
  sdp: string;
  candidates?: RTCIceCandidateInit[];
}

export function exportManualSignal(payload: ManualSignalPayload): string {
  const json = JSON.stringify(payload);
  const bytes = new TextEncoder().encode(json);
  return "CM45:" + encodeBase45(bytes);
}

export function importManualSignal(encoded: string): ManualSignalPayload {
  const clean = encoded.trim();
  if (!clean.startsWith("CM45:")) {
    // Attempt fallback to plain JSON
    try {
      const parsed = JSON.parse(clean);
      if (parsed.version === 1 && parsed.type && parsed.sdp) {
        return parsed as ManualSignalPayload;
      }
    } catch {
      throw new Error("Invalid manual signaling string: missing CM45: prefix");
    }
  }

  const base45Str = clean.substring(5);
  const bytes = decodeBase45(base45Str);
  const json = new TextDecoder().decode(bytes);
  const parsed = JSON.parse(json);

  if (
    parsed.version !== 1 ||
    !parsed.type ||
    !parsed.sdp ||
    !parsed.senderFingerprint
  ) {
    throw new Error("Corrupted or invalid manual signal payload");
  }

  return parsed as ManualSignalPayload;
}
