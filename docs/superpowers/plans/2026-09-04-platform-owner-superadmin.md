# PintaSend Platform Owner & Superadmin — Implementation Plan

> **Status: ✅ SELESAI (16/16 task, inline di worktree `feat-platform-owner-superadmin`, 2026-09-04).**
> Tiap task dikerjakan TDD (red→green), tsc + full suite hijau per commit. Ledger:
> `.superpowers/sdd/2026-09-04-platform-owner-superadmin/progress.md`.
>
> Untuk agentic workers lain: plan ini sudah dieksekusi penuh; gunakan sebagai referensi implementasi, bukan checklist untuk dikerjakan ulang.

**Goal:** Sebuah spesifikasi holistik satu-go yang menutup SEMUA gap PintaSend: member management owner, fungsi platform admin yang belum ada (audit log, global settings, broadcast, invoice ringkas), hardening keamanan role, plus pola arsitektur modular + future-proof yang berlaku lintas fitur.

**Architecture:** PintaSend sudah punya dua layer role yang mapan (`owner` vs `platform_admin`). Spec ini memperkuat lapisan itu jadi **tiga tier** (`owner` → `tenant_admin` → `platform_admin`) dengan gate fungsional (bukan cuma cek `role === string`), memisahkan setiap domain jadi service layer mandiri (file `src/lib/<domain>.ts`), dan meletakkan audit log sebagai concern transversal yang diinjeksikan lewat wrapper kecil, bukan diulang di tiap route.

**Tech Stack:** Next.js (App Router), NextAuth v5 (Credentials), Cloudflare Workers (D1 replika auth/device) + Neon (PostgreSQL source of truth), Prisma schema sebagai dokumen referensi, vitest untuk unit test, `tsx` untuk script seed/dev.

---

## Ringkasan Gap yang Ditutup

| No | Gap (dari review 2026-09-04) | Fitur yang dibangun | Layer |
|---|---|---|---|
| 1 | Owner tidak punya UI/API manage member di tenant sendiri | Member CRUD tenant-scoped (add/remove/role) | Owner + platform_admin (override) |
| 2 | Role model cuma `owner` / `member` → tidak ada tenant_admin | `role` jadi enum 3 tier; gate fungsional | Core |
| 3 | Platform admin belum bisa lihat audit apa yang terjadi | Audit log lintas-tenant (`AuditLog`) + dashboard + export | Platform admin |
| 4 | Tidak ada global settings platform (nama platform, watermark, dll.) | `PlatformConfig` CRUD + halaman | Platform admin |
| 5 | Tidak ada broadcast / campaign lintas-tenant | Campaign platform (satu pesan → multi-tenant device) | Platform admin |
| 6 | Tidak ada billing/invoice | Invoice ringkas (simulasi pendapatan per tenant per bulan) + halaman | Platform admin |
| 7 | Route `/api/admin/users` & `/api/admin/api-keys` harus dicek guard-nya | Hardening: hanya `tenant_admin`+ diakses, scoped ke tenantId | Keamanan |
| 8 | Tidak ada pola gate fungsional baku (duplikat `role === "platform_admin"` di 20+ route) | `src/lib/abac.ts` — gate factory + helper | Core |
| 9 | Tidak ada dokumen referensi rapi untuk developer yang masuk nanti | Spec ini + Tambah bagian "Referensi Implementasi" di existing docs | Dokumentasi |

---

## Prinsip Desain (harus dipegang di tiap task)

1. **SRP per file.** Satu file = satu domain. Rule of thumb: kalau file melampaui ~350 baris logic (bukan docstring/comment) atau punya 2+ alasan untuk berubah, split.
2. **Service layer di `src/lib/`, route tetap thin.** Route handler hanya: `auth()` → gate → parse body → panggil service → Response.json. Toleransi: route boleh ngambil data untuk halaman SSR (Next.js page) karena itu pattern Next.js yang sudah ada.
3. **Gate fungsional, bukan cuma role string.** Cek `role === "platform_admin"` 흩어 di 20 route → susah mantenance. Ganti jadi helper ABA/clock (role + tenantId + privilege), mis. `requirePlatformAdmin()` sudah ada di `src/app/api/platform/tenants/route.ts:17` — jadi templat.
4. **Write-through Neon → D1 untuk data auth/device yang dibaca di jalur hot.** Pola sudah ada di `authStore.ts` dan `devices.ts`. Fitur baru jangan invent pola baru kecuali ada alasan kuat.
5. **Jalur platform admin boleh baca Neon langsung** (bukan Wajib D1) karena frekuensi rendah — tapi tetap harus ada replika D1 kalau data itu juga dibaca di jalur hot (mis. audit log akan dibaca di dashboard admin yang mungkin sering di-refresh).
6. **Addon key di-whitelist di satu tempat**. Saat ini `ADDON_KEYS` ada di `src/app/api/platform/tenants/[id]/addons/route.ts:6` dan `src/lib/watermark.ts` hardcode `"remove_watermark"`. Konsolidasi jadi `src/lib/addonKeys.ts`.
7. **Future-proof terhadap tier ke-4 (mis. billing admin, support admin)**. Guard helper didesain pakai privilege bitmask / set, bukan if-chain role-specific.
8. **Test-first untuk fitur baru.** Setiap fitur baru punya test file di `src/<layer>/<name>.test.ts`. Target coverage fitur baru ≥ 90%.

---

## Referensi Implementasi (pelajari sebelum mulai tiap task)

### Pola guard yang sudah ada
- `requirePlatformAdmin(session)`: ada di `src/app/api/platform/tenants/route.ts:17` — templat baku.
- Tiap route platform pakai pola:
  ```ts
  const session = await auth();
  if (!session?.user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "platform_admin") {
    return Response.json({ error: "Forbidden — khusus platform admin" }, { status: 403 });
  }
  ```
- Route owner (tenant-scoped) pakai pola:
  ```ts
  const session = await auth();
  const tenantId = session?.user?.tenantId;
  if (!tenantId) return Response.json({ error: "Unauthorized" }, { status: 401 });
  // opsional:
  if (session.user.role !== "owner") { ... }
  ```

### Pola service layer yang sudah ada
- `src/lib/sendMessage.ts` — `executeSendMessage` ini adalah contoh service layer yang baik: function besar tapi fokus satu domain, return `{ ok, status, error?, body?, retryAfterSec?, headers? }`.
- `src/lib/platform.ts` — `listTenants`, `getTenantDetail`, `listPlans`, `setTenantPlan`, `setTenantDelayEnabled`, `setTenantAddon`, `getPlatformMetrics`, `updatePlan` — semua function murni, return tipe eksplisit.
- `src/lib/retention.ts` — `getTenantRetentionDays`, `listRetentionRequests`, `createRetentionRequest`, `approveRetentionRequest`, `rejectRetentionRequest`.
- `src/lib/quota.ts` — `getTenantQuota`, `checkDeviceQuota`, `checkUserQuota`, `checkMessageQuota`.

### Pola write-through Neon → D1 yang sudah ada
- `authStore.ts`: `createUser`, `createUserWithTenant`, `createApiKey`, `revokeApiKey`, `updateUserPassword` — semua punya try/catch clone D1 + log error + return status `d1Ok`.
- `devices.ts`: `cloneDeviceToD1`.
- `tenantStore.ts`: `setTenantSuspended` — clone D1 + cek `changesD1`.

### Pola rate-limit yang sudah ada
- `src/lib/rate-limit.ts`: `checkRateLimit(bucket, max, windowMs)`, `clientIp(req)`, `rateLimitResponse(retryAfterSec)`.
- Dipakai di: `src/app/api/v1/messages/route.ts` (awal), `src/app/api/admin/api-keys/route.ts` (key create), `src/app/api/platform/tenants/route.ts` (register tenant).

### Enum role yang direncanakan
Saat ini `User.role` di schema adalah `String @default("owner")` dengan komen `// "owner" | "member"`.
Target akhir (setelah Task 2):
```
"owner"         — pemilik tenant (satu per tenant), punya semua hak tenant
"tenant_admin"  — admin tenant (bisa manage member, device, webhook, dll.), tapi tidak bisa suspend/plan/retention-approval
"member"        — pengguna biasa tenant
"platform_admin" — operator PintaSend (lintas-tenant)
```
Role `platform_admin` tetap dipakai di sisi platform. Di `User.role`, `platform_admin` adalah role khusus yang tenantId-nya adalah tenant platform (Bukan tenant biasa).

### Kunci addon yang valid
Saat ini di-whitelist di `src/app/api/platform/tenants/[id]/addons/route.ts:6`:
```ts
const ADDON_KEYS = ["random_delay", "remove_watermark"] as const;
```
Konsolidasi ke `src/lib/addonKeys.ts`:
```ts
export const ADDON_KEYS = ["random_delay", "remove_watermark"] as const;
export type AddonKey = (typeof ADDON_KEYS)[number];
```

---

## Lingkup yang SENGaja TIDAK masuk spec ini

- Fitur WhatsApp level owner yang sudah ada (message CRUD, devices, campaigns, labels, webhooks) — tidak di-repesign, hanya dijamin guard-nya benar.
- Migrasi ke OAuth / SSO selain yang sudah ada (NalaNiaga SSO via `src/lib/nalaniagaSso.ts`).
- Penambahan tenant yang tidak terkait keamanan/role (mis. multi-device per tenant) — sudah ada.
- Perubahan schema besar yang butuh migrasi produksi nontrivial (mis. migrasi User ke role enum PostgreSQL) — avoided; role disimpan tetap STRING di DB, validasi di application layer.

---

## Komitmen Kode (harus dikuasai sebelum eksekusi)

- branch: `feat/pintasend-fase-4` (sudah ada)
- commit message konvensi: `tipo(scope): pesan` — contoh: `feat(auth):tier role tenant_admin`, `feat(platform):audit log`, `feat(platform):global settings`, `feat(platform):broadcast campaign`, `feat(platform):invoice ringkas`, `refactor(guard):gate fungsional baku`, `refactor(addon):konsolidasi addon keys`, `test(auth):member CRUD`, dst.
- Bahasa 인도네시아 untuk deskripsi & komentar internal; nama function & tipe dalam English (karena codebase existing pakai English untuk identifer).
- Tidak ada magic number di logic bisnis — konstanta dikelola di file domain atau `src/lib/constants.ts` jika memang shared.

---

## Stakeholder & User Personas

| Persona | Role | Scope |
|---|---|---|
| Owner toko | `owner` | Satu tenant, pengurus harian, bisa add member sendiri |
| Admin toko | `tenant_admin` | Satu tenant, manage member/device/webhook/labels/campaign, tidak bisa ganti plan/suspend/retention approval |
| Anggota tim | `member` | Satu tenant, akses terbatas (dashboard, kirim pesan via API key yang dibuat owner) |
| Operator PintaSend | `platform_admin` | Lintas-tenant: provision, suspend, plan, delay, addon, retention approval, audit, global settings, broadcast, invoice |

---

## Fase Eksekusi

- **Fase 0:** Prep + guard baku (Task 1–2) — fondasi yang dipakai semua fitur setelahnya.
- **Fase 1:** Fitur owner — member management (Task 3–5).
- **Fase 2:** Fitur platform admin inti — audit log + global settings (Task 6–9).
- **Fase 3:** Fitur platform admin lanjutan — broadcast campaign + invoice ringkas (Task 10–13).
- **Fase 4:** Hardening + polishing — konsolidasi addon keys, test coverage, docs (Task 14–16).

## Global Constraints (berlaku untuk SEMUA task)

1. **Branch kerja:** `feat/pintasend-fase-4` (jangan pernah implementasi langsung di `main`).
2. **Tidak menambah dependency runtime baru** tanpa persetujuan — semua fitur memakai stack yang sudah ada (Next.js App Router, `@neondatabase/serverless` via `src/lib/db.ts`, D1 via `src/lib/d1.ts`, vitest).
3. **Bahasa:** komentar & pesan error dalam Bahasa Indonesia (konsisten codebase); nama function/type/identifiers dalam English.
4. **Migration:** setiap perubahan tabel Neon = 3 artefak sinkron: `prisma/schema.prisma` (dokumen), `prisma/migrations/YYYY-MM-DD-<nama>.sql` (baru, idempoten — pakai `ADD COLUMN IF NOT EXISTS`), dan tambahkan kolom ke `prisma/pintasend-schema.sql`. Tidak perlu migrasi D1 kecuali data dibaca di jalur hot auth/device (kolom `User.role` & `suspendedAt` sudah ada di D1).
5. **Runtime data: NEO Neon source of truth; D1 hanya replika auth/device.** Fitur baru (AuditLog, PlatformSetting, Invoice, PlatformBroadcast) cukup Neon — TIDAK di-clone ke D1 (baca via `src/lib/db.ts`, bukan prisma client — prisma client tidak dipakai di runtime Worker).
6. **Pattern yang harus ditiru (bukan reinvent):** write-through Neon→D1 di `src/lib/authStore.ts`; service-layer `execute*`/pure-fn di `src/lib/` (contoh `sendMessage.ts`, `platform.ts`, `retention.ts`, `campaigns.ts`); route thin → panggil service; rate limit via `src/lib/rate-limit.ts` (`checkRateLimit`, `clientIp`, `rateLimitResponse`); audit-style log via `src/lib/requestLogger.ts` `logEvent`.
7. **Test:** setiap perilaku baru punya unit test colocated `*.test.ts` (vitest). Jalankan `npx vitest run <file>` per task; wajib hijau sebelum commit.
8. **Verifikasi wajib sebelum menyelesaikan fase:** `npx tsc --noEmit` bersih, `npm test` hijau, `npm run lint` tanpa error baru.
9. **Commit per task** dengan pesan konvensional (lihat komitmen kode di bawah task) — TDD red-green per unit kerja kecil.
10. **Dilarang commit `.env`, key, atau secret apapun** ke git.
11. **Jangan merombak total file sehat yang tidak terkait** — task hardening hanya menyentuh bagian yang disebut.
12. **Semua fitur baru wajib punya entri halaman/API docs** (`src/app/docs/api/page.tsx` untuk API v1 + halaman platform yang relevan).

---

# Task Detail

### Task 1: Role tiers + gate terpusat (`src/lib/abac.ts`)

**Files:**
- Create: `src/lib/abac.ts`
- Create test: `src/lib/abac.test.ts`
- Modify (konsolidasi helper saja, tanpa migrasi penuh dulu): `src/app/api/platform/tenants/route.ts:17-21` (ganti body `requirePlatformAdmin` jadi impor dari abac)

**Interfaces (Produces):**
```ts
export type Role = "member" | "tenant_admin" | "owner" | "platform_admin";
export const ROLE_ORDER: Record<Role, number> = { member: 0, tenant_admin: 1, owner: 2, platform_admin: 3 };
export interface Principal { id: string; email: string | null; name: string | null; role: string; tenantId: string; }
// Normalisasi role string (nilai tak dikenal → "member") — role DB tetap string, validasi di sini.
export function normalizeRole(role: string | undefined | null): Role;
// Hak tenant-scoped: platform_admin punya akses ke tenant mana pun; selain itu hanya tenant sendiri.
export function canAccessTenant(p: Principal, tenantId: string | null | undefined): boolean;
// Member management: owner|tenant_admin tenant tsb, atau platform_admin (lintas-tenant).
export function canManageTenantMembers(p: Principal, tenantId: string | null | undefined): boolean;
// Owner-only tenant ops (device create/delete, webhook, api-key, suspend diri, dst.) — owner|platform_admin.
export function isTenantOwnerOrAbove(p: Principal): boolean; // role order >= owner
// Platform operator (lintas-tenant).
export function isPlatformAdmin(p: Principal): boolean;
export function roleAtLeast(role: Role, min: Role): boolean;
// Helper response untuk route (agar 20+ route tidak mengetik ulang blok 401/403).
export function unauthorized(): Response;
export function forbidden(): Response;
export function parsePrincipal(session: {
  user?: { id?: string; email?: string | null; name?: string | null; role?: string | null; tenantId?: string | null } | null;
} | null): Principal | null;
```

- [x] **Step 1: Tulis failing test** — `src/lib/abac.test.ts`: normalizeRole(undefined|“superuser”|“”) → “member”; canAccessTenant(owner tenant A, tenant A)=true, (owner A, tenant B)=false, (platform_admin, tenant B)=true; canManageTenantMembers(member A, A)=false, (tenant_admin A, A)=true, (tenant_admin A, B)=false; roleAtLeast(owner, owner)=true; roleAtLeast(member, owner)=false; parsePrincipal({user:null})=null.
- [x] **Step 2: Jalankan test** → FAIL (modul belum ada).
- [x] **Step 3: Implementasi `abac.ts`** (pure functions, tanpa import DB; export `forbidden()`/`unauthorized()` konsisten dengan teks pesan yang dipakai route sekarang: `{ error: "Forbidden — khusus platform admin" }` / `{ error: "Unauthorized" }`).
- [x] **Step 4: Refactor kecil** — di `src/app/api/platform/tenants/route.ts`, ganti fungsi lokal `requirePlatformAdmin` dengan pemakaian `parsePrincipal` + `isPlatformAdmin` dari `abac.ts` (perilaku identik, hapus duplikasi lokal).
- [x] **Step 5: Jalankan test** (`npx vitest run src/lib/abac.test.ts`) → PASS; `npx tsc --noEmit` bersih.
- [x] **Step 6: Commit** `refactor(abac): gate role terpusat untuk owner/tenant_admin/platform_admin`

---

### Task 2: Perluas role `tenant_admin` di schema & admin store

**Files:**
- Modify: `prisma/schema.prisma` (komentar `User.role`: `// "owner" | "tenant_admin" | "member" | "platform_admin"`) + `prisma/pintasend-schema.sql` (komentar sama — TIDAK ada perubahan kolom, role tetap TEXT)
- Modify: `src/lib/authStore.ts` — `NewUser.role` comment + validasi role whitelist di `createUser` & `createUserWithTenant` (`owner|tenant_admin|member|platform_admin`; default tetap `owner` di jalur register)
- Modify: `src/app/api/platform/tenants/[id]/users/route.ts` — POST saat ini menerima `role` bebas; batasi: hanya `member|tenant_admin` untuk user baru non-owner via platform (owner tenant dibuat lewat provisioning terpisah).
- Create test: `src/lib/authStore.abac.test.ts` (role whitelist saat create user invalid role → ditolak)

- [x] **Step 1:** Tulis failing test untuk whitelist role (createUser role “superuser” → throw/error).
- [x] **Step 2:** Jalankan → FAIL.
- [x] **Step 3:** Implementasi: helper `normalizeRole` dari Task 1 dipakai sebelum INSERT; input role di luar whitelist ditolak (lemparkan `InvalidRoleError`).
- [x] **Step 4:** Update route platform users POST → hanya izinkan `member|tenant_admin`; jaga kuota `checkUserQuota` tetap dipanggil.
- [x] **Step 5:** Jalankan test + `tsc` → hijau.
- [x] **Step 6: Commit** `feat(roles): role tenant_admin + whitelist role di jalur create user`

---

### Task 3: Member CRUD tenant-scoped (service layer `src/lib/tenantMembers.ts`)

**Files:**
- Create: `src/lib/tenantMembers.ts`
- Create test: `src/lib/tenantMembers.test.ts`
- Modify: `src/lib/authStore.ts` (tambah `deleteUser(userId, tenantId)` write-through Neon→D1 + `getUserInTenant(userId, tenantId)` untuk scope-check)

**Interfaces (Produces):**
```ts
export interface MemberInviteInput {
  tenantId: string;         // tenant pemilik (wajib = session.tenantId, kecuali platform_admin)
  name: string;
  email: string;
  role: "member" | "tenant_admin"; // owner TIDAK bisa dibuat lewat invite member (task 2)
  password: string;         // min 8 — owner set password awal; email welcome tetap dikirim
}
export async function inviteTenantMember(input: MemberInviteInput, actor: Principal): Promise<{ id: string }>;
export async function listTenantMembers(tenantId: string, params: { q?: string; page?: number; limit?: number }): Promise<{ users: AdminUserRow[]; total: number }>;
export async function updateTenantMemberRole(userId: string, tenantId: string, role: Role, actor: Principal): Promise<{ ok: boolean; reason?: string }>;
export async function removeTenantMember(userId: string, tenantId: string, actor: Principal): Promise<{ ok: boolean; reason?: string }>;
export async function resetTenantMemberPassword(userId: string, tenantId: string, newPassword: string, actor: Principal): Promise<{ ok: boolean; reason?: string }>;
```
Invariant yang dijaga service (unit-test wajib):
- member role → hanya `member|tenant_admin`; menolak `owner`/`platform_admin` via jalur ini.
- Role change tidak boleh mencabut **owner terakhir** tenant.
- `removeTenantMember` menolak menghapus diri sendiri (`actor.id === userId`), dan menolak menghapus owner terakhir; juga tidak boleh menghapus `platform_admin`.
- `resetTenantMemberPassword` hanya untuk user dalam tenant yang sama (`getUserInTenant`), TIDAK lintas-tenant.
- Semua mutasi mencatat audit (dipanggil di Task 6+ — tandai call-site dengan TODO kecil berkomentar `// TODO(audit): recordAudit(...)` yang diisi Task 7).

- [x] **Step 1:** Failing test: invite owner via jalur member → ditolak; role change mencabut owner terakhir → ditolak; remove diri sendiri → ditolak.
- [x] **Step 2:** Jalankan → FAIL.
- [x] **Step 3:** Implementasi `tenantMembers.ts` memakai `authStore.createUser` (sudah ada), `listUsersPaginated`, plus `deleteUser`/`getUserInTenant` baru di `authStore.ts` (write-through Neon→D1, hapus baris D1 `DELETE FROM User WHERE id=?`).
- [x] **Step 4:** test hijau; `tsc` bersih.
- [x] **Step 5: Commit** `feat(tenant): service member management tenant-scoped (invite/list/role/remove/reset)`

---

### Task 4: Route API member management (owner & tenant_admin)

**Files (semua di bawah `src/app/api/admin/users/`):**
- Modify: `route.ts` (GET — perlebar guard dari `owner` → `owner|tenant_admin` via `canManageTenantMembers`; tetap scope ke `session.user.tenantId`)
- Modify: `[id]/password/route.ts` (guard perlebar sama + scope-check `getUserInTenant` sebelum reset — ini juga menutup celah lintas-tenant yang ada)
- Create: `POST` di `route.ts` (body `{name,email,password,role}`) → `inviteTenantMember`
- Create: `[id]/route.ts` — `PATCH { role }` → `updateTenantMemberRole`; `DELETE` → `removeTenantMember`
- Create test: `src/app/api/admin/users/route.test.ts` + `src/app/api/admin/users/[id]/route.test.ts` (mock session; kasus: 401 tanpa session; member → 403; owner lintas-tenant disimulasikan service ditolak → 400/403; happy path 201/200)

- [x] **Step 1:** Failing test route: POST valid → 201; POST role owner → 400; DELETE diri sendiri → 400.
- [x] **Step 2:** Jalankan → FAIL (belum ada handler).
- [x] **Step 3:** Implementasi handler thin — `auth()` → `parsePrincipal` → `canManageTenantMembers(p, p.tenantId)` → rate limit (bucket `admin-user:${tenantId}:${clientIp}` 30/mnt) → panggil service → Response.
- [x] **Step 4:** Jalankan test + `tsc` hijau.
- [x] **Step 5: Commit** `feat(api): route member management (POST/PATCH/DELETE) owner & tenant_admin`

---

### Task 5: UI dashboard — halaman Members

**Files:**
- Create: `src/app/dashboard/members/page.tsx` (server component: `auth()` → `parsePrincipal` → `canManageTenantMembers` → redirect `/dashboard` bila bukan; render `<MembersTable />`)
- Create: `src/components/dashboard/MembersTable.tsx` (client — list, invite form modal, ganti role, reset password, remove; konfirmasi hapus; badge role; empty state; error state; polling/list refresh setelah aksi)
- Modify: sidebar/nav dashboard (temukan file nav — pola `src/components/dashboard/*Sidebar*` atau sejenisnya — tambah entri “Members” untuk owner/tenant_admin)
- Create test: `src/components/dashboard/MembersTable.test.tsx` (opsional — happy path render; bila tim UI repo belum punya pola test component, konfirmasi dulu & cukup smoke via `npm test` yang ada)

- [x] **Step 1:** Buat halaman + komponen mengikuti pola halaman settings/members yang sudah ada di dashboard (cek `src/app/dashboard/*` untuk referensi styling & fetch).
- [x] **Step 2:** Sambungkan semua aksi ke route Task 4; tampilkan pesan error dari API; role `platform_admin`/`owner` label jelas.
- [x] **Step 3:** Build typecheck (`tsc --noEmit`) + test hijau.
- [x] **Step 4: Commit** `feat(ui): halaman members dashboard (invite, role, reset, remove)`

---

### Task 6: Model AuditLog + service `src/lib/audit.ts`

**Files:**
- Modify: `prisma/schema.prisma` + `prisma/pintasend-schema.sql`
- Create: `prisma/migrations/2026-09-04-audit-log.sql` (idempotent)
- Create: `src/lib/audit.ts`
- Create test: `src/lib/audit.test.ts`

**Model baru (Neon only, TIDAK ke D1):**
```prisma
model AuditLog {
  id          String   @id @default(uuid(7))
  tenantId    String?                    // null = aksi platform-wide
  actorUserId String?
  actorEmail  String
  actorRole   String
  action      String                     // tenant.suspend, user.role.update, addon.set, …
  targetType  String?                    // "tenant" | "user" | "device" | "apikey" | …
  targetId    String?
  meta        String   @default("{}")   // JSON objek detail (before/after, alasan)
  ip          String?
  createdAt   DateTime @default(now())

  @@index([action, createdAt(sort: Desc)])
  @@index([tenantId, createdAt(sort: Desc)])
  @@index([actorEmail, createdAt(sort: Desc)])
}
```
SQL migration idempotent:
```sql
CREATE TABLE IF NOT EXISTS "AuditLog" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT,
  "actorUserId" TEXT,
  "actorEmail" TEXT NOT NULL,
  "actorRole" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "targetType" TEXT,
  "targetId" TEXT,
  "meta" TEXT NOT NULL DEFAULT '{}',
  "ip" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "AuditLog_action_createdAt_idx" ON "AuditLog" ("action", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "AuditLog_tenantId_createdAt_idx" ON "AuditLog" ("tenantId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "AuditLog_actorEmail_createdAt_idx" ON "AuditLog" ("actorEmail", "createdAt" DESC);
```

**Interfaces (Produces):**
```ts
export interface AuditEntryInput {
  tenantId?: string | null;
  actor: { id?: string | null; email: string; role: string };
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  meta?: Record<string, unknown>;
  ip?: string | null;
}
// Never-throw: kegagalan audit TIDAK boleh menggagalkan operasi utama (fire-and-forget dengan .catch, dipanggil await di akhir service).
export async function recordAudit(input: AuditEntryInput): Promise<void>;
export interface AuditQuery {
  action?: string;
  tenantId?: string;
  actorEmail?: string;
  from?: string; // ISO
  to?: string;
  q?: string;    // LIKE targetId/action/meta kasar
  page?: number;
  limit?: number;
}
export async function listAuditLogs(q: AuditQuery): Promise<{ logs: AuditLogRow[]; total: number }>;
export interface AuditLogRow { id: string; tenantId: string | null; actorUserId: string | null; actorEmail: string; actorRole: string; action: string; targetType: string | null; targetId: string | null; meta: string; ip: string | null; createdAt: string; }
```

- [x] **Step 1:** Failing test: `recordAudit` menulis baris (mock query) walau meta berisi objek (ter-serialize JSON); `listAuditLogs` filter action+tenantId+page; recordAudit tidak melempar saat query gagal (mock reject → resolve).
- [x] **Step 2:** Jalankan → FAIL.
- [x] **Step 3:** Implementasi `audit.ts` memakai `query` dari `src/lib/db` (Neon), uuidv7 untuk id.
- [x] **Step 4:** Terapkan migration SQL (cek pola `prisma/apply-schema.mjs`; jalankan `node prisma/apply-schema.mjs` untuk dev) + test hijau + `tsc` bersih.
- [x] **Step 5: Commit** `feat(audit): model + service AuditLog (never-throw record, list filter paginated)`

---

### Task 7: Instrumentasi audit di titik mutasi kunci

**Files (setiap baris = tambah `await recordAudit({...})` di akhir operasi sukses):**
- `src/app/api/platform/tenants/route.ts` — POST tenant → action `tenant.create`
- `src/app/api/platform/tenants/[id]/status/route.ts` — `tenant.suspend` / `tenant.activate`
- `src/app/api/platform/tenants/[id]/plan/route.ts` — `tenant.plan.set` (meta: planId before/after)
- `src/app/api/platform/tenants/[id]/delay/route.ts` — `tenant.delay.set`
- `src/app/api/platform/tenants/[id]/addons/route.ts` — `tenant.addon.set` (meta: key, active)
- `src/app/api/platform/tenants/[id]/retention/[requestId]/route.ts` — `retention.approve` / `retention.reject`
- `src/app/api/platform/tenants/[id]/users/route.ts` — POST → `user.create`
- `src/app/api/platform/users/[id]/password/route.ts` — `user.password.reset` (platform)
- `src/app/api/admin/users/route.ts` (POST Task 4) — `user.create` (owner/tenant_admin)
- `src/app/api/admin/users/[id]/route.ts` (PATCH/DELETE Task 4) — `user.role.update` / `user.remove`
- `src/app/api/admin/api-keys/route.ts` + `[id]/route.ts` — `apikey.create` / `apikey.revoke`
- `src/app/api/admin/webhooks/route.ts` (PUT/DELETE) — `webhook.upsert` / `webhook.delete`
- `src/app/api/devices/route.ts` (POST) + `devices/[id]/route.ts` (DELETE) — `device.create` / `device.delete`

**Kontrak:** action string snake_case di atas; `meta` berisi `before`/`after` bila relevan; `tenantId` dari target (bukan hanya session); actor dari `parsePrincipal(session)`. Kegagalan `recordAudit` tidak menggagalkan respons (sudah never-throw di Task 6).

- [x] **Step 1:** Pilih 2 file (mis. tenants status + api-keys) → tulis unit test route yang mengassert `recordAudit` dipanggil dengan action benar (mock `src/lib/audit`).
- [x] **Step 2:** Implementasi instrumentasi di kedua file → test hijau.
- [x] **Step 3:** Terapkan ke file tersisa (tanpa test per-file — cukup test Task 6 + smoke `npm test` penuh).
- [x] **Step 4:** `tsc` + `npm test` hijau.
- [x] **Step 5: Commit** `feat(audit): instrumentasi action platform & tenant (create/suspend/plan/delay/addon/user/apikey/webhook/device)`

---

### Task 8: API + halaman platform Audit Log

**Files:**
- Create: `src/app/api/platform/audit/route.ts` — GET `?action&tenantId&actorEmail&from&to&q&page&limit` (guard `platform_admin`)
- Create: `src/app/api/platform/audit/export/route.ts` — GET `?filters` → CSV (kolom: waktu, actor, role, action, targetType, targetId, tenantId, meta, ip; header `x-pintasend-signature` tidak perlu — ini admin UI)
- Create: `src/app/platform/audit/page.tsx` (server: guard layout sudah memfilter platform_admin — render `<AuditTable />`)
- Create: `src/components/platform/AuditTable.tsx` (client: filter action/tenantId/q + date range, pagination, export CSV button, row expand meta JSON)
- Modify: `src/components/platform/PlatformSidebar.tsx` (tambah entri “Audit”)
- Create test: `src/app/api/platform/audit/route.test.ts` (401/403/200 + delegasi filter)

- [x] **Step 1:** Failing test route audit (mock listAuditLogs): 401 tanpa session, 403 role owner, 200 & filter diteruskan.
- [x] **Step 2:** Implementasi route GET + export CSV (helper kecil `toAuditCsv(logs)` di `audit.ts` agar ter-test; CSV escape koma/quote/newline).
- [x] **Step 3:** Halaman + tabel + sidebar.
- [x] **Step 4:** `tsc` + test hijau.
- [x] **Step 5: Commit** `feat(platform): audit log API + halaman + export CSV`

---

### Task 9: Global platform settings (`PlatformSetting`)

**Files:**
- Modify: `prisma/schema.prisma` + `pintasend-schema.sql`; Create `prisma/migrations/2026-09-04-platform-setting.sql`
- Create: `src/lib/platformSettings.ts` + test `platformSettings.test.ts`
- Modify: `src/lib/watermark.ts` — `resolveWatermark`/`getWatermarkFootnote` fallback ke setting `watermark_footnote` (env `PINTSEND_WATERMARK_FOOTNOTE` override → setting DB → `DEFAULT_WATERMARK_FOOTNOTE`)
- Create: `src/app/api/platform/settings/route.ts` (GET list, PUT upsert — whitelist key + validasi tipe)
- Create: `src/app/platform/settings/page.tsx` + `src/components/platform/SettingsForm.tsx`
- Modify: `PlatformSidebar.tsx` (entri “Settings”)
- Create test: `platformSettings.test.ts` + `settings/route.test.ts`

**Model:**
```prisma
model PlatformSetting {
  key       String   @id
  value     String   // JSON (string/bool/int sesuai key)
  updatedBy String?
  updatedAt DateTime @updatedAt
}
```
**Known keys (whitelist):** `platform_name` (string, default "PintaSend"), `watermark_footnote` (string), `allow_public_registration` (bool, default false — kendalikan halaman `/register`), `message_retention_default_days` (int 30..365, default 30). Catatan: `allow_public_registration=false` → route register mengembalikan 403 (opsional flag ke deprecation, karena provisioning tenant kini via platform admin).

- [x] **Step 1:** Failing test: getPlatformSetting default fallback; set + get round-trip; PUT whitelist key tak dikenal → 400; tipe salah → 400.
- [x] **Step 2:** Implementasi service + route.
- [x] **Step 3:** Update `watermark.ts` fallback + test watermark dengan setting (mock).
- [x] **Step 4:** UI settings + sidebar.
- [x] **Step 5:** `tsc` + test hijau → commit `feat(platform): global settings (nama platform, watermark footnote, register, retention default)`

---

### Task 10: Model PlatformBroadcast + service

**Files:**
- Modify: `prisma/schema.prisma` + `pintasend-schema.sql`; Create `prisma/migrations/2026-09-04-platform-broadcast.sql`
- Create: `src/lib/platformBroadcast.ts` + test `platformBroadcast.test.ts`

**Model (Neon):**
```prisma
model PlatformBroadcast {
  id          String   @id @default(uuid(7))
  name        String
  messageBody String
  status      String   @default("draft") // draft | running | completed | failed | cancelled
  targetMode  String   @default("ready_devices") // ready_devices = semua device status ready milik tenant aktif
  tenantIds   String   @default("[]") // JSON array — optional filter bila targetMode=tenant_ids
  createdBy   String?  // actor email
  scheduledAt DateTime?
  startedAt   DateTime?
  completedAt DateTime?
  failReason  String?
  totalJobs   Int      @default(0)
  sentCount   Int      @default(0)
  failedCount Int      @default(0)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt @default(now())
  jobs        PlatformBroadcastJob[]
}

model PlatformBroadcastJob {
  id          String   @id @default(uuid(7))
  broadcastId String
  tenantId    String
  deviceId    String
  deviceLabel String?
  chatId      String? // tujuan (phone@c.us dari device) — diset saat dispatch
  status      String   @default("pending") // pending | sending | sent | failed | skipped
  error       String?
  messageId   String?
  attempts    Int      @default(0)
  nextAttemptAt DateTime? // backoff retry
  lockedAt    DateTime?  // klaim dispatcher (staleness recovery)
  sentAt      DateTime?
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt @default(now())
  broadcast   PlatformBroadcast @relation(fields: [broadcastId], references: [id], onDelete: Cascade)

  @@index([broadcastId, status])
  @@index([status, nextAttemptAt])
}
```

**Keputusan desain:** broadcast = pengumuman platform ke NOMOR pemilik perangkat (chatId dari `Device.phone`), bukan ke kontak tenant. Dispatcher terpisah (Task 11) mengambil job pending → kirim text via `openwa` → tulis `MessageLog` tenant tsb (watermark mengikuti kebijakan tenant). Tidak menyentuh campaign milik tenant (scope terpisah).

**Interfaces (Produces):**
```ts
export type BroadcastStatus = "draft" | "running" | "completed" | "failed" | "cancelled";
export async function createPlatformBroadcast(input: { name: string; messageBody: string; targetMode?: "ready_devices" | "tenant_ids"; tenantIds?: string[]; scheduledAt?: string | null }, actor: { email: string }): Promise<{ id: string }>;
export async function listPlatformBroadcasts(params: { page?: number; limit?: number }): Promise<{ items: PlatformBroadcastRow[]; total: number }>;
export async function getPlatformBroadcast(id: string): Promise<PlatformBroadcastDetail | null>; // + jobs summary by status
// Resolve perangkat target: device status=ready, tenant tidak suspended, phone terisi. Idempoten & snapshot ke jobs.
export async function startPlatformBroadcast(id: string): Promise<{ ok: boolean; reason?: string; jobs?: number }>;
export async function cancelPlatformBroadcast(id: string): Promise<{ ok: boolean; reason?: string }>;
export interface BroadcastSendTarget { jobId: string; tenantId: string; deviceId: string; chatId: string; }
// Dipakai worker dispatcher (Task 11): klaim batch pending (limit), dengan staleness recovery.
export async function claimPendingBroadcastJobs(limit?: number): Promise<BroadcastSendTarget[]>;
export async function markBroadcastJobSent(jobId: string, messageId: string | null): Promise<void>;
export async function markBroadcastJobFailed(jobId: string, error: string, retryAfterMs?: number): Promise<void>;
```

- [x] **Step 1:** Failing test service: create broadcast draft; start → jobs tersnap dari device ready (mock query); start broadcast yang bukan draft → ditolak; cancel running → ok.
- [x] **Step 2:** Jalankan → FAIL.
- [x] **Step 3:** Implementasi service (query Neon, uuidv7; reuse `logEvent` requestLogger).
- [x] **Step 4:** Migration SQL idempotent + `apply-schema`; test hijau + `tsc`.
- [x] **Step 5: Commit** `feat(broadcast): model + service platform broadcast (draft/start/cancel, job queue)`

---

### Task 11: Dispatcher worker platform broadcast + API

**Files:**
- Create: `workers/platform-broadcast/worker.js` (cron — tiru pola `workers/campaign-dispatch/` yang sudah ada: scheduled handler, claim batch, send, mark)
- Modify: `wrangler.jsonc` (tambah cron trigger `platform-broadcast`; cek konvensi cron campaign-dispatch di repo)
- Create: `src/app/api/platform/broadcasts/route.ts` (GET list, POST create)
- Create: `src/app/api/platform/broadcasts/[id]/route.ts` (GET detail, POST `{action: "start"|"cancel"}`)
- Create test: `src/app/api/platform/broadcasts/route.test.ts` + `platform-broadcast/worker.test.js` (kalau pola test worker campaign-dispatch ada — kalau tidak, cukup test pure helper send di service)
- Modify: `PlatformSidebar.tsx` + halaman `src/app/platform/broadcasts/page.tsx` + komponen `BroadcastTable.tsx` (create form, start/cancel, progress badge)

**Detail worker (pesan dikirim = watermark sesuai tenant):**
```js
export default { async scheduled(event, env, ctx) {
  ctx.waitUntil(handleBroadcastDispatch(env));
} };
async function handleBroadcastDispatch(env) {
  // 1. claim pending jobs (limit 20)
  // 2. untuk tiap job: openwa sendText({session: device, to: chatId, text})
  //    — text = messageBody (watermark tenant diterapkan di jalur MessageLog/watermark resolve)
  // 3. sukses → MessageLog(tenantId, deviceId, direction outgoing, status sent) + markBroadcastJobSent
  // 4. gagal → markBroadcastJobFailed(error, retry 30s/5m backoff; attempts max 3 → status failed final)
  // 5. bila totalJobs == sent+failed → broadcast status completed (atau failed bila failReason)
}
```

- [x] **Step 1:** Tulis worker mengikuti pola worker campaign-dispatch yang ada (baca dulu file tsb); pastikan binding env D1/KV sama.
- [x] **Step 2:** Route + test (401/403/400/200 + delegasi service mock).
- [x] **Step 3:** UI broadcast + sidebar.
- [x] **Step 4:** `tsc` + `npm test` hijau.
- [x] **Step 5: Commit** `feat(broadcast): dispatcher cron + API + UI broadcast platform`

---

### Task 12: Model Invoice + Plan.priceMonthly + service

**Files:**
- Modify: `prisma/schema.prisma` + `pintasend-schema.sql`; Create `prisma/migrations/2026-09-04-invoice.sql`
- Modify: `src/lib/platform.ts` (`PlanRow` + `priceMonthly`, `listPlans`/`updatePlan` — tambah kolom)
- Create: `src/lib/invoices.ts` + test `invoices.test.ts`

**Model:**
```prisma
model Invoice {
  id          String   @id @default(uuid(7))
  tenantId    String
  planId      String?
  planName    String
  priceMonthly Int?    // snapshot nominal saat terbit (Rp)
  periodStart DateTime // awal bulan tagihan
  periodEnd   DateTime // akhir bulan tagihan
  status      String   @default("issued") // issued | paid | void
  paidAt      DateTime?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt @default(now())

  @@unique([tenantId, periodStart])
  @@index([status, periodStart])
}
```
`Plan` tambah `priceMonthly Int?` (rupiah; null = gratis/tidak tertera). Catatan: invoice MVP = **registri tagihan simulasi** (belum integrasi payment gateway) — dokumentasikan eksplisit di halaman.

**Interfaces:**
```ts
export async function generateMonthlyInvoices(year: number, month: number): Promise<{ created: number; skipped: number }>;
// Hanya tenant dengan plan aktif (bukan suspended), snapshot nama + harga plan, periode 1..akhir bulan (WIB).
// Idempoten: tenant yang sudah punya invoice periode tsb di-skip.
export async function listInvoices(params: { tenantId?: string; status?: string; year?: number; month?: number; page?: number; limit?: number }): Promise<{ invoices: InvoiceRow[]; total: number }>;
export async function voidInvoice(id: string): Promise<{ ok: boolean; reason?: string }>;
export async function markInvoicePaid(id: string): Promise<{ ok: boolean; reason?: string }>;
export async function exportInvoicesCsv(params: {...}): Promise<string>; // helper pure, ter-test
```

- [x] **Step 1:** Failing test: generate bulan tertentu membuat invoice per tenant ber-plan (skip tenant tanpa plan/suspended, skip duplikat); void/mark paid transisi status valid; export CSV escape.
- [x] **Step 2:** Jalankan → FAIL.
- [x] **Step 3:** Implementasi service (periode WIB via helper tanggal — ikuti pola `monthStartWib` di `src/lib/quota.ts`; ekstrak ke util kecil `src/lib/monthPeriod.ts` agar reusable invoice/broadcast).
- [x] **Step 4:** Update `updatePlan` + route `plans/[id]` + UI `PlansTable` (kolom harga bulanan opsional) + migration.
- [x] **Step 5:** test hijau + `tsc` → commit `feat(invoice): model invoice + priceMonthly plan + generate/list/void/paid`

---

### Task 13: API + halaman platform Invoice

**Files:**
- Create: `src/app/api/platform/invoices/route.ts` (GET list), `src/app/api/platform/invoices/generate/route.ts` (POST `{year, month}`), `src/app/api/platform/invoices/[id]/route.ts` (POST `{action: "void"|"mark_paid"}`), `src/app/api/platform/invoices/export/route.ts` (GET CSV)
- Create: `src/app/platform/invoices/page.tsx` + `src/components/platform/InvoicesTable.tsx` (filter periode/status/tenant, tombol “Generate invoice bulan ini”, aksi void/paid, export CSV, badge status)
- Modify: `PlatformSidebar.tsx`
- Create test: `src/app/api/platform/invoices/route.test.ts` (401/403/200; generate idempoten; void/mark paid)

- [x] **Step 1:** Failing test route.
- [x] **Step 2:** Implementasi route (guard `platform_admin`, rate limit generate 10/mnt) + export.
- [x] **Step 3:** Halaman + tabel + sidebar.
- [x] **Step 4:** `tsc` + test hijau → commit `feat(platform): invoice API + halaman + generate + export`

---

### Task 14: Hardening keamanan lintas-route (sweep)

**Files (periksa & patch guard — jangan rombak total):**
- `src/app/api/admin/*` — semua route wajib guard `canManageTenantMembers(p, p.tenantId)` (bukan hanya `owner`); pastikan scope `tenantId` = `session.user.tenantId` untuk list/create/delete (TIDAK boleh menerima tenantId dari body/params untuk scope).
- `src/app/api/v1/*` — sudah `verifyApiKey` (D1); pastikan tidak ada route v1 yang memakai session NextAuth (harus API key).
- `src/middleware.ts` — pastikan `/dashboard` & `/platform` tetap require login; pertimbangkan menambah matcher `"/api/admin/:path*"` untuk membungkus guard (verifikasi dulu dampak Auth.js cookies — matcher saat ini sengaja tidak menyentuh `/api/auth`).
- Cek khusus: `src/app/api/admin/users/[id]/password/route.ts` (lintas-tenant reset password) & `api-keys/[id]` revoke (scope tenantId sudah benar?) — ini yang Task 4 sudah mulai tutup; pastikan lengkap.
- Tambahkan test regresi cross-tenant: mock session tenant A mencoba akses resource tenant B → 403/404 (bukan data bocor).

- [x] **Step 1:** Buat daftar audit singkat di komentar file `docs/security-hardening.md` (baru) — hasil per-file (guard lama → baru).
- [x] **Step 2:** Patch guard sesuai daftar; jaga pesan error konsisten (401/403).
- [x] **Step 3:** Test regresi cross-tenant (file `src/lib/security-regression.test.ts` menguji abac + satu route sampel per kategori).
- [x] **Step 4:** `tsc` + `npm test` + lint hijau → commit `fix(security): hardening guard admin/API lintas-tenant + regresi test`

---

### Task 15: Konsolidasi konstanta addon + kuota & entitlement

**Files:**
- Create: `src/lib/addonKeys.ts` (single source: `ADDON_KEYS = ["random_delay", "remove_watermark"] as const`, `type AddonKey`, plus map label/deskripsi)
- Modify: `src/app/api/platform/tenants/[id]/addons/route.ts` (hapus konstanta lokal `ADDON_KEYS` → impor dari addonKeys)
- Modify: `src/lib/watermarkAddon.ts`, `src/lib/watermark.ts`, `src/lib/campaigns.ts` (impor key dari addonKeys; hapus literal duplikat)
- Modify: `src/lib/quota.ts` — tambah `checkAddonEntitlement`? (opsional: biarkan quota existing; dokumentasikan bahwa grant addon tidak mengecek entitlement plan — catat sebagai decision)
- Create test: `src/lib/addonKeys.test.ts` (konsistensi: semua key yang dipakai module = subset ADDON_KEYS)

- [x] **Step 1:** Failing test konsistensi key (scan module yang memakai key; pastikan terdaftar).
- [x] **Step 2:** Implementasi addonKeys + refactor impor.
- [x] **Step 3:** `tsc` + test + lint hijau → commit `refactor(addon): konsolidasi konstanta addon keys satu sumber`

---

### Task 16: Docs + verifikasi akhir + smoke test

**Files:**
- Modify: `src/app/docs/api/page.tsx` (tambah section: member management API, audit, settings, broadcast, invoice; update matrix role)
- Modify: `README.md` (fitur baru + role matrix ringkas) — cek apakah ada table feature di README
- Modify: `docs/pintasend-fitur-review.md` (tandai gap yang sudah ditutup / masih open)
- Create: `docs/security-hardening.md` (dari Task 14)
- Update `docs/superpowers/plans/2026-09-04-platform-owner-superadmin.md` status checklist tiap task (centang selesai)

- [x] **Step 1:** Update docs API + README + review doc.
- [x] **Step 2:** Jalankan verifikasi penuh: `npx tsc --noEmit`, `npm test`, `npm run lint` — semua hijau (catat isu pra-ada terpisah).
- [x] **Step 3:** Smoke test lokal kalau bisa (bukan live production tanpa izin): jalankan `npm run dev`? Tidak wajib — cukup unit + typecheck; live test hanya bila user minta.
- [x] **Step 4:** Commit `docs: fitur platform owner/superadmin + audit + settings + broadcast + invoice`

---

## Definition of Done (seluruh fitur)

1. Role model 3 tier aktif di seluruh guard (`owner`/`tenant_admin`/`member` + `platform_admin`) via `src/lib/abac.ts` — tidak ada lagi guard duplikat `role !== "platform_admin"` di route baru.
2. Owner & tenant_admin bisa kelola member tenant sendiri (invite, list, ganti role, reset password, hapus) dari halaman `/dashboard/members` — dengan invariant (tidak hapus owner terakhir, tidak lintas-tenant).
3. Platform admin punya: Audit Log (lihat + filter + export CSV), Global Settings, Broadcast lintas-tenant (draft → running → completed), dan Invoice registri bulanan (generate + list + void/mark paid + export).
4. Semua mutasi kunci tercatat di `AuditLog` (actor, tenantId, action, meta, ip) — `recordAudit` never-throw.
5. Tidak ada regresi keamanan: guard lintas-route di-verifikasi + test regresi cross-tenant hijau.
6. `npx tsc --noEmit`, `npm test`, `npm run lint` hijau (isu pra-ada terdokumentasi terpisah).
7. Migration Neon idempotent (AuditLog, PlatformSetting, PlatformBroadcast/Job, Invoice, Plan.priceMonthly) sudah diterapkan dev & tercatat di `prisma/migrations/` + `pintasend-schema.sql`. D1 tidak berubah (tidak ada kolom auth/device baru).
8. Docs API & README diperbarui.

---

## Out of Scope (eksplisit TIDAK dikerjakan)

- Payment gateway nyata untuk invoice (registri simulasi saja; integrasi Midtrans/dll = proyek terpisah).
- Migrasi D1 untuk tabel baru (AuditLog/PlatformSetting/Broadcast/Invoice hanya Neon).
- Fitur WhatsApp baru level tenant (campaign/labels/media) — hanya guard & integrasi watermark yang disesuaikan.
- SSO/OAuth baru (jalur NalaNiaga SSO yang ada tetap).

## Catatan Keputusan (ADR ringkas)

1. **Role tetap string di DB, validasi di application layer** (`abac.ts`) — menghindari migrasi enum PostgreSQL & menjaga kompatibilitas data lama.
2. **AuditLog hanya Neon** — jalur admin frekuensi rendah; D1 tidak di-clone (konsisten ADR-9: D1 untuk hot path auth/device).
3. **Invoice = registri tanpa payment** — fokus MVP laporan pendapatan; billing otomatis & payment gateway ditandai sebagai iterasi berikutnya.
4. **Broadcast platform → nomor pemilik device** (bukan kontak tenant) — pesan operasional platform, bukan marketing massal; watermark tenant tetap dihormati.
5. **Owner tidak bisa create owner lain via invite member** — invariant satu owner per tenant dijaga; platform admin tetap bisa mengubah role via `/api/platform` bila perlu.
