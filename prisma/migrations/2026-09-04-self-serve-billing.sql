-- Self-serve billing: katalog addon, order, saldo prepaid, penanda aktivasi/plan.
-- Idempotent: aman dijalankan ulang.

ALTER TABLE "Plan" ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'subscription';
ALTER TABLE "Plan" ADD COLUMN IF NOT EXISTS "isPublic" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Plan" ADD COLUMN IF NOT EXISTS "sortOrder" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "activatedAt" TIMESTAMPTZ;
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "planPeriodEnd" TIMESTAMPTZ;

ALTER TABLE "TenantAddon" ADD COLUMN IF NOT EXISTS "activeUntil" TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS "Addon" (
  id TEXT PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  tagline TEXT NOT NULL DEFAULT '',
  "priceMonthly" INTEGER,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "Order" (
  id TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  kind TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  "invoiceId" TEXT,
  "planId" TEXT,
  "addonKey" TEXT,
  amount INTEGER NOT NULL,
  "itemsJson" TEXT NOT NULL,
  "periodStart" TIMESTAMPTZ,
  "periodEnd" TIMESTAMPTZ,
  "creditMessages" INTEGER,
  gateway TEXT NOT NULL DEFAULT 'tripay',
  "gatewayRef" TEXT,
  "payCode" TEXT,
  "checkoutUrl" TEXT,
  "payMethod" TEXT,
  "expiresAt" TIMESTAMPTZ,
  "paidAt" TIMESTAMPTZ,
  "callbackRaw" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_order_tenant ON "Order"("tenantId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS idx_order_status ON "Order"(status, "expiresAt");
CREATE INDEX IF NOT EXISTS idx_order_invoice ON "Order"("invoiceId");

CREATE TABLE IF NOT EXISTS "TenantBalance" (
  "tenantId" TEXT PRIMARY KEY,
  balance INTEGER NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "CreditLedger" (
  id TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "orderId" TEXT,
  delta INTEGER NOT NULL,
  reason TEXT NOT NULL,
  "refId" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_creditledger_tenant ON "CreditLedger"("tenantId", "createdAt" DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_creditledger_ref ON "CreditLedger"("refId") WHERE "refId" IS NOT NULL;

-- Backfill: tenant hasil provisioning lama dianggap aktif (activatedAt = createdAt).
UPDATE "Tenant" SET "activatedAt" = "createdAt" WHERE "activatedAt" IS NULL;
-- Seed data: Espresso = prepaid; Addon katalog (random_delay harga landing Rp25.000).
UPDATE "Plan" SET kind = 'prepaid' WHERE name = 'Espresso';
INSERT INTO "Addon" (id, key, name, tagline, "priceMonthly", "isActive")
SELECT '10000000-0000-7000-8000-000000000001', 'random_delay', 'Random delay', 'Jeda acak 3–10 dtk antar kirim (anti-spam).', 25000, true
WHERE NOT EXISTS (SELECT 1 FROM "Addon" WHERE key = 'random_delay');
INSERT INTO "Addon" (id, key, name, tagline, "priceMonthly", "isActive")
SELECT '10000000-0000-7000-8000-000000000002', 'remove_watermark', 'Remove watermark', 'Hapus footnote iklan dari pesan keluar tenant.', NULL, true
WHERE NOT EXISTS (SELECT 1 FROM "Addon" WHERE key = 'remove_watermark');
INSERT INTO "Addon" (id, key, name, tagline, "priceMonthly", "isActive")
SELECT '10000000-0000-7000-8000-000000000003', 'campaign', 'Campaign', 'Modul blast massal WA Campaign.', NULL, true
WHERE NOT EXISTS (SELECT 1 FROM "Addon" WHERE key = 'campaign');