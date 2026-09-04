CREATE TABLE IF NOT EXISTS "TenantWhatsAppTemplate" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "nalaniagaStoreId" TEXT NOT NULL,
  "event" TEXT NOT NULL,
  "canonicalName" TEXT NOT NULL,
  "header" TEXT,
  "body" TEXT NOT NULL,
  "footer" TEXT,
  "version" INTEGER NOT NULL DEFAULT 1,
  "checksum" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TenantWhatsAppTemplate_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "TenantWhatsAppTemplate_tenant_event_key" UNIQUE ("tenantId", "event")
);
CREATE INDEX IF NOT EXISTS "TenantWhatsAppTemplate_nalaniagaStoreId_event_idx"
  ON "TenantWhatsAppTemplate"("nalaniagaStoreId", "event");
CREATE INDEX IF NOT EXISTS "TenantWhatsAppTemplate_tenantId_isActive_idx"
  ON "TenantWhatsAppTemplate"("tenantId", "isActive");

CREATE TABLE IF NOT EXISTS "TenantWhatsAppTemplateDevice" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "deviceId" TEXT NOT NULL,
  "templateId" TEXT NOT NULL,
  "physicalTemplateName" TEXT NOT NULL,
  "physicalTemplateId" TEXT,
  "canonicalVersion" INTEGER NOT NULL,
  "checksum" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastError" TEXT,
  "syncedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TenantWhatsAppTemplateDevice_deviceId_fkey"
    FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "TenantWhatsAppTemplateDevice_templateId_fkey"
    FOREIGN KEY ("templateId") REFERENCES "TenantWhatsAppTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "TenantWhatsAppTemplateDevice_device_template_key" UNIQUE ("deviceId", "templateId")
);
CREATE INDEX IF NOT EXISTS "TenantWhatsAppTemplateDevice_tenant_status_idx"
  ON "TenantWhatsAppTemplateDevice"("tenantId", "status", "nextAttemptAt");
CREATE INDEX IF NOT EXISTS "TenantWhatsAppTemplateDevice_template_version_idx"
  ON "TenantWhatsAppTemplateDevice"("templateId", "canonicalVersion");

CREATE TABLE IF NOT EXISTS "TenantWhatsAppTemplateSyncJob" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "templateId" TEXT NOT NULL,
  "deviceId" TEXT NOT NULL,
  "canonicalVersion" INTEGER NOT NULL,
  "checksum" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastError" TEXT,
  "lockedAt" TIMESTAMP(3),
  "syncedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TenantWhatsAppTemplateSyncJob_templateId_fkey"
    FOREIGN KEY ("templateId") REFERENCES "TenantWhatsAppTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "TenantWhatsAppTemplateSyncJob_deviceId_fkey"
    FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "TenantWhatsAppTemplateSyncJob_device_template_version_key"
    UNIQUE ("deviceId", "templateId", "canonicalVersion", "checksum")
);
CREATE INDEX IF NOT EXISTS "TenantWhatsAppTemplateSyncJob_status_nextAttemptAt_idx"
  ON "TenantWhatsAppTemplateSyncJob"("status", "nextAttemptAt");
CREATE INDEX IF NOT EXISTS "TenantWhatsAppTemplateSyncJob_tenant_device_status_idx"
  ON "TenantWhatsAppTemplateSyncJob"("tenantId", "deviceId", "status");
