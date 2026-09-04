-- Invoice registri tagihan bulanan (simulasi — belum integrasi payment gateway)
-- + harga bulanan per plan. Idempotent.
ALTER TABLE "Plan" ADD COLUMN IF NOT EXISTS "priceMonthly" INTEGER;

CREATE TABLE IF NOT EXISTS "Invoice" (
  "id"          TEXT PRIMARY KEY,
  "tenantId"    TEXT NOT NULL,
  "planId"      TEXT,
  "planName"    TEXT NOT NULL,
  "priceMonthly" INTEGER,
  "periodStart" TIMESTAMPTZ NOT NULL,
  "periodEnd"   TIMESTAMPTZ NOT NULL,
  "status"      TEXT NOT NULL DEFAULT 'issued',
  "paidAt"      TIMESTAMPTZ,
  "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "Invoice_tenantId_periodStart_key"
  ON "Invoice" ("tenantId", "periodStart");
CREATE INDEX IF NOT EXISTS "Invoice_status_periodStart_idx"
  ON "Invoice" ("status", "periodStart");
