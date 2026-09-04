-- Audit log lintas-tenant (platform admin). Jejak aksi admin & mutasi kunci
-- (tenant.suspend/activate, plan.set, addon.set, delay.set, user.*, apikey.*,
-- webhook.*, device.*, retention.approve/reject). Hanya Neon — jalur admin
-- frekuensi rendah; TIDAK di-clone ke D1 (konsisten ADR-9). actorEmail wajib;
-- tenantId NULL = aksi platform-wide. meta = JSON objek detail.
--
-- recordAudit (src/lib/audit.ts) bersifat never-throw: kegagalan menulis audit
-- TIDAK menggagalkan operasi utama.

CREATE TABLE IF NOT EXISTS "AuditLog" (
  id           TEXT PRIMARY KEY,
  "tenantId"   TEXT,
  "actorUserId" TEXT,
  "actorEmail" TEXT NOT NULL,
  "actorRole"  TEXT NOT NULL,
  action       TEXT NOT NULL,
  "targetType" TEXT,
  "targetId"   TEXT,
  meta         TEXT NOT NULL DEFAULT '{}',
  ip           TEXT,
  "createdAt"  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_auditlog_action_created
  ON "AuditLog"("action", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS idx_auditlog_tenant_created
  ON "AuditLog"("tenantId", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS idx_auditlog_actor_created
  ON "AuditLog"("actorEmail", "createdAt" DESC);
