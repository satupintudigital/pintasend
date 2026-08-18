INSERT OR IGNORE INTO Tenant (id, name, suspendedAt) VALUES
  ('00000000-0000-7000-8000-000000000001', 'Wavio Demo', NULL),
  ('00000000-0000-7000-8000-000000000002', 'Wavio Platform', NULL);

INSERT OR IGNORE INTO User (id, tenantId, email, name, passwordHash, role, createdAt, updatedAt)
VALUES (
  '00000000-0000-7000-8000-000000000002',
  '00000000-0000-7000-8000-000000000001',
  'owner@wavio.test',
  'Owner Wavio',
  '$2b$10$tzNIi0iC7eSfj7bl.WsZ3ONoXO3wHWOYFIhGAk2bsIlsneNDIAW0a',
  'owner',
  '2026-08-17T00:00:00.000Z',
  '2026-08-17T00:00:00.000Z'
);

INSERT OR IGNORE INTO User (id, tenantId, email, name, passwordHash, role, createdAt, updatedAt)
VALUES (
  '00000000-0000-7000-8000-000000000003',
  '00000000-0000-7000-8000-000000000002',
  'platform@wavio.test',
  'Platform Admin',
  '$2b$10$tzNIi0iC7eSfj7bl.WsZ3ONoXO3wHWOYFIhGAk2bsIlsneNDIAW0a',
  'platform_admin',
  '2026-08-18T00:00:00.000Z',
  '2026-08-18T00:00:00.000Z'
);
