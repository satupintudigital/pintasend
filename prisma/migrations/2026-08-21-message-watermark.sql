-- Catat status watermark (footnote iklan platform) pada riwayat pesan.
-- true = footnote iklan disisipkan ke pesan keluar; false = tanpa footnote
-- (tenant punya addon remove_watermark / pesan masuk). Lihat src/lib/watermark.ts.
ALTER TABLE "MessageLog" ADD COLUMN IF NOT EXISTS "watermark" BOOLEAN NOT NULL DEFAULT FALSE;
