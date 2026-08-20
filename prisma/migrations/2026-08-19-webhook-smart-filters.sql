-- Smart filters webhook (pre-filter event sebelum diteruskan ke client).
-- Kolom JSON `filters` = { "conditions": [{ field, operator, value, caseSensitive? }] }.
-- Kosong (default) = semua event lolos. Lihat src/lib/webhookFilters.ts.

ALTER TABLE "Webhook"
  ADD COLUMN IF NOT EXISTS "filters" TEXT NOT NULL DEFAULT '{"conditions":[]}';
