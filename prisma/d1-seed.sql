INSERT OR IGNORE INTO Tenant (id, name, suspendedAt) VALUES
  ('00000000-0000-7000-8000-000000000001', 'PintaSend Demo', NULL),
  ('00000000-0000-7000-8000-000000000002', 'PintaSend Platform', NULL);

INSERT OR IGNORE INTO User (id, tenantId, email, name, passwordHash, role, createdAt, updatedAt)
VALUES (
  '00000000-0000-7000-8000-000000000002',
  '00000000-0000-7000-8000-000000000001',
  'owner@pintasend.test',
  'Owner PintaSend',
  '$2b$10$k44gy32s..ES4Wu9iuOKauc2hp2.EHkhftnFQouGpVYxJZyNXrcBa',
  'owner',
  '2026-08-17T00:00:00.000Z',
  '2026-08-17T00:00:00.000Z'
);

INSERT OR IGNORE INTO User (id, tenantId, email, name, passwordHash, role, createdAt, updatedAt)
VALUES (
  '00000000-0000-7000-8000-000000000003',
  '00000000-0000-7000-8000-000000000002',
  'platform@pintasend.test',
  'Platform Admin',
  '$2b$10$k44gy32s..ES4Wu9iuOKauc2hp2.EHkhftnFQouGpVYxJZyNXrcBa',
  'platform_admin',
  '2026-08-18T00:00:00.000Z',
  '2026-08-18T00:00:00.000Z'
);
