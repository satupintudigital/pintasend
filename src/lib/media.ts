// Validasi payload media untuk POST /v1/messages.
//
// Desain (MVP, tanpa storage baru): dua mode, sama seperti DTO OpenWA:
//   1. mediaUrl   — URL publik; OpenWA yang fetch server-side (punya SSRF guard
//                   sendiri). Kita tetap menolak skema non-http(s) lebih awal.
//   2. mediaBase64 — data base64 inline + mimetype wajib.
// Tidak ada upload ke R2 — OpenWA menerima keduanya langsung, jadi tidak perlu
// storage/binding baru. Ukuran dibatasi agar aman untuk body request Worker.

// Import relatif (bukan @/) karena modul ini di-test langsung oleh vitest yang
// tidak me-resolve alias tsconfig. Next.js menangani keduanya dengan baik.
import { OPENWA_MEDIA_TYPES, type OpenwaMediaType } from "./openwa";

// Whitelist tipe media — dari openwa.ts (satu sumber kebenaran, dekat endpoint
// send-${mediaType}). Re-export agar nama lama tetap dipakai pemanggil/test.
export const MEDIA_TYPES = OPENWA_MEDIA_TYPES;

export const MEDIA_LIMITS = {
  // ~15 MB biner (base64 menambah 33%). Diatas WhatsApp/Worker yang nyaman.
  base64MaxChars: 20_000_000,
  filenameMax: 255,
  captionMax: 1024,
  urlMax: 2048,
} as const;

export interface MediaPayload {
  mediaType: OpenwaMediaType;
  url?: string;
  base64?: string;
  mimetype?: string;
  filename?: string;
  caption?: string;
}

export type MediaValidation =
  | { ok: true; media: MediaPayload }
  | { ok: false; error: string };

// Cek ringan struktur base64 (karakter + padding) tanpa mendekode penuh —
// cukup untuk menolak typo/body yang bukan base64. Padding tepat 0-2 '='.
const BASE64_RE = /^[A-Za-z0-9+/]+={0,2}$/;

/**
 * Validasi & normalisasi payload media dari body JSON /v1/messages.
 * Input: field mentah { mediaType?, mediaUrl?, mediaBase64?, mimetype?, filename?, text? }
 * (`text` dijadikan caption untuk pesan media).
 */
export function parseMediaPayload(input: Record<string, unknown>): MediaValidation {
  const mediaType = typeof input.mediaType === "string" ? input.mediaType.trim().toLowerCase() : "";
  if (!MEDIA_TYPES.includes(mediaType as OpenwaMediaType)) {
    return {
      ok: false,
      error: `mediaType harus salah satu dari: ${MEDIA_TYPES.join(", ")}`,
    };
  }

  const url = typeof input.mediaUrl === "string" ? input.mediaUrl.trim() : "";
  const base64Raw = typeof input.mediaBase64 === "string" ? input.mediaBase64 : "";
  // Normalisasi: buang whitespace (newline tiap 76 karakter adalah output umum
  // encoder base64) dan trim ujung. Tanpa ini, base64 valid akan ditolak.
  const base64 = base64Raw.replace(/\s+/g, "").trim();
  const mimetype = typeof input.mimetype === "string" ? input.mimetype.trim() : "";
  const filename = typeof input.filename === "string" ? input.filename.trim() : "";
  const caption = typeof input.text === "string" ? input.text.trim() : "";

  // Petunjuk cepat untuk pola "data:image/png;base64,..." yang umum salah kirim.
  if (/^data:/i.test(base64Raw.trim())) {
    return {
      ok: false,
      error: "Kirim mediaBase64 tanpa prefix \"data:...;base64,\" — cukup data base64-nya saja",
    };
  }

  // Tepat satu sumber media: url ATAU base64.
  if (url && base64) {
    return { ok: false, error: "Pilih salah satu sumber media: mediaUrl atau mediaBase64 (tidak keduanya)" };
  }
  if (!url && !base64) {
    return { ok: false, error: "Sediakan mediaUrl (URL publik) atau mediaBase64 (+ mimetype)" };
  }

  if (url) {
    if (!/^https?:\/\//i.test(url)) {
      return { ok: false, error: "mediaUrl harus URL http(s)" };
    }
    if (url.length > MEDIA_LIMITS.urlMax) {
      return { ok: false, error: `mediaUrl terlalu panjang (maks ${MEDIA_LIMITS.urlMax} karakter)` };
    }
  }

  if (base64) {
    if (!mimetype) {
      return { ok: false, error: "mimetype wajib diisi saat memakai mediaBase64" };
    }
    if (base64.length > MEDIA_LIMITS.base64MaxChars) {
      return {
        ok: false,
        error: `mediaBase64 terlalu besar (maks ${MEDIA_LIMITS.base64MaxChars} karakter base64, ~15 MB file)`,
      };
    }
    if (base64.length % 4 !== 0 || !BASE64_RE.test(base64)) {
      return { ok: false, error: "mediaBase64 bukan data base64 yang valid" };
    }
  }

  if (filename.length > MEDIA_LIMITS.filenameMax) {
    return { ok: false, error: `filename maksimal ${MEDIA_LIMITS.filenameMax} karakter` };
  }
  if (caption.length > MEDIA_LIMITS.captionMax) {
    return { ok: false, error: `Caption (text) untuk media maksimal ${MEDIA_LIMITS.captionMax} karakter` };
  }

  const media: MediaPayload = { mediaType: mediaType as OpenwaMediaType };
  if (url) media.url = url;
  if (base64) {
    media.base64 = base64;
    media.mimetype = mimetype;
  }
  if (filename) media.filename = filename;
  if (caption) media.caption = caption;
  return { ok: true, media };
}
