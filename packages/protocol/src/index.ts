export * from "./envelope";

import type { WireEnvelope } from "@campusmesh/shared-types";

export function serializeEnvelope(envelope: WireEnvelope): string {
  return JSON.stringify(envelope);
}

export function deserializeEnvelope(raw: string): WireEnvelope {
  const parsed = JSON.parse(raw);
  if (
    !parsed.id ||
    !parsed.type ||
    !parsed.senderFingerprint ||
    !parsed.signature
  ) {
    throw new Error("Invalid wire envelope schema: missing required fields");
  }
  return parsed as WireEnvelope;
}
