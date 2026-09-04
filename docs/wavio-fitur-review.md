# Wavio — Review Fitur & Role (Owner vs Platform Admin)

Dibuat: 2026-09-04
Status: **review manual + live DB check**

---

## Ringkasan Eksekutif

| Pertanyaan | Jawaban |
|---|---|
| Owner (`owner@wavio.test`) punya fitur lengkap? | **Ya — hampir lengkap.** Dari register tenant sendiri, device (WhatsApp session), message CRUD, contacts, campaigns, labels, webhooks, addon self-service, template, dsb. |
| Ada user superadmin yang kelola platform? | **Ya — tersedia.** `platform@wavio.test` (role `platform_admin`) adalah platform admin Wavio. Halaman `/platform/*` + API `/api/platform/*`. |
| Perbedaan akses owner vs platform admin? | Owner = tenant-scoped (hanyalihat & kelola tenant-nya sendiri). Platform admin = lintas-tenant (buat/aktifkan/nonaktifkan tenant, atur plan, kendalikan user tenant, retention approval, dsb). |

---

## 1. Apa yang TERSEDIA untuk Owner (`owner@wavio.test`)

Owner = pengguna dengan `role = "owner"` milik satu tenant.

### 1.1 Provisioning awal (daftar akun)
- Halaman `/register` → owner membuat **tenant + user owner sekaligus** (`createUserWithTenant`).
- Tiap owner punya tepat **satu tenant** (bukan lintas-tenant).
- Owner bisa **tambah member** lewat halaman platform? — **tidak**, member ditambah dari dashboard tenant? (cek route tenant user).

### 1.2 Dashboard Owner (tenant-scoped)
- **Device / WhatsApp session**: daftar device, status, phone, restriction, hapus, start, logout, profile, channels.
- **Messages**: kirim (text, media, location, poll, reply, forward, react, pin, star, edit, delete), history per chat, batch send, contact lookup, send-template.
- **Contacts**: daftar, block/unblock, check nomor (`/v1/contacts/check/[number]`).
- **Groups**: list groups.
- **Labels**: buat, sync ke OpenWA, assign contact, bulk chat.
- **Campaigns**: draft, schedule, start, pause, lihat progress.
- **Webhooks**: register URL + secret, pilih event, smart filters, test delivery, lihat outbox/delivery status.
- **Addon self-service**: toggle `remove_watermark` (`/v1/addons/remove-watermark`).
- **Retention requests**: buat permohonan perpanjangan retensi pesan (approval oleh platform admin).
- **Watermark**: footnote iklan platform otomatis (kecuali addon remove_watermark aktif).

### 1.3 API v1 (owner scope)
Endpoint berikut tersedia (tenant-scoped, pakai API key):

**Messages**
- `POST /v1/messages` — kirim pesan
- `GET /v1/messages` — daftar pesan
- `GET /v1/messages/[chatId]/history` — history chat
- `POST /v1/messages/[chatId]/...` — reply, forward, pin, star, react, edit, delete, location, poll
- `POST /v1/messages/send-bulk` — batch
- `POST /v1/messages/send-template` — kirim template (watermark terintegrasi)
- `POST /v1/messages/contact` — lookup contact
- `POST /v1/messages/batch/[batchId]/...` — status batch
- `POST /v1/messages/delete` — hapus pesan

**Chats**
- `GET /v1/chats/list` — daftar chat
- `POST /v1/chats/archive` — arsip
- `POST /v1/chats/clear` — clear
- `POST /v1/chats/delete` — hapus chat
- `POST /v1/chats/mute` — mute
- `POST /v1/chats/pin` — pin
- `POST /v1/chats/read` — mark read
- `POST /v1/chats/typing` — typing indicator

**Contacts**
- `GET /v1/contacts` — daftar
- `GET /v1/contacts/[id]` — detail
- `POST /v1/contacts/[id]/block` — block/unblock
- `GET /v1/contacts/check/[number]` — cek nomor sebelum kirim

**Devices**
- `GET /v1/devices/[deviceId]/...` — channels, config, pairing-code, presence, profile, profile/picture, logout, start
- `GET /v1/devices/[deviceId]/presence` — presence
- `GET /v1/devices/[deviceId]/presence/subscribe` — subscribe presence

**Groups**
- `GET /v1/groups` — list group

**Labels**
- `GET /v1/labels` — daftar
- `GET /v1/labels/[labelId]` — detail
- `GET /v1/labels/[labelId]/chats` — chats
- `POST /v1/labels/[labelId]/chats/bulk` — assign bulk

**Campaigns**
- `GET /v1/campaigns` — daftar
- `GET /v1/campaigns/[id]` — detail
- `POST /v1/campaigns/[id]/[action]` — start/pause/etc.

**Retention**
- `POST /v1/retention-requests` — buat permintaan

**Addons**
- `GET/POST /v1/addons/remove-watermark` — self-service toggle

**Admin internal (owner juga bisa, tapi tenant-scoped)**
- `GET /api/admin/api-keys` — daftar API key milik tenant
- `POST /api/admin/api-keys/[id]/revoke` — cabut API key
- `GET /api/admin/users` — daftar user tenant (owner + member)
- `PUT /api/admin/users/[id]/password` — reset password user

---

## 2. Apa yang TERSEDIA untuk Platform Admin (`platform@wavio.test`)

Platform admin = role `platform_admin`, tenantId = `00000000-0000-7000-8000-000000000002` ("Wavio Platform").

### 2.1 Halaman platform (`/platform/*`)
- `/platform` — dashboard ringkasan
- `/platform/tenants` — daftar semua tenant
- `/platform/tenants/[id]` — detail satu tenant
- `/platform/tenants/new` — provision tenant baru
- `/platform/plans` — edit kuota plan (maxDevices, maxUsers, maxMessagesPerMonth, includesDelay)
- `/platform/metrics` — metrik lintas tenant

### 2.2 API platform (`/api/platform/*`)

**Tenants (provisioning & lifecycle)**
- `POST /api/platform/tenants` — buat tenant baru (+ owner user-nya)
- `GET /api/platform/tenants` — daftar semua tenant
- `GET /api/platform/tenants/[id]` — detail
- `GET /api/platform/tenants/[id]/status` — status tenant
- `PUT /api/platform/tenants/[id]/status` — aktif/nonaktifkan tenant (suspended)
- `GET /api/platform/tenants/[id]/plan` — plan tenant
- `PUT /api/platform/tenants/[id]/plan` — ganti plan
- `GET /api/platform/tenants/[id]/delay` — config random delay
- `PUT /api/platform/tenants/[id]/delay` — toggle delay
- `GET /api/platform/tenants/[id]/addons` — addon tenant
- `GET /api/platform/tenants/[id]/users` — daftar user tenant
- `PUT /api/platform/tenants/[id]/users/[userId]/password` — reset password user (platform admin)
- `GET /api/platform/tenants/[id]/retention` — retention requests
- `POST /api/platform/tenants/[id]/retention` — buat/approve/reject retention request

**Plans**
- `GET /api/platform/plans` — daftar semua plan
- `GET /api/platform/plans/[id]` — detail
- `PUT /api/platform/plans/[id]` — edit kuota plan

**Metrics**
- `GET /api/platform/metrics` — agregasi lintas tenant

### 2.3 API admin internal (platform-admin-scoped)
- `GET /api/admin/users` — daftar semua user (lintas tenant) — **gunakan dengan hati-hati**
- `GET /api/admin/api-keys` — daftar semua API key (lintas tenant)

---

## 3. GAP — Yang Kurang atau Perlu Diperjelas

> Status: ditindaklanjuti oleh plan `2026-09-04-platform-owner-superadmin.md` —
> gap 3.1–3.4 ditutup (lihat bagian 4).

### 3.1 Member management (owner side) — ✅ DITUTUP (Task 3–5)
- Owner & tenant_admin kini bisa mengundang/mengelola member tenant sendiri:
  `POST/PATCH/DELETE /api/admin/users` (+ `[id]/password`) yang tenant-scoped
  (scope dari sesi, bukan body), halaman `/dashboard/members`. Role baru
  `tenant_admin` (hierarki member < tenant_admin < owner < platform_admin).

### 3.2 Platform admin — ✅ DITUTUP (Task 6–13)
- **Audit log lintas-tenant** — model `AuditLog` + `recordAudit` (13 titik mutasi
  ter-instrumentasi) + halaman/API `/platform/audit` + export CSV.
- **Platform broadcast** — `PlatformBroadcast` + worker dispatcher + halaman
  `/platform/broadcasts` (pengumuman ke pemilik perangkat, watermark tenant dihormati).
- **Invoice** — model `Invoice` + `Plan.priceMonthly`, generate bulanan (WIB),
  void/mark-paid, export CSV, halaman `/platform/invoices`. (Registri simulasi,
  tanpa payment gateway.)
- **Global settings** — `PlatformSetting` (nama platform, footnote watermark,
  register, retensi default) + halaman `/platform/settings`.
- **Menu/view** — sidebar platform kini: Ringkasan, Metrik, Plan, Tenant,
  Broadcast, Invoice, Audit, Pengaturan.

### 3.3 User management cross-tenant — ✅ AMAN
- `/api/admin/*` kini tenant-scoped penuh: hanya member tenant sendiri (guard
  `canManageTenantMembers(p, p.tenantId)`); jalur lintas-tenant hanya
  `platform_admin` via `/api/platform/*`. Test regresi cross-tenant ada di
  `src/lib/security-regression.test.ts`.

### 3.4 Security check — ✅ DITUTUP (Task 14)
- Seluruh guard route `admin/*` divalidasi + patch ke `canManageTenantMembers`
  (owner & tenant_admin). Lihat `docs/security-hardening.md` untuk hasil audit
  per file.

---

## 4. Checklist Owner Fitur (by kategori)

### Account & Auth
- [x] Register → buat tenant + owner user
- [x] Login (credentials + JWT session)
- [x] Reset password (owner sendiri via /api/admin/users/[id]/password)
- [x] Add member user ke tenant (owner & tenant_admin via /dashboard/members)

### Device / WhatsApp
- [x] Buat device (pairing session OpenWA)
- [x] Daftar device + status
- [x] Start/stop device
- [x] Lihat phone, status, restriction
- [x] Logout device
- [x] Hapus device
- [x] Lihat channels, profile, presence
- [x] Pairing code

### Messages
- [x] Kirim text
- [x] Kirim media (image, video, document, audio)
- [x] Kirim location
- [x] Kirim poll
- [x] Reply
- [x] Forward
- [x] Pin/unpin
- [x] Star/unstar
- [x] React (emoji reaction)
- [x] Edit pesan
- [x] Hapus pesan
- [x] Batch send
- [x] Send template
- [x] Contact lookup
- [x] History per chat

### Contacts
- [x] Daftar kontak
- [x] Block / unblock
- [x] Cek nomor sebelum kirim (`/v1/contacts/check/[number]`)

### Groups
- [x] List groups

### Labels
- [x] Buat label
- [x] Sync ke OpenWA
- [x] Assign chat ke label (manual + bulk)

### Campaigns
- [x] Buat campaign (draft)
- [x] Schedule campaign
- [x] Start / pause
- [x] Lihat progress (sent/failed/skipped)

### Webhooks
- [x] Register webhook URL + HMAC secret
- [x] Pilih event (message.received, session.status, dll.)
- [x] Smart filters (sender, body, type, dst.)
- [x] Test delivery
- [x] Lihat outbox + delivery status (pending/delivered/failed)

### Addon
- [x] Self-service toggle `remove_watermark`

### Retention
- [x] Buat retention request
- [x] Platform admin approve/reject

### Watermark
- [x] Footnote otomatis ke pesan keluar (jika addon tidak aktif)
- [x] Badge di riwayat pesan
- [x] Daftar log pesan tercetak watermark

### Report
- [x] Halaman `/report` (summary)

---

## 5. Checklist Platform Admin (superadmin) Fitur

### Tenant provisioning & lifecycle
- [x] Buat tenant baru
- [x] Lihat daftar semua tenant
- [x] Lihat detail tenant
- [x] Nonaktifkan/aktifkan tenant (suspended)
- [x] Ganti plan tenant

### Plan management
- [x] Lihat semua plan
- [x] Edit kuota plan (maxDevices, maxUsers, maxMessagesPerMonth, includesDelay)

### Tenant config
- [x] Toggle random delay per tenant
- [x] Lihat/manage addon tenant
- [x] Reset password user tenant
- [x] Lihat daftar user tenant

### Retention approval
- [x] Lihat retention request tenant
- [x] Approve/reject

### Metrics
- [x] Laporan metrik lintas tenant

### User management (lintas-tenant)
- [x] Daftar user & API key tenant sendiri (`/api/admin/*`, tenant-scoped) — guard terverifikasi
- [x] Jalur lintas-tenant eksklusif platform_admin via `/api/platform/*`

### Kekurangan platform admin — ✅ DITUTUP
- [x] Audit log lintas-tenant (+ export CSV)
- [x] Billing/invoice (registri simulasi bulanan)
- [x] Global platform settings
- [x] Platform broadcast (worker dispatcher)
- [x] Halaman dashboard platform yang kaya (8 menu)

---

## 6. Temuan Keamanan

1. **`/api/admin/users` dan `/api/admin/api-keys`** — harus dipastikan hanya `platform_admin` yang bisa akses.Kalau owner biasa bisa akses,itu kebocoran data lintas-tenant.
2. **`/api/platform/*`** — kemungkinan sudah dilindungi oleh middleware auth + possibly admin guard, tapi perlu verifikasi.
3. **`/api/v1/*`** — harus tenant-scoped (API key → tenantId). Rate limit per key. Sudah tercantum di `verifyApiKey`.
4. **D1 replika** — auth & device dibaca dari D1 (bukan Neon). Kalau D1 stale, verdiktik. Re-sync job tersedia.
5. **`platform@wavio.test`** bisa login dengan credentials biasa. Pastikan password hash terkelola (bcrypt). Sudah terlibak di auth.ts.

---

## 7. Rekomendasi

- **Untuk owner@wavio.test**: fitur WebSocket/WhatsApp messaging sudah cukup lengkap. Tambahkan member management (add/remove member di tenant) jika owner butuh multi-user di satu tenant.
- **Untuk superadmin platform**: ada, tapi fiturnya terbatas ke tenant lifecycle, plan, delay, retention approval, dan metrics. Kalau butuh audit log, billing, atau global broadcast, itu perlu ditambahkan.
- **Untuk keamanan**: verifikasi `/api/admin/users` dan `/api/admin/api-keys` hanya accessible by `platform_admin`.

---

*Review berdasarkan kode Wavio (branch `feat/wavio-fase-4`) + live DB check (3 tenant, 3 user termasuk platform_admin).*
