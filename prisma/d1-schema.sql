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

-- Replika Device (Neon source of truth → D1 via write-through + d1-resync).
-- Dipakai jalur baca cepat: ingest webhook (openwaSessionId → device) & dashboard.
CREATE TABLE IF NOT EXISTS Device (
  id                TEXT PRIMARY KEY,
  tenantId          TEXT NOT NULL,
  label             TEXT NOT NULL,
  openwaSessionId   TEXT NOT NULL,
  openwaWebhookId   TEXT,
  phone             TEXT,
  status            TEXT NOT NULL DEFAULT 'created',
  createdAt         TEXT NOT NULL,
  updatedAt         TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_device_tenant ON Device(tenantId);
CREATE INDEX IF NOT EXISTS idx_device_session ON Device(openwaSessionId);

-- Konfigurasi webhook per tenant (satu baris per tenant).
CREATE TABLE IF NOT EXISTS Webhook (
  id         TEXT PRIMARY KEY,
  tenantId   TEXT NOT NULL UNIQUE,
  url        TEXT NOT NULL,
  secret     TEXT NOT NULL,
  events     TEXT NOT NULL DEFAULT '["message.received","session.status"]',
  active     INTEGER NOT NULL DEFAULT 1,
  createdAt  TEXT NOT NULL,
  updatedAt  TEXT NOT NULL
);
