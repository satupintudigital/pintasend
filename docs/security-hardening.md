# Security Hardening — guard lintas-tenant (Task 14)

Audit guard otorisasi route `src/app/api/admin/*`, `src/app/api/platform/*`,
dan `src/app/api/v1/*`. Prinsip:

- **Session NextAuth (UI dashboard)** → scope = `session.user.tenantId`, guard
  role via `src/lib/abac.ts` (`parsePrincipal`, `canManageTenantMembers`,
  `isPlatformAdmin`). TIDAK pernah menerima `tenantId` dari body/params untuk
  menentukan scope (hanya dari sesi).
- **API key (integrasi /v1)** → `verifyApiKey` (D1) — bukan session NextAuth.
- `recordAuditFromSession` dipanggil di tiap mutasi kunci (Task 7).

## Hasil audit per file

### `src/app/api/admin/users/*` (member management, Task 3–5)
| File | Guard | Catatan |
|---|---|---|
| `users/route.ts` (GET/POST) | `canManageTenantMembers(p, p.tenantId)` | scope dari sesi ✓ |
| `users/[id]/route.ts` (PATCH/DELETE) | `canManageTenantMembers(p, p.tenantId)` | service menerima `tenantId` sesi ✓ |
| `users/[id]/password/route.ts` | `canManageTenantMembers(p, p.tenantId)` | **fix Task 4**: dulu reset lintas-tenant by-id; kini `resetTenantMemberPassword` cek `getUserInTenant(userId, tenantId)` dulu → user tenant lain = 404 |

### `src/app/api/admin/api-keys/*`
| File | Guard lama → baru | Catatan |
|---|---|---|
| `api-keys/route.ts` (GET/POST) | `owner` → `canManageTenantMembers` | tenant_admin kini boleh kelola API key tenant |
| `api-keys/[id]/route.ts` (DELETE) | `owner` → `canManageTenantMembers` | revoke scoped `revokeApiKey(id, tenantId)` ✓ |

### `src/app/api/admin/webhooks/*`
| File | Guard lama → baru | Catatan |
|---|---|---|
| `webhooks/route.ts` (PUT/DELETE) | `owner` → `canManageTenantMembers` | upsert/delete per `tenantId` sesi ✓ |
| `webhooks/test/route.ts` (POST) | `owner` → `canManageTenantMembers` | kirim event uji hanya webhook milik tenant sendiri |

### `src/app/api/platform/*` (platform admin)
- Semua route memakai `isPlatformAdmin(p)` (atau guard setara) + scope lintas-tenant
  memang diizinkan untuk platform admin. Jalur terpisah dari tenant.
- Route platform yang menyentuh user tenant (`tenants/[id]/users`, `users/[id]/password`)
  menulis ke `tenantId` target dari params — aman karena hanya platform_admin.

### `src/app/api/v1/*`
- Semua jalur memakai `verifyApiKey` (D1, 0 Neon). Tidak ada route v1 yang
  memakai session NextAuth. (Verifikasi manual lintas file v1 di Task 14.)

## Matriks role

| Kapabilitas | member | tenant_admin | owner | platform_admin |
|---|---|---|---|---|
| Kirim pesan / device / API key usage (via dashboard) | ✓ (device, lihat dashboard) | ✓ | ✓ | — (jalur sendiri) |
| Kelola member tenant (invite/role/reset/hapus) | ✗ | ✓ | ✓ | ✓ (via platform) |
| Kelola API key & webhook tenant | ✗ | ✓ | ✓ | — |
| Platform (tenant, plan, audit, broadcast, invoice, settings) | ✗ | ✗ | ✗ | ✓ |
