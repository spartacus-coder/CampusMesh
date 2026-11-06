/**
 * Base45 Encoding / Decoding (RFC 9285)
 * Optimized for QR codes and alphanumeric compact representations.
 */

const BASE45_CHARSET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:";
const BASE45_MAP: Record<string, number> = {};
for (let i = 0; i < BASE45_CHARSET.length; i++) {
  const char = BASE45_CHARSET[i];
  if (char !== undefined) {
    BASE45_MAP[char] = i;
  }
}

export function encodeBase45(bytes: Uint8Array): string {
  let result = "";
  const len = bytes.length;
  for (let i = 0; i < len; i += 2) {
    if (i + 1 < len) {
      const b0 = bytes[i];
      const b1 = bytes[i + 1];
      if (b0 !== undefined && b1 !== undefined) {
        const value = (b0 << 8) | b1;
        const c = value % 45;
        const d = Math.floor(value / 45) % 45;
        const e = Math.floor(value / (45 * 45)) % 45;
        result += BASE45_CHARSET[c]! + BASE45_CHARSET[d]! + BASE45_CHARSET[e]!;
      }
    } else {
      const b0 = bytes[i];
      if (b0 !== undefined) {
        const c = b0 % 45;
        const d = Math.floor(b0 / 45) % 45;
        result += BASE45_CHARSET[c]! + BASE45_CHARSET[d]!;
      }
    }
  }
  return result;
}

export function decodeBase45(str: string): Uint8Array {
  const output: number[] = [];
  const len = str.length;
  let i = 0;
  while (i < len) {
    if (i + 2 < len) {
      const c0 = str[i];
      const c1 = str[i + 1];
      const c2 = str[i + 2];
      if (c0 !== undefined && c1 !== undefined && c2 !== undefined) {
        const v0 = BASE45_MAP[c0];
        const v1 = BASE45_MAP[c1];
        const v2 = BASE45_MAP[c2];
        if (v0 === undefined || v1 === undefined || v2 === undefined) {
          throw new Error(
            `Invalid Base45 character in chunk: "${c0}${c1}${c2}"`,
          );
        }
        const val = v0 + v1 * 45 + v2 * 45 * 45;
        if (val > 65535) {
          throw new Error(`Base45 value overflow: ${val}`);
        }
        output.push((val >> 8) & 0xff);
        output.push(val & 0xff);
        i += 3;
      }
    } else if (i + 1 < len) {
      const c0 = str[i];
      const c1 = str[i + 1];
      if (c0 !== undefined && c1 !== undefined) {
        const v0 = BASE45_MAP[c0];
        const v1 = BASE45_MAP[c1];
        if (v0 === undefined || v1 === undefined) {
          throw new Error(`Invalid Base45 character: "${c0}${c1}"`);
        }
        const val = v0 + v1 * 45;
        if (val > 255) {
          throw new Error(`Base45 single-byte overflow: ${val}`);
        }
        output.push(val);
        i += 2;
      }
    } else {
      throw new Error("Malformed Base45 string: trailing single character");
    }
  }
  return new Uint8Array(output);
}
