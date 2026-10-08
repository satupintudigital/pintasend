-- Fitur perpanjangan retensi pesan atas permintaan tertulis tenant (DPA §5.7:
-- "retensi pesan & log maksimal 30 hari, KECUALI Tenant meminta penyimpanan lebih lama").
--
-- 1. Tenant.messageRetentionDays — nilai efektif retensi (hari) per tenant.
--    Default 30 = kebijakan PintaSend; >30 hanya bila ada RetentionRequest approved.
-- 2. Tabel RetentionRequest — "instruksi tertulis" dari tenant: siapa pemohon,
--    alasan, durasi, dan jejak persetujuan (approvedBy/approvedAt). Ini bukti
--    dasar hukum perpanjangan (dipakai purge worker + audit PDP).
--
-- Purge worker (workers/message-retention) membaca messageRetentionDays per
-- tenant saat menghapus MessageLog/WebhookDelivery lama.

ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "messageRetentionDays" INTEGER NOT NULL DEFAULT 30;

CREATE TABLE IF NOT EXISTS "RetentionRequest" (
  id             TEXT PRIMARY KEY,
  "tenantId"     TEXT NOT NULL REFERENCES "Tenant"(id) ON DELETE CASCADE,
  "requestedBy"  TEXT NOT NULL,          -- nama/email pemohon dari pihak tenant
  reason         TEXT NOT NULL,          -- instruksi tertulis / alasan perpanjangan
  "retentionDays" INTEGER NOT NULL,      -- durasi yang diminta (hari)
  status         TEXT NOT NULL DEFAULT 'pending', -- pending | approved | rejected
  "approvedBy"   TEXT,                   -- email admin platform yang menyetujui
  "approvedAt"   TIMESTAMPTZ,
  "rejectedBy"   TEXT,
  "rejectedAt"   TIMESTAMPTZ,
  "createdAt"    TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_retentionrequest_tenant
  ON "RetentionRequest"("tenantId", status);

CREATE INDEX IF NOT EXISTS idx_retentionrequest_status
  ON "RetentionRequest"(status);
