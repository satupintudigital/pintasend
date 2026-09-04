-- Backfill dev DB: tabel yang lewat dari migrasi inkremental sebelumnya.
CREATE TABLE IF NOT EXISTS "WebhookDelivery" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL REFERENCES "Tenant"(id) ON DELETE CASCADE ON UPDATE CASCADE,
    "webhookId" TEXT NOT NULL REFERENCES "Webhook"(id) ON DELETE CASCADE ON UPDATE CASCADE,
    "event" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "signature" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3),
    "lastError" TEXT,
    "lastAttemptAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookDelivery_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "WebhookDelivery_tenantId_status_idx" ON "WebhookDelivery"("tenantId", "status");
CREATE INDEX IF NOT EXISTS "WebhookDelivery_status_nextAttemptAt_idx" ON "WebhookDelivery"("status", "nextAttemptAt");

CREATE TABLE IF NOT EXISTS "RetentionRequest" (
    id             TEXT PRIMARY KEY,
    "tenantId"     TEXT NOT NULL REFERENCES "Tenant"(id) ON DELETE CASCADE,
    "requestedBy"  TEXT NOT NULL,
    reason         TEXT NOT NULL,
    "retentionDays" INTEGER NOT NULL,
    status         TEXT NOT NULL DEFAULT 'pending',
    "approvedBy"   TEXT,
    "approvedAt"   TIMESTAMPTZ,
    "rejectedBy"   TEXT,
    "rejectedAt"   TIMESTAMPTZ,
    "createdAt"    TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updatedAt"    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_retentionrequest_tenant ON "RetentionRequest"("tenantId", status);
CREATE INDEX IF NOT EXISTS idx_retentionrequest_status ON "RetentionRequest"(status);
