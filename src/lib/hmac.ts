// HMAC-SHA256 helper (pure function, WebCrypto — aman di Workers & Node).
// Dipakai dua arah:
//   1. Verifikasi signature masuk dari OpenWA  (header `x-openwa-signature`)
//   2. Menandatangani delivery keluar ke client (header `x-pintasend-signature`)
// Format signature: `sha256=<hex>` (sama seperti OpenWA / NalaNiaga consumer).

/** Hitung HMAC-SHA256 dan kembalikan hex lowercase. */
export async function hmacSha256Hex(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Bandingkan signature (konstan-waktu) dengan header `sha256=<hex>`. */
export async function verifySignature(secret: string, rawBody: string, signature: string | null): Promise<boolean> {
  if (!signature) return false;
  const expected = `sha256=${await hmacSha256Hex(secret, rawBody)}`;
  const a = new TextEncoder().encode(expected);
  const b = new TextEncoder().encode(signature);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}
