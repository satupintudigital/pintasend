-- Partial unique index untuk Label agar soft-deleted label ("isActive" = false) tidak konflik saat nama dibuat ulang
DROP INDEX IF EXISTS "Label_tenantId_name_key";
CREATE UNIQUE INDEX IF NOT EXISTS "Label_tenantId_name_active_key" ON "Label"("tenantId", "name") WHERE "isActive" = true;
