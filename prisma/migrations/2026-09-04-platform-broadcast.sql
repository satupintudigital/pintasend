-- Platform broadcast + job queue (pengumuman platform ke nomor owner device).
-- Idempotent.
CREATE TABLE IF NOT EXISTS "PlatformBroadcast" (
  "id"          TEXT PRIMARY KEY,
  "name"        TEXT NOT NULL,
  "messageBody" TEXT NOT NULL,
  "status"      TEXT NOT NULL DEFAULT 'draft',
  "targetMode"  TEXT NOT NULL DEFAULT 'ready_devices',
  "tenantIds"   TEXT NOT NULL DEFAULT '[]',
  "createdBy"   TEXT,
  "scheduledAt" TIMESTAMPTZ,
  "startedAt"   TIMESTAMPTZ,
  "completedAt" TIMESTAMPTZ,
  "failReason"  TEXT,
  "totalJobs"   INTEGER NOT NULL DEFAULT 0,
  "sentCount"   INTEGER NOT NULL DEFAULT 0,
  "failedCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "PlatformBroadcastJob" (
  "id"            TEXT PRIMARY KEY,
  "broadcastId"   TEXT NOT NULL REFERENCES "PlatformBroadcast"("id") ON DELETE CASCADE,
  "tenantId"      TEXT NOT NULL,
  "deviceId"      TEXT NOT NULL,
  "deviceLabel"   TEXT,
  "chatId"        TEXT,
  "status"        TEXT NOT NULL DEFAULT 'pending',
  "error"         TEXT,
  "messageId"     TEXT,
  "attempts"      INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMPTZ,
  "lockedAt"      TIMESTAMPTZ,
  "sentAt"        TIMESTAMPTZ,
  "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "PlatformBroadcastJob_broadcastId_status_idx"
  ON "PlatformBroadcastJob" ("broadcastId", "status");
CREATE INDEX IF NOT EXISTS "PlatformBroadcastJob_status_nextAttemptAt_idx"
  ON "PlatformBroadcastJob" ("status", "nextAttemptAt");
