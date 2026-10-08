// Idempotency-Key untuk POST /v1/messages — cegah pesan duplikat saat client
// retry (mis. timeout setelah kirim sukses, lalu request diulang).
//
// Desain:
//   - KV (binding PINTSEND_CACHE) — sama seperti deviceCache; TTL 24 jam (Stripe
//     memakai window yang sama). Key: `idem:{tenantId}:{key}`.
//   - Hanya respons SUKSES yang direkam. Kegagalan (502/5xx) TIDAK direkam
//     sehingga client yang retry dengan key yang sama akan mencoba kirim ulang
//     (perilaku yang benar: idempotensi melindungi dari duplikat, bukan dari
//     kegagalan yang belum pernah sukses).
//   - bodyHash (SHA-256 raw body) disimpan agar key yang sama dengan payload
//     BERBEDA ditolak (400) — kontrak idempotensi yang ketat, pola Stripe.
//
// Tradeoff yang disengaja (sama seperti rate-limit): KV eventual-consistent &
// read-modify-write non-atomik — dua request konkuren dengan key yang sama
// bisa lolos dua-duanya (duplikat). Untuk anti-duplikat retry (kasus nyata:
// request berurutan setelah timeout) ini diterima. Upgrade ke unique
// constraint Neon bila diperlukan di masa depan.

import { getBinding } from "@/lib/cf";

// Window idempotensi: 24 jam (detik). KV expirationTtl minimum 60 dtk.
export const IDEMPOTENCY_TTL_S = 24 * 60 * 60;

// Format key: 8–128 karakter [A-Za-z0-9._-] (pola Stripe).
const IDEMPOTENCY_KEY_RE = /^[A-Za-z0-9._-]{8,128}$/;

export interface IdempotencyRecord {
  /** SHA-256 hex dari raw body request asli — deteksi pemakaian ulang key dgn payload beda. */
  bodyHash: string;
  /** Respons sukses asli — di-replay apa adanya saat key yang sama datang lagi. */
  response: Record<string, unknown>;
}

interface KvLike {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, opts?: { expirationTtl?: number }): Promise<void>;
}

function cacheKey(tenantId: string, idemKey: string): string {
  return `idem:${tenantId}:${idemKey}`;
}

/** Validasi format Idempotency-Key (8–128 karakter, charset aman). */
export function isValidIdempotencyKey(value: string): boolean {
  return IDEMPOTENCY_KEY_RE.test(value);
}

/** SHA-256 hex dari raw body — input byte persis seperti diterima. */
export async function hashBody(bytes: Uint8Array): Promise<string> {
  // Salin ke ArrayBuffer baru: crypto.subtle.digest butuh BufferSource bertipe
  // ArrayBuffer (Uint8Array<ArrayBufferLike> — mis. dari req.arrayBuffer() —
  // tidak memenuhi kontrak TS).
  const buf = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buf).set(bytes);
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Baca record idempotensi (null bila belum ada / korup / expired). */
export async function getIdempotencyRecord(
  tenantId: string,
  idemKey: string,
): Promise<IdempotencyRecord | null> {
  const kv = await getBinding<KvLike>("PINTSEND_CACHE");
  const raw = await kv.get(cacheKey(tenantId, idemKey));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<IdempotencyRecord>;
    if (typeof parsed.bodyHash !== "string" || typeof parsed.response !== "object" || parsed.response === null) {
      return null;
    }
    return { bodyHash: parsed.bodyHash, response: parsed.response };
  } catch {
    return null;
  }
}

/** Simpan record idempotensi dengan TTL 24 jam. */
export async function setIdempotencyRecord(
  tenantId: string,
  idemKey: string,
  record: IdempotencyRecord,
): Promise<void> {
  const kv = await getBinding<KvLike>("PINTSEND_CACHE");
  await kv.put(cacheKey(tenantId, idemKey), JSON.stringify(record), {
    expirationTtl: IDEMPOTENCY_TTL_S,
  });
}
