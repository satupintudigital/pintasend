-- Fitur random delay kirim pesan (anti-spam) + analitik delay.
-- Lihat docs/superpowers/specs/2026-08-18-message-delay-design.md

-- Plan yang menyertakan fitur delay GRATIS (seed: Mocha = TRUE).
ALTER TABLE "Plan" ADD COLUMN IF NOT EXISTS "includesDelay" BOOLEAN NOT NULL DEFAULT FALSE;

-- Config per tenant (diatur platform admin).
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "delayEnabled" BOOLEAN NOT NULL DEFAULT FALSE;

-- Addon per tenant (extensible: cukup key baru, tanpa migrasi).
CREATE TABLE IF NOT EXISTS "TenantAddon" (
  id          TEXT PRIMARY KEY,
  "tenantId"  TEXT NOT NULL REFERENCES "Tenant"(id) ON DELETE CASCADE,
  key         TEXT NOT NULL,
  active      BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "TenantAddon_tenantId_key_key" UNIQUE ("tenantId", key)
);
CREATE INDEX IF NOT EXISTS idx_tenantaddon_tenant ON "TenantAddon"("tenantId");

-- Waktu trigger & waktu kirim pesan keluar (delay aktual = sentAt - triggeredAt).
-- NULL untuk pesan masuk.
ALTER TABLE "MessageLog" ADD COLUMN IF NOT EXISTS "triggeredAt" TIMESTAMPTZ;
ALTER TABLE "MessageLog" ADD COLUMN IF NOT EXISTS "sentAt" TIMESTAMPTZ;
