// Akses bucket R2 (binding PINTSEND_MEDIA) dari kode server Next.js di atas
// OpenNext Cloudflare Worker. Memakai getCloudflareContext — cara resmi membaca
// binding di runtime Worker (env). Hanya berfungsi saat berjalan di Worker;
// di luar runtime Cloudflare (mis. unit test / build) tidak dipanggil.

import { getCloudflareContext } from "@opennextjs/cloudflare";

// Struktur minimal R2Bucket — cukup untuk put() yang kita pakai, tanpa
// bergantung pada @cloudflare/workers-types (belum terpasang).
interface R2BucketLike {
  put(
    key: string,
    value: Uint8Array | ArrayBuffer | string,
    options?: { httpMetadata?: { contentType?: string } },
  ): Promise<unknown>;
}

/** Simpan objek media ke bucket PINTSEND_MEDIA; melempar bila binding tidak ada. */
export async function putMediaObject(
  key: string,
  data: Uint8Array,
  contentType: string,
): Promise<void> {
  const { env } = await getCloudflareContext({ async: true });
  const bucket = (env as unknown as { PINTSEND_MEDIA?: R2BucketLike }).PINTSEND_MEDIA;
  if (!bucket) {
    throw new Error("Binding R2 PINTSEND_MEDIA tidak tersedia");
  }
  await bucket.put(key, data, {
    httpMetadata: { contentType: contentType || "application/octet-stream" },
  });
}
