-- Migrasi BotRule untuk fitur Auto-Reply & Keyword Bot
CREATE TABLE IF NOT EXISTS "BotRule" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL REFERENCES "Tenant"("id") ON DELETE CASCADE,
  "name" TEXT NOT NULL,
  "keyword" TEXT NOT NULL,
  "matchType" TEXT NOT NULL DEFAULT 'exact',
  "response" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "BotRule_tenantId_idx" ON "BotRule"("tenantId");
