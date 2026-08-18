CREATE TABLE IF NOT EXISTS "Plan" (
  id                    TEXT PRIMARY KEY,
  name                  TEXT NOT NULL,
  tagline               TEXT NOT NULL DEFAULT '',
  "priceDisplay"        TEXT NOT NULL DEFAULT '',
  "maxDevices"          INTEGER NOT NULL DEFAULT 0,
  "maxUsers"            INTEGER NOT NULL DEFAULT 0,
  "maxMessagesPerMonth" INTEGER,
  "isActive"            BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt"           TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "planId" TEXT REFERENCES "Plan"(id);
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "planAssignedAt" TIMESTAMPTZ;
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "suspendedAt" TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_tenant_plan ON "Tenant"("planId");
