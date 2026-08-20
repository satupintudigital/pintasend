-- Outbox pattern untuk delivery webhook ke client (retry + dead-letter).
-- Pola sama dengan outbox akuntansi NalaNiaga (docs/INTEGRASI.md §3).
-- Lihat src/lib/webhookDelivery.ts.

CREATE TABLE IF NOT EXISTS "WebhookDelivery" (
  id             TEXT PRIMARY KEY,
  "tenantId"     TEXT NOT NULL REFERENCES "Tenant"(id) ON DELETE CASCADE,
  "webhookId"    TEXT NOT NULL REFERENCES "Webhook"(id) ON DELETE CASCADE,
  event          TEXT NOT NULL,
  url            TEXT NOT NULL,
  payload        TEXT NOT NULL,
  signature      TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'pending', -- pending | delivered | failed
  attempts       INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMPTZ,
  "lastError"    TEXT,
  "lastAttemptAt" TIMESTAMPTZ,
  "createdAt"    TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_webhookdelivery_status_next
  ON "WebhookDelivery"(status, "nextAttemptAt");

CREATE INDEX IF NOT EXISTS idx_webhookdelivery_tenant_status
  ON "WebhookDelivery"("tenantId", status);
