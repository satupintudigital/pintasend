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
