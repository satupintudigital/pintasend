/**
 * UUID v7 generator — time-ordered, no external dependencies.
 *
 * Format: tttttttt-tttt-7ttt-8ttt-tttttttttttt
 *   - First 48 bits: Unix timestamp in milliseconds (big-endian)
 *   - Next 4 bits: UUID version (7)
 *   - Next 12 bits: Variant (10xx) + random
 *   - Remaining 62 bits: Cryptographically random
 *
 * UUID v7 is lexicographically sortable by creation time, making it ideal
 * for database primary keys (better B-tree locality than UUID v4).
 *
 * Dipakai di runtime raw-SQL (bukan Prisma) karena default `@default(uuid(7))`
 * di schema.prisma tidak diterapkan oleh driver Neon serverless — id harus
 * dibangkitkan di lapisan aplikasi.
 */

let _getRandomValues: (buf: Uint8Array) => void;

// Use Web Crypto API when available, fallback to Math.random
if (typeof crypto !== "undefined" && crypto.getRandomValues) {
  _getRandomValues = (buf) => crypto.getRandomValues(buf);
} else {
  _getRandomValues = (buf) => {
    for (let i = 0; i < buf.length; i++) {
      buf[i] = Math.floor(Math.random() * 256);
    }
  };
}

export function uuidv7(): string {
  const bytes = new Uint8Array(16);
  _getRandomValues(bytes);

  // Timestamp: 48 bits of Unix epoch milliseconds (big-endian)
  // NOTE: Do NOT use >>> or & 0xff directly — JS bitwise ops work on 32-bit
  // signed integers and will truncate timestamps larger than 2^32 (~2106).
  const ms = Date.now();
  bytes[0] = Math.floor(ms / 2 ** 40) % 256;
  bytes[1] = Math.floor(ms / 2 ** 32) % 256;
  bytes[2] = Math.floor(ms / 2 ** 24) % 256;
  bytes[3] = Math.floor(ms / 2 ** 16) % 256;
  bytes[4] = Math.floor(ms / 2 ** 8) % 256;
  bytes[5] = ms % 256;

  // Version: 7 (4 bits at position 6)
  bytes[6] = (bytes[6] & 0x0f) | 0x70;

  // Variant: 10xx (2 bits at position 8)
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  // Format as hex string
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0"));
  return [
    hex[0], hex[1], hex[2], hex[3], "-",
    hex[4], hex[5], "-",
    hex[6], hex[7], "-",
    hex[8], hex[9], "-",
    hex[10], hex[11], hex[12], hex[13], hex[14], hex[15],
  ].join("");
}

/** Extract timestamp from a UUID v7 string (returns Date). Returns epoch 0 for non-v7 UUIDs. */
export function uuidv7Timestamp(uuid: string): Date {
  const parts = uuid.split("-");
  if (parts.length !== 5) return new Date(0);
  // Validate version bits: byte 6 (position 14 in string, = 3rd group char 0) must be '7'
  if (parts[2].length < 1 || parts[2][0] !== "7") return new Date(0);
  const hex = parts[0] + parts[1].slice(0, 4);
  if (hex.length !== 12) return new Date(0);
  const ms = parseInt(hex, 16);
  if (isNaN(ms)) return new Date(0);
  return new Date(ms);
}
