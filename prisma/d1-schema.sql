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
