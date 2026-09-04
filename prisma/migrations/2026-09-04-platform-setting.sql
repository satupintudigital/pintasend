-- Platform settings global (key-value JSON). Idempotent.
CREATE TABLE IF NOT EXISTS "PlatformSetting" (
  "key"       TEXT PRIMARY KEY,
  "value"     TEXT NOT NULL,
  "updatedBy" TEXT,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);
