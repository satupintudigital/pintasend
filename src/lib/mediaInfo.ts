// Klasifikasi tipe pesan untuk badge media di UI riwayat pesan (pure, di-test).
// Sumber type: kolom MessageLog.type (text | image | video | audio | voice |
// document | sticker | location | contact | …). Sumber mimetype: kolom
// MessageLog.mimetype (petunjuk saat type asing/umum).

export type MediaKind = "image" | "video" | "audio" | "document" | "sticker" | "other";

const KIND_BY_TYPE: Record<string, MediaKind> = {
  image: "image",
  video: "video",
  audio: "audio",
  voice: "audio",
  document: "document",
  sticker: "sticker",
};

export const MEDIA_KIND_LABEL: Record<MediaKind, string> = {
  image: "Gambar",
  video: "Video",
  audio: "Audio",
  document: "Dokumen",
  sticker: "Stiker",
  other: "Media",
};

/**
 * Klasifikasi apakah sebuah baris pesan adalah media + jenis badgenya.
 * `type === "text"` atau kosong → "other" TAPI caller memutuskan: kembalikan
 * null bila jelas bukan media (text). Dipakai panel:
 *   - `type` media dikenal → kind langsung
 *   - type asing (location, contact, dll.) → cek mimetype sebagai petunjuk
 */
export function classifyMedia(
  type: string | null | undefined,
  mimetype?: string | null,
): { kind: MediaKind; isMedia: boolean } {
  const t = (type ?? "").trim().toLowerCase();
  if (t === "text" || !t) return { kind: "other", isMedia: false };
  const byType = KIND_BY_TYPE[t];
  if (byType) return { kind: byType, isMedia: true };

  // Type asing / tidak dikenal — mimetype jadi petunjuk.
  const m = (mimetype ?? "").trim().toLowerCase();
  if (m.startsWith("image/")) return { kind: "image", isMedia: true };
  if (m.startsWith("video/")) return { kind: "video", isMedia: true };
  if (m.startsWith("audio/")) return { kind: "audio", isMedia: true };
  if (m === "application/pdf" || m.includes("document") || m.startsWith("application/")) {
    return { kind: "document", isMedia: true };
  }
  return { kind: "other", isMedia: true };
}
