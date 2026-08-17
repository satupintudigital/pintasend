CREATE TABLE IF NOT EXISTS User (
  id           TEXT PRIMARY KEY,
  tenantId     TEXT NOT NULL,
  email        TEXT NOT NULL UNIQUE,
  name         TEXT NOT NULL,
  passwordHash TEXT NOT NULL,
  role         TEXT NOT NULL DEFAULT 'owner',
  createdAt    TEXT NOT NULL,
  updatedAt    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_user_email ON User(email);

CREATE TABLE IF NOT EXISTS ApiKey (
  id         TEXT PRIMARY KEY,
  tenantId   TEXT NOT NULL,
  label      TEXT NOT NULL,
  keyHash    TEXT NOT NULL,
  prefix     TEXT NOT NULL,
  createdAt  TEXT NOT NULL,
  lastUsedAt TEXT,
  revokedAt  TEXT
);
CREATE INDEX IF NOT EXISTS idx_apikey_tenant ON ApiKey(tenantId);
CREATE INDEX IF NOT EXISTS idx_apikey_hash ON ApiKey(keyHash);
