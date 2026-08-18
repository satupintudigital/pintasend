# Desain: Random Delay Kirim Pesan (Anti-Spam) + Analitik Delay

Tanggal: 2026-08-18 · Status: **disetujui user (2026-08-18)**

## 1. Ringkasan

Menambahkan fitur **delay acak 3–10 detik sebelum kirim pesan keluar** untuk
mencegah deteksi spam oleh Meta/WhatsApp, dengan konfigurasi **per tenant**.

- Gratis untuk **plan termahal (Mocha)**; tenant di plan lain mendapatkannya
  melalui **addon** ("Random Delay") yang diberikan platform admin.
- Setiap pesan keluar mencatat **waktu trigger** (`triggeredAt`) dan **waktu
  kirim** (`sentAt`) — selisihnya adalah delay aktual yang disematkan, untuk
  kebutuhan analitik (memetakan kebiasaan kirim yang aman vs tidak aman bila
  terjadi razia besar-besaran dari Meta/WhatsApp).

Keputusan yang sudah dikonfirmasi user:

1. **Perilaku delay: sinkron** — `POST /v1/messages` menunggu 3–10 dtk, lalu
   kirim, lalu balas respons dengan `messageId` (tidak ada queue/infra baru).
2. **Rentang delay: tetap 3–10 detik** — tanpa opsi ubah rentang (YAGNI).
3. **Kontrol config: platform admin saja** — toggle on/off & grant/revoke addon
   dari halaman detail tenant; tenant hanya pemakai.

## 2. Model Data (Neon — source of truth)

Semua perubahan hanya Neon; **D1 tidak berubah** (config delay dibaca di jalur
kirim `v1/messages` yang sudah membaca Neon untuk kuota/device — bukan hot-path
auth).

### 2.1 `Plan` — kolom baru

```sql
ALTER TABLE "Plan" ADD COLUMN IF NOT EXISTS "includesDelay" BOOLEAN NOT NULL DEFAULT FALSE;
```

`includesDelay = TRUE` berarti plan menyertakan fitur delay **gratis**.
Seed: **Mocha** di-set `TRUE`; Espresso & Latte `FALSE`.

### 2.2 `Tenant` — kolom baru

```sql
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "delayEnabled" BOOLEAN NOT NULL DEFAULT FALSE;
```

Config per tenant (diatur platform admin). Default mati.

### 2.3 Tabel baru `TenantAddon`

```sql
CREATE TABLE IF NOT EXISTS "TenantAddon" (
  id         TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL REFERENCES "Tenant"(id) ON DELETE CASCADE,
  key        TEXT NOT NULL,
  active     BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE ("tenantId", key)
);
CREATE INDEX IF NOT EXISTS idx_tenantaddon_tenant ON "TenantAddon"("tenantId");
```

Addon pertama: `key = 'random_delay'`. Struktur ini extensible untuk addon
masa depan (cukup key baru, tanpa migrasi).

### 2.4 `MessageLog` — kolom baru

```sql
ALTER TABLE "MessageLog" ADD COLUMN IF NOT EXISTS "triggeredAt" TIMESTAMPTZ;
ALTER TABLE "MessageLog" ADD COLUMN IF NOT EXISTS "sentAt" TIMESTAMPTZ;
```

- `triggeredAt` — saat pesan di-trigger untuk dikirim (setelah semua validasi,
  tepat sebelum delay).
- `sentAt` — saat panggilan kirim ke OpenWA dilakukan (setelah delay).
- Delay aktual = `sentAt - triggeredAt`.
- Pesan **keluar**: selalu diisi (dengan atau tanpa delay; tanpa delay
  `triggeredAt ≈ sentAt`). Pesan **masuk**: `NULL` (tidak relevan).

## 3. Aturan Entitlement

Fitur delay **aktif** bila:

```
Tenant.delayEnabled = TRUE
  AND ( Plan.includesDelay = TRUE          -- plan menyertakan gratis
        OR TenantAddon('random_delay').active = TRUE )  -- addon dibeli/diberikan
```

Helper baru `src/lib/delay.ts`:

- `getTenantDelayInfo(tenantId)` — satu query Neon (join Tenant → Plan +
  EXISTS addon) → `{ enabled, entitled, active }` (1 round-trip).
- `randomDelayMs()` — pure function: `3000 + floor(random() * 7001)` →
  rentang 3.000–10.000 ms inklusif. Di-unit-test.
- `sleep(ms)` — `new Promise(r => setTimeout(r, ms))`.
- `DELAY_MIN_MS = 3000`, `DELAY_MAX_MS = 10000` sebagai konstanta.

## 4. Alur Kirim `POST /v1/messages` (sinkron)

Urutan setelah validasi yang ada (auth API key → kuota → rate limit → parse →
device ready):

1. Baca delay info tenant (`getTenantDelayInfo`).
2. Jika **aktif**:
   - `triggeredAt = new Date()` (sebelum delay).
   - `await sleep(randomDelayMs())`.
   - `sentAt = new Date()` (tepat sebelum panggil OpenWA).
   - Jika **tidak aktif**: `triggeredAt = sentAt = new Date()` (tanpa tidur).
3. Kirim ke OpenWA (`sendText`/`sendMedia`) seperti sekarang.
4. Catat `insertMessageLog({ ..., triggeredAt, sentAt })` — pada jalur sukses
   **dan** jalur gagal (`failed`), memakai timestamp yang sama.
5. Respons sukses tetap sama, ditambah `delayMs` aktual (bulat) hanya bila
   delay diterapkan.

Catatan desain:

- Kuota & rate limit dihitung **saat trigger** (sebelum delay). Window 3–10 dtk
  membuat risiko over-quota akibat in-flight negligible; dikomentari di kode.
- Kegagalan `insertMessageLog` tetap best-effort (tidak memengaruhi respons),
  mengikuti konvensi existing.

## 5. Platform Admin UI

### 5.1 Halaman `/platform/plans` — `PlansTable.tsx`

- Kolom toggle baru **"Delay"** per plan (mengedit `includesDelay`).
- `PUT /api/platform/plans/[id]` menerima field `includesDelay`; `updatePlan`
  di `src/lib/platform.ts` diperluas (`PlanPatch.includesDelay`).
- `PlanRow` menyertakan `includesDelay`.

### 5.2 Halaman `/platform/tenants/[id]` — `TenantDetailPanel.tsx`

Kartu baru **"Random Delay (Anti-Spam)"** berisi:

- Status entitlement: `Termasuk plan (Mocha)` / `Addon aktif` / `Belum tersedia`.
- Toggle **on/off** config tenant (`delayEnabled`) — disabled bila tidak
  entitled (dengan hint: berikan addon dulu).
- Tombol **grant/revoke addon** `random_delay`.
- Info statis: "Delay acak 3–10 detik sebelum kirim pesan keluar. Waktu
  trigger & kirim tercatat di riwayat pesan untuk analitik."

### 5.3 API platform baru

- `POST /api/platform/tenants/[id]/delay` — body `{ enabled: boolean }` →
  set `Tenant.delayEnabled`.
- `POST /api/platform/tenants/[id]/addons` — body `{ key, active }` →
  upsert baris `TenantAddon` (grant/revoke). Validasi `key === 'random_delay'`
  (whitelist) agar tidak ada addon arbitrer.

### 5.4 `getTenantDetail` (lib/platform.ts)

Menambahkan `delayEnabled` (dari Tenant) dan `delayAddonActive` (EXISTS
TenantAddon) ke `TenantDetailRow` — dipakai panel.

### 5.5 Tabel tenant (`TenantTable.tsx`)

Badge kecil "delay" pada baris tenant yang `delayEnabled` aktif (opsional tapi
murah — `listTenants` ditambah kolom `delayEnabled`).

## 6. Dashboard Tenant — Riwayat Pesan (Analitik)

- `GET /api/messages` & `MessageLogRow` mengekspos `triggeredAt` & `sentAt`.
- `MessageHistoryPanel.tsx`: untuk pesan **keluar**, tampilkan chip
  `delay X dtk` bila `sentAt - triggeredAt >= 1 detik`; `title` tooltip
  menampilkan waktu trigger & waktu kirim lengkap.
- Pesan masuk tidak menampilkan chip.

## 7. Dokumentasi

- `src/app/docs/api/page.tsx` — bagian baru "Random delay (anti-spam)":
  perilaku sinkron 3–10 dtk, hak akses (gratis di Mocha / addon), dan kolom
  analitik `triggeredAt`/`sentAt` di riwayat pesan.

## 8. File yang Berubah

| File | Perubahan |
|---|---|
| `prisma/migrations/2026-08-18-message-delay.sql` | **baru** — DDL §2 |
| `prisma/schema.prisma` | Plan.includesDelay, Tenant.delayEnabled, model TenantAddon, MessageLog.triggeredAt/sentAt |
| `prisma/seed.ts` | Mocha `includesDelay: true` |
| `src/lib/delay.ts` | **baru** — getTenantDelayInfo, randomDelayMs, sleep, konstanta |
| `src/lib/messageStore.ts` | input & INSERT `triggeredAt`/`sentAt`; `MessageLogRow` + `MESSAGE_COLUMNS` |
| `src/lib/platform.ts` | PlanRow.includesDelay, PlanPatch.includesDelay, updatePlan, TenantDetailRow/TenantListRow + delayEnabled/delayAddonActive, listTenants/getTenantDetail |
| `src/app/v1/messages/route.ts` | logika delay §4 + `delayMs` di respons |
| `src/app/api/messages/route.ts` | otomatis mengikuti messageStore (tanpa perubahan manual bila kolom dipilih via MESSAGE_COLUMNS) |
| `src/app/api/platform/plans/[id]/route.ts` | terima `includesDelay` |
| `src/app/api/platform/tenants/[id]/delay/route.ts` | **baru** |
| `src/app/api/platform/tenants/[id]/addons/route.ts` | **baru** |
| `src/components/platform/PlansTable.tsx` | kolom toggle Delay |
| `src/components/platform/TenantDetailPanel.tsx` | kartu Random Delay + addon |
| `src/components/platform/TenantTable.tsx` | badge delay |
| `src/components/dashboard/MessageHistoryPanel.tsx` | chip delay + tooltip |
| `src/app/docs/api/page.tsx` | dokumentasi |
| `src/lib/delay.test.ts` | **baru** — unit test |

## 9. Testing

1. **Unit test** `delay.test.ts`:
   - `randomDelayMs()` selalu dalam [3000, 10000] (loop + boundary).
   - Logika entitlement (plan includes / addon aktif / kombinasi) bila
     diekstrak sebagai pure function.
2. **Typecheck**: `npx tsc --noEmit` (atau per project) + **lint**: `npm run
   lint` + **test**: `npm test` (vitest).

## 10. Batas & Non-Tujuan

- Tidak ada queue/job; delay hanya di jalur sinkron `POST /v1/messages`.
- Tidak ada config rentang per tenant (tetap 3–10 dtk).
- Tidak ada UI di dashboard tenant untuk mengubah config (admin saja).
- Tidak mengubah D1 (`verifyApiKey`/login tidak terpengaruh).
