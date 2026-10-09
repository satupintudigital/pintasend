-- Migrasi Label & LabelContact untuk CRM/segmentasi & sinkronisasi OpenWA
CREATE TABLE IF NOT EXISTS "Label" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL REFERENCES "Tenant"("id") ON DELETE CASCADE,
  "name" TEXT NOT NULL,
  "color" TEXT NOT NULL DEFAULT '#6366f1',
  "openwaLabelId" TEXT,
  "openwaSyncedAt" TIMESTAMP(3),
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "Label_tenantId_name_key" ON "Label"("tenantId", "name");
CREATE INDEX IF NOT EXISTS "Label_tenantId_isActive_idx" ON "Label"("tenantId", "isActive");

CREATE TABLE IF NOT EXISTS "LabelContact" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "labelId" TEXT NOT NULL REFERENCES "Label"("id") ON DELETE CASCADE,
  "chatId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "LabelContact_labelId_chatId_key" ON "LabelContact"("labelId", "chatId");
CREATE INDEX IF NOT EXISTS "LabelContact_tenantId_chatId_idx" ON "LabelContact"("tenantId", "chatId");
CREATE INDEX IF NOT EXISTS "LabelContact_labelId_idx" ON "LabelContact"("labelId");
