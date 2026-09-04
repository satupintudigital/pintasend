# Wavio — Self-Serve Billing & Katalog Produk (Design Spec)

Dibuat: 2026-09-04
Status: **draft untuk review** — menutup gap "paket/produk untuk dijual ke user" (lanjutan
platform owner/superadmin; catatan plan lama: *payment gateway nyata = proyek terpisah*).

> **For agentic workers:** setelah spec disetujui, susun implementation plan (writing-plans)
> lalu eksekusi TDD per task (pola SDD `.superpowers/sdd/...`) di worktree fitur.

---

## 1. Latar & Gap

Saat ini Wavio **belum bisa menjual** paket ke user secara mandiri:

- Landing `src/components/landing/Pricing.tsx` menampilkan harga **hardcoded**
  (Espresso Rp400/pesan, Latte Rp150rb/bln 500 pesan, Mocha Rp300rb/bln unlimited,
  addon Random Delay Rp25rb/bln, biaya aktivasi Rp350rb). Semua CTA → `#mulai`
  (tanpa mekanisme beli).
- Tenant **hanya dibuat oleh platform admin** (`POST /api/platform/tenants`); tidak ada
  registrasi publik.
- Tidak ada checkout/payment gateway. `Invoice` adalah **registri simulasi** (platform
  admin terbitkan manual, tandai paid/void). Catatan di plan
  `docs/superpowers/plans/2026-09-04-platform-owner-superadmin.md`: integrasi gateway =
  proyek terpisah (ini proyeknya).
- Addon (`remove_watermark`, `random_delay`, `campaign`) hanya di-grant manual oleh
  platform admin; tanpa harga katalog. `src/lib/addonKeys.ts` = single source key.
- Plan DB (`prisma/schema.prisma`) **sudah identik** dengan marketing:
  `Espresso` (kuota null = per-pesan), `Latte` (500/bln), `Mocha` (unlimited,
  `includesDelay=true`); punya `priceDisplay`, `priceMonthly`.

**Tujuan:** user bisa mandiri — daftar → pilih paket/addon → bayar online (Tripay) →
tenant aktif otomatis; tenant berlangganan membayar invoice bulanan via link; paket
per-pesan (Espresso) prepaid.

### Keputusan (hasil brainstorm 2026-09-04)

| Keputusan | Nilai |
|---|---|
| Alur | **Self-serve penuh, online payment**, tanpa trial (bayar untuk aktif) |
| Gateway | **Tripay** (closed payment; sandbox dulu) |
| Tagihan bulanan | **Invoice bulanan + bayar manual via link** (VA/QRIS/e-wallet), tanpa auto-charge |
| Espresso | **Prepaid (pulsa pesan top-up)** — terbayar dulu, potong per kirim sukses |
| Katalog | **Dinamis dari DB** (Plan + harga addon + biaya aktivasi + rate per-pesan) |
| Cakupan produk | Paket berbayar · addon (bundle di checkout pertama **dan** mandiri kapan saja) · biaya aktivasi Rp350rb **khusus paket bulanan** (Espresso tanpa aktivasi) |
| Perpanjangan | Lazy: saat periode aktif habis, sistem terbitkan renewal order + invoice (tampil di dashboard; tak ada auto-charge) |

---

## 2. Arsitektur

```
Landing /register /checkout /dashboard/langganan  (Next.js app, OpenNext Worker)
   │
   ├─ /api/public/catalog        → Plan aktif + Addon aktif + PlatformSetting harga
   ├─ /api/auth/register         → create Tenant(pending) + User(owner)  [publik]
   ├─ /api/billing/orders        → buat Order + transaksi Tripay closed payment
   ├─ /api/billing/orders/:id    → detail + status (polling client)
   ├─ /api/billing/tripay/callback  ← Tripay webhook (HMAC verify, idempoten)
   ├─ /api/billing/sync          → resync manual (platform admin) bila callback terlewat
   │
   └─ lib/payments.ts (interface) ── lib/providers/tripay.ts (implementasi)
        createPayment(order) → { checkoutUrl | payCode }
        verifyCallback(req)  → { orderRef, status }
        status(orderRef)     → Tripay cek status (fallback polling)

Service inti (lib/, raw SQL @neondatabase/serverless — pola repo):
   billing.ts        — create order + hitung item/snapshot + finalisasi paid/expired
   billingRenewal.ts — deteksi periode habis → terbitkan renewal Order + Invoice
   credit.ts         — saldo pesan (baca, top-up, potong idempoten, ledger)
   catalog.ts        — baca katalog publik (Plan/Addon/PlatformSetting)
```

**Prinsip:** Order-centric + snapshot. `Order` = instrument pembayaran; `Invoice` tetap
registri bulanan (ledger). Provider gateway dipisah via interface → tidak mengunci ke
Tripay. Gate tenant baru = kolom `activatedAt` (login & API key menolak saat NULL) —
diff kecil, memakai gate suspensi yang sudah ada (`suspendedAt`).

---

## 3. Skema (migration `prisma/migrations/2026-09-04-self-serve-billing.sql`)

Semua idempotent (`IF NOT EXISTS` / guard), pola migration repo. Nama Prisma PascalCase.

**a. `Plan` — kolom baru**
- `isPublic Boolean NOT NULL DEFAULT true` — tampil di katalog publik.
- `sortOrder Int NOT NULL DEFAULT 0` — urutan landing.
- (tidak mengubah `priceDisplay`/`priceMonthly`; UI platform/plans menambah input
  `sortOrder`+`isPublic` — lihat §9.)

**b. `Addon` (baru) — katalog addon berbayar**
```sql
CREATE TABLE "Addon" (
  id TEXT PRIMARY KEY,            -- uuidv7 app-side
  key TEXT NOT NULL UNIQUE,       -- dari addonKeys.ts: remove_watermark|random_delay|campaign
  name TEXT NOT NULL,
  tagline TEXT NOT NULL DEFAULT '',
  priceMonthly INT,               -- Rp/bulan; NULL = tidak dijual terpisah (internal-only)
  isActive BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);
```
Seed: 3 key dikenal; `random_delay` Rp25.000 (harga landing), `remove_watermark` &
`campaign` harga diisi platform admin (default NULL = internal). Boleh ada addon non-jual.

**c. `Tenant` — kolom baru**
- `activatedAt TIMESTAMPTZ` (NULL = pending, belum pernah lunas).
- Backfill: `UPDATE "Tenant" SET "activatedAt" = "createdAt" WHERE "activatedAt" IS NULL;`
  (tenant hasil provisioning/platform = aktif semua; tidak ada yang ter-lock-out).
- `status` lama (`suspendedAt`) TIDAK diubah semantiknya — suspensi admin tetap.

**d. `Order` (baru)**
```sql
CREATE TABLE "Order" (
  id TEXT PRIMARY KEY,              -- uuidv7; dipakai sbg merchant_ref Tripay
  "tenantId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,           -- owner yang checkout (untuk tenant lama: owner saat itu)
  kind TEXT NOT NULL,               -- first_subscription|renewal_subscription|addon|topup
  status TEXT NOT NULL DEFAULT 'pending',  -- pending|paid|expired|cancelled
  "invoiceId" TEXT,                 -- tautan ke Invoice (renewal & addon bulanan? lihat catatan)
  "planId" TEXT,                    -- plan yg dibeli (first/renewal)
  "addonKey" TEXT,                  -- addon yg dibeli (kind=addon)
  amount INT NOT NULL,              -- total Rp (snapshot, tanpa fee gateway)
  "itemsJson" TEXT NOT NULL,        -- [{type:'plan'|'activation'|'addon'|'credit', refId?, name, qty, unitPrice}]
  "periodStart" TIMESTAMPTZ,        -- periode yg dibayar (first/renewal bulanan)
  "periodEnd" TIMESTAMPTZ,
  "creditMessages" INT,             -- jumlah pesan dibeli (kind=topup)
  "gateway" TEXT NOT NULL DEFAULT 'tripay',
  "gatewayRef" TEXT,                -- reference Tripay (T...) setelah create
  "payCode" TEXT,                   -- kode bayar/VA (direct channel)
  "checkoutUrl" TEXT,               -- utk channel redirect (DANA/OVO/ShopeePay)
  "payMethod" TEXT,                 -- channel: QRIS2|BRIVA|BCAVA|...
  "expiresAt" TIMESTAMPTZ,
  "paidAt" TIMESTAMPTZ,
  "callbackRaw" TEXT,               -- payload callback terakhir (audit)
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_order_tenant ON "Order"("tenantId", "createdAt" DESC);
CREATE INDEX idx_order_status ON "Order"(status, "expiresAt");
CREATE INDEX idx_order_invoice ON "Order"("invoiceId");
```
Catatan: `Order` milik tenant; `userId` = eksekutor (untuk tenant yang dibeli saat masih
pending oleh owner yang baru register — user.id = owner). Tripay `merchant_ref` unik =
`order.id` (uuid) → callback & status check mudah, tanpa collision antar mode.

**e. `TenantBalance` + `CreditLedger` (baru) — pulsa pesan Espresso**
```sql
CREATE TABLE "TenantBalance" (
  "tenantId" TEXT PRIMARY KEY,
  balance INT NOT NULL DEFAULT 0,   -- sisa pesan prepaid
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE "CreditLedger" (
  id TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "orderId" TEXT,                   -- top-up yg mendanai
  delta INT NOT NULL,               -- +n (top-up) / -n (pakai)
  reason TEXT NOT NULL,             -- 'topup'|'send'|'adjust'
  "refId" TEXT,                     -- messageId / batch id utk idempotensi potong
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_creditledger_tenant ON "CreditLedger"("tenantId", "createdAt" DESC);
CREATE UNIQUE INDEX idx_creditledger_ref ON "CreditLedger"("refId") WHERE "refId" IS NOT NULL;
```

**f. `Invoice` — kolom baru (opsional kecil)**
- `orderId TEXT` (nullable, backfill tidak perlu) — invoice renewal yang sudah punya
  Order menunjuk balik untuk traceability.
  (Alternatif dibahas di §10 catatan — keputusan: Order.invoiceId cukup; kolom ini
  SKIP agar tidak redundan. Trace via Order.invoiceId.)

> Catatan keputusan: cukup `Order.invoiceId` (satu arah); tidak menambah Invoice.orderId.

---

## 4. Service `src/lib/`

### 4.1 `catalog.ts`
- `getPublicCatalog()`: Plan aktif (`isActive && isPublic`) + Addon aktif + harga
  PlatformSetting: `activation_fee_rp` (350.000), `credit_price_per_message` (400),
  `credit_min_topup_rp` (20.000), `credit_min_topup_messages` (opsional).
- Dipakai endpoint publik & (sebagian) halaman checkout. Cache TTL 60 dtk (pola
  `platformSettings`/`tenantConfig`), hot-read aman.

### 4.2 `billing.ts` — jantung order
Fungsi (TDD penuh):
- `createOrder(tenant, user, items): Order` — validasi katalog (plan aktif, addon aktif,
  harga snapshot), hitung `amount`, simpan pending, panggil `payments.createPayment`,
  simpan gatewayRef/payCode/checkoutUrl/expiresAt (default 24 jam, PlatformSetting
  `order_expiry_minutes`). Idempoten: bila ada order pending sejenis yg belum kedaluwarsa
  utk periode sama → tolak dengan pesan "sudah ada tagihan menunggu bayar".
- `getOrder(id, tenantId)`.
- `expireStaleOrders()` — pending > expiresAt → expired (dipanggil lazy + sync admin).
- `finalizePaidOrder(order, paymentInfo)` — **transaksional & idempoten** (guard
  `status='pending'` → `paid`): terapkan efek sesuai `kind`:
  - `first_subscription`: `Tenant.activatedAt=now()` (jika masih NULL), assign
    `planId`+`planAssignedAt=now()`, set `planPeriodEnd` (akhir bulan berjalan WIB),
    aktifkan addon dalam item (`TenantAddon` upsert active + `activeUntil` akhir bulan
    berjalan). Lepas suspensi manual tidak dilakukan otomatis (suspensi admin tetap
    mengharuskan admin).
  - `renewal_subscription`: assign planId (sama), `planPeriodEnd` lanjut 1 bulan dari
    akhir periode lama, & tandai Invoice terkait `paid` (`paidAt=now()`). Kolom periode:
    lihat §5.
  - `addon`: grant addon (upsert active).
  - `topup`: `TenantBalance.balance += creditMessages` + `CreditLedger(+)`.
  - Selalu: AuditLog (`audit.record` pola ada) action `billing.order.paid` + kirim email
    invoice lunas (Resend `sendEmail` — reuse).
- Transaksi: pakai satu koneksi Neon + `BEGIN/COMMIT`/rollback manual (pola repo tidak
  memakai ORM runtime).

### 4.3 `billingRenewal.ts`
- `ensureCurrentPeriod(tenant, now)`: tenant plan bulanan aktif (non-Espresso) &
  periode aktif habis (`planPeriodEnd < now` atau belum pernah dibayar renewal) →
  buat `Invoice` (registri, reuse `src/lib/invoices.ts` util `monthPeriod`) + `Order`
  kind `renewal_subscription` (amount = snapshot `priceMonthly`) bila belum ada.
- Dipanggil lazy di handler server `GET /api/billing/my` (route API, bukan cron) —
  setiap kali dashboard langganan dimuat, periode yang sudah habis otomatis
  menerbitkan invoice+order renewal bila belum ada.

### 4.4 Hubungan Order ↔ Invoice (bulanan)
- **First subscription**: tidak membuat Invoice terpisah — efek order langsung assign
  plan + set `planPeriodEnd = akhir bulan berjalan (WIB, monthPeriod util)`. Siklus
  invoice bulanan mulai bulan berikutnya via renewal.
- **Renewal**: saat periode habis → `Invoice` (issued, snapshot planName+priceMonthly)
  + `Order` linked (`Order.invoiceId`). Order paid → Invoice `paid`+`paidAt`, periode
  lanjut 1 bulan. Invoice yang ada sekarang (generate manual platform) tetap berfungsi;
  bila admin generate untuk tenant ber-plan aktif periode belum habis → perilaku lama.
- Addon mandiri ditagih **penuh 1 bulan** dan berlaku sampai akhir periode bulan
  berjalan tenant (`TenantAddon.activeUntil` — kolom baru, lihat §5).

### 4.5 `credit.ts` — metering Espresso
- `getBalance(tenantId)`.
- `spendCredit(tenantId, qty, refId)`: cek saldo; potong atomik
  `UPDATE "TenantBalance" SET balance = balance - qty WHERE tenantId=$1 AND balance >= qty`
  + `CreditLedger(-)` dgn `refId` unik (INSERT ON CONFLICT DO NOTHING = idempoten).
  Return boolean sukses. Dipanggil **setelah** OpenWA sukses kirim di titik yang sudah
  menulis `MessageLog` outgoing (agar refId = messageId/row id pesan).
- `hasCreditGate(tenant, plan)`: tenant dengan `Plan.kind='prepaid'` (hanya Espresso di
  seed) → kirim ditolak bila saldo 0/negatif dengan error `INSUFFICIENT_CREDIT`. Gate
  berbasis `Plan.kind`, BUKAN infer dari `maxMessagesPerMonth` (Mocha juga unlimited
  tapi subscription — tidak dipotong per pesan).

### 4.6 `payments.ts` + `providers/tripay.ts`
Interface (pola repo, type + factory dari env):
```ts
interface PaymentProvider {
  createPayment(input: { merchantRef: string; amount: number; customerName: string;
    customerEmail: string; items: {name:string; price:number; quantity:number}[];
    method: string; returnUrl: string; expiryMinutes: number })
    : Promise<{ gatewayRef: string; payCode: string | null; checkoutUrl: string | null;
                payMethod: string }>;
  verifyCallback(request: Request): Promise<{ merchantRef: string; status: 'PAID'|'UNPAID'|'EXPIRED'|'REFUND'|'FAILED' } | null>;
  checkStatus(merchantRef: string): Promise<{ status: string; paidAt?: string }>;
  listChannels(): Promise<{ code: string; name: string; group: string; active: boolean }[]>;
}
```
Tripay (dari docs developer resmi):
- Base: sandbox `https://tripay.co.id/api-sandbox` / prod `https://tripay.co.id/api`
  (env `TRIPAY_MODE`).
- Auth header `Authorization: Bearer {API_KEY}`.
- Create closed payment `POST /transaction/create`: body `{ method, merchant_ref,
  amount, customer_name, customer_email, customer_phone?, order_items:
  [{sku?, name, price, quantity}], return_url, expiry_time (menit), signature }`.
  Signature = `HMAC-SHA256(privateKey, method + merchant_ref + amount)`.
- Response data: `reference` (T...), `pay_code`, `checkout_url`, `qr_string?`.
- Callback POST: payload JSON; verifikasi signature HMAC-SHA256 dengan private key atas
  **raw body** (header `X-Callback-Signature`) → jika tidak cocok, 401 & jangan proses.
- Status: `GET /transaction/detail?reference=` (auth API key) utk fallback/resync.
- Channel list: `GET /merchant/payment-channel` (auth API key).
- Env vars: `TRIPAY_MODE`, `TRIPAY_API_KEY`, `TRIPAY_PRIVATE_KEY`,
  `TRIPAY_MERCHANT_CODE`, `TRIPAY_CALLBACK_SECRET`? (tidak — pakai private key).

---

## 5. Skema lanjutan & keputusan kecil

**§5.1 Kolom penanda jenis plan & periode aktif** (menutup rujukan §3g di atas):
- `Plan.kind TEXT NOT NULL DEFAULT 'subscription'` — `'subscription'|'prepaid'`
  (Espresso = prepaid). Seed update Espresso → prepaid. Gate potong per-pesan HANYA
  untuk kind='prepaid' (Mocha subscription unlimited tidak dipotong).
- `Tenant.planPeriodEnd TIMESTAMPTZ` — akhir periode berbayar berjalan (untuk
  subscription; NULL utk tenant belum/pernah trial? — untuk self-serve: setelah first
  payment, selalu terisi akhir bulan WIB).
- `TenantAddon.activeUntil TIMESTAMPTZ` (nullable) — batas berlaku addon berbayar;
  NULL = berlaku terus (grant manual platform). Cek addon aktif = `active AND
  (activeUntil IS NULL OR activeUntil > now())` — titik cek addon (watermark/campaign/
  delay) memakai helper `tenantHasAddon`/`tenantConfig` yang sudah ada; tambah kondisi.
- Invoice renewal flow tidak mengubah kolom status Invoice existing
  (`issued|paid|void`).

**Periode WIB:** pakai util `src/lib/monthPeriod.ts` (sudah ada dari platform work).

---

## 6. Endpoint publik (tanpa session) & auth

### 6.1 Registrasi publik `POST /api/auth/register`
Body `{ name, email, password, tenantName, planId?, addonKeys?[] }`:
1. Validasi (email format, password ≥ 8, nama tenant ≥ 3; rate-limit KV WAVIO_RATE_LIMIT
   + Turnstile? — lihat §9 keputusan: pasang Turnstile di form registrasi).
2. Cek email belum ada (User) → 409.
3. Transaksi: create `Tenant` (name, `activatedAt=NULL`) + `User` role `owner`
   (passwordHash bcrypt — pola provisioning `platform.ts`/auth register yg ada) + clone
   ke D1 (`tenantStore.syncTenant` — perluas kolom mirror dgn `activatedAt`, + skema D1
   & `workers/d1-resync` ikut diperbarui; verifikasi saat plan) + `TenantBalance` init 0.
4. Kirim welcome email (Resend).
5. Auto sign-in (Auth.js Credentials — authorize() membaca User Neon; pastikan
   `activatedAt` null **tidak** memblokir login pemilik yang sedang checkout).
   Gate: login ditolak bila `suspendedAt` (existing) ATAU (`activatedAt IS NULL` DAN
   tenant belum punya order pending?) — **keputusan**: owner boleh login utk
   menyelesaikan checkout walau `activatedAt` NULL; tenant lain (member) dari tenant
   pending tidak ada (tenant baru cuma owner). Kirim API key (v1) juga tetap perlu
   `activatedAt` terisi. Jadi gate login: tolak bila `suspendedAt` set; izinkan
   `activatedAt NULL` hanya untuk role owner yang tenant-nya punya order pending/belum
   expire; selain itu tolak dengan pesan "selesaikan pembayaran". Sederhanakan: role
   owner + tenant pending → boleh login (dashboard menampilkan halaman "Aktivasi").
   Implementasi: `auth.ts` SELECT tambah `activatedAt`; kembalikan user dgn flag
   `tenantPending`; UI dashboard redirect ke `/dashboard/langganan` (aktivasi) bila
   pending & tanpa device aktif.

### 6.2 Katalog publik
- `GET /api/public/catalog` → `{ plans: [...], addons: [...], settings: { activationFeeRp,
  creditPerMessage, creditMinTopupRp } }`. Tanpa auth. Dipakai Pricing.tsx (SSR client
  fetch) + register/checkout.
- Tidak membocorkan Plan non-publik atau data internal lain.

### 6.3 Callback Tripay `POST /api/billing/tripay/callback`
- Tanpa session; verifikasi `payments.verifyCallback` (HMAC). Gagal → 401 (log audit
  `billing.callback.invalid`).
- Sukses: cari Order by `merchant_ref`; `finalizePaidOrder` (idempoten — status sudah
  paid → 200 OK lagi); status UNPAID/EXPIRED → update order expires/status bila sesuai
  (EXPIRED → pastikan tak terpakai; jangan cancel order PAID).
- Selalu balas 200 cepat (Tripay retry bila non-2xx; log + idempotency kunci unique).

### 6.4 Status & sync
- `GET /api/billing/orders/:id` (session owner/admin) — data order + (bila pending dan
  expired) status update; dipakai polling halaman bayar.
- `POST /api/billing/sync` (platform admin) — expire stale + cek ulang order pending
  ke Tripay (`checkStatus`) → finalisasi yang ternyata PAID (recovery callback hilang).

---

## 7. UI

### 7.1 Landing `Pricing.tsx` → dinamis
- Fetch `/api/public/catalog` (client, `useEffect` pola komponen tabel yang ada).
- Kartu plan: nama/tagline/harga dari DB (`priceMonthly` / per-pesan utk prepaid),
  toggle Bulanan/Tahunan dihapus atau dinonaktifkan dulu (belum ada harga tahunan di
  DB) — **keputusan**: sembunyikan toggle sampai ada harga tahunan; header disesuaikan.
- CTA tiap plan: `/register?plan=<planId>`; sudah login → `/checkout?plan=...`.
- Kartu addon (random delay dsb) dari katalog addon publik; "Tanyakan addon" →
  `/register?addon=<key>` utk tenant baru, `/dashboard/langganan` utk existing.
- Note aktivasi Rp350rb hanya utk paket bulanan (ubah copy landing).

### 7.2 `/register`
- Form nama, email, password, nama tenant (bisnis), pilihan plan (dari katalog), addon
  opsional. Turnstile. Submit → `/api/auth/register` → redirect `/checkout` (order
  dibuat setelah plan dipilih di checkout) — alur: register simpan pilihan plan/addon
  di query/cookie sementara; checkout membuat order.
- Setelah register sukses (auto sign-in) → `/checkout`.

### 7.3 `/checkout`
- Ringkasan item (plan + addon + aktivasi utk bulanan pertama) atau top-up / addon
  mandiri (dari `/dashboard/langganan`).
- Pilih channel pembayaran: daftar dari Tripay `listChannels()` via internal API
  (cache 5 menit), difilter aman utk nominal; default QRIS2/BRIVA/BCAVA.
- `POST /api/billing/orders` → redirect `checkoutUrl` (redirect channel) atau tampilkan
  `payCode` + instruksi (direct channel: VA/QRIS). Polling `GET /api/billing/orders/:id`
  tiap 5 dtk sampai paid/expired → sukses: redirect `/dashboard/langganan?paid=1`.
- Halaman bayar: salin kode, QR (qr_string langsung dari Tripay utk QRIS), countdown
  expiry, tombol "saya sudah bayar" (cek status sekali).

### 7.4 `/dashboard/langganan` (tenant owner; admin tenant_admin juga baca)
- Kartu plan aktif + kuota terpakai (reuse quota.ts) + periode berakhir.
- Espresso: saldo pesan + tombol Top-up (pilih nominal Rp / jumlah pesan, min dari
  catalog) → checkout kind=topup.
- Daftar order/tagihan: status (pending→ tombol Lanjut Bayar jika belum expire; paid;
  expired), invoice bulanan dengan tombol Bayar (buat order renewal bila invoice
  issued tanpa order).
- Addon: daftar addon katalog; aktif/nonaktif? — beli (mandiri) → order addon;
  addon aktif dengan `activeUntil` tampil. Addon free/internal (grant admin) tetap
  ditampilkan sebagai aktif.
- Pending tenant (activatedAt NULL): halaman ini jadi "aktivasi" — wajib checkout
  first_subscription; blokir navigasi fitur lain.
- Route API session: `GET /api/billing/my` ringkasan (plan, balance, orders).

### 7.5 Platform admin (perluasan kecil)
- `/platform/plans`: tambah kolom input `isPublic`, `sortOrder`, dan untuk plan prepaid
  `kind` readonly label. PUT plans/[id] menerima field baru (PlansTable).
- Halaman `/platform/orders` (baru): daftar semua Order (filter status/tenant) +
  tombol Resync (`POST /api/billing/sync`) + tandai paid manual? — **tidak**: hindari
  bypass; cukup resync Tripay. (Admin tetap bisa void invoice via existing.)
- `/platform/invoices`: tombol "terbitkan renewal" tidak berubah; invoice dengan order
  menampilkan status bayar order.

---

## 8. Gating & metering kirim pesan

- **Tenant pending**: login owner diizinkan tapi fitur kirim/device tidak — device
  connect di dashboard diblokir saat pending (halaman aktivasi). API v1: `authStore`
  ApiKey check tambah `activatedAt IS NOT NULL` → 403 `TENANT_PENDING`.
- **Espresso prepaid**: gate kirim = saldo > 0. Titik potong (setelah sukses OpenWA,
  refId unik idempoten):
  1. `src/lib/sendMessage.ts` / `sendTemplate.ts` (single outgoing interactive).
  2. `src/lib/sendBulk.ts` (batch; potong per pesan sukses, batch ref).
  3. `workers/campaign-dispatch/worker.js` (recipient sent → spendCredit ref =
     recipient.id; worker perlu query balance/credit — tambah secret tidak; cukup
     query Neon di worker seperti sudah; idempoten via unique refId).
  4. `workers/platform-broadcast/worker.js` (job sent → spendCredit ref = job.id).
  - **Catatan lingkup**: titik (3) & (4) bisa fase-2 bila kompleks; MVP wajib (1)(2).
    Daftar pasti call site diverifikasi saat plan (kode pekerja yang membaca ini:
    pastikan tidak dobel potong utk jalur yang menulis MessageLog sendiri di worker).
- **Renewal/addon habis masa**: cek addon aktif (`activeUntil`) di `tenantConfig` /
  `tenantHasAddon` — saat addon kedaluwarsa & tenant tak perpanjang: watermark kembali
  aktif, campaign/delay off. Tanpa auto-charge.

---

## 9. Keamanan, env & konfigurasi

- HMAC callback Tripay (private key), idempotency order status, rate-limit register
  (KV), Turnstile di form publik (sitekey/siteverify sudah terpasang di .env & worker
  turnstile-siteverify ada), validasi server-side semua input, snapshot harga dari DB
  (jangan percaya harga dari client), SSRF aman (Tripay fetch URL tetap = hostname
  tetap; tidak ada user URL).
- Env (.env + secret worker app bila perlu): `TRIPAY_MODE`, `TRIPAY_API_KEY`,
  `TRIPAY_PRIVATE_KEY`, `TRIPAY_MERCHANT_CODE`, `NEXT_PUBLIC_SITE_URL` (untuk
  return_url/callback — cek pola existing; bila belum ada tambahkan).
- PlatformSetting (key JSON di `PlatformSetting`, dikelola `/platform/settings`):
  `activation_fee_rp=350000`, `credit_price_per_message=400`,
  `credit_min_topup_rp=20000`, `order_expiry_minutes=1440`, `tripay_default_channel`.
- `.env.example`: tambah TRIPAY_* (placeholder) — pola worker token docs.

---

## 10. Non-goals / menyusul (jangan dikerjakan di plan ini)

- Trial gratis, diskon/tahun, kupon, pajak/fee gateway ditagih ke customer.
- Auto-charge/langganan gateway (recurring) — invoice manual + link tetap.
- Metode bayar selain Tripay (interface siap; provider lain = proyek terpisah).
- Self-service cancel langganan otomatis (cancel = nonaktifkan tenant oleh admin atau
  expire periode; batas keputusan produk nanti).
- Metering potong di worker campaign/platform-broadcast (fase-2, lihat §8) bila
  terbukti kompleks di plan.
- Pemindahan invoice lama (issued/void manual) — tetap berfungsi apa adanya.

---

## 11. Testing & verifikasi

- Unit (vitest, pola repo): catalog (harga/flag), billing createOrder (validasi,
  idempoten pending, snapshot harga), finalizePaidOrder per kind (activatedAt, planId,
  addon, balance+ledger, invoice paid, idempoten 2x panggil), renewal ensureCurrentPeriod
  (terbit 1 invoice+order, tidak dobel), credit spend (saldo cukup/kurang, idempoten
  refId), tripay provider (signature benar/salah, mapping status), auth register (valid,
  duplikat, rate-limit), route tests (register, orders, callback HMAC 401, sync).
- Migrasi SQL: verifikasi idempotent + backfill activatedAt (tenant existing terisi).
- E2E sandbox (manual, setelah deploy): daftar akun baru → checkout QRIS2/BRIVA di
  mode sandbox Tripay → bayar via simulator → tenant aktif + plan assign; top-up →
  saldo bertambah; Espresso saldo 0 → kirim ditolak; renewal: set planPeriodEnd lampau
  → dashboard terbitkan invoice + order → bayar → periode lanjut.
- Suite penuh + tsc + lint hijau sebelum commit tiap task.

---

## 12. Deliverable / file map (ringkas; rinci di plan)

- Migration: `prisma/migrations/2026-09-04-self-serve-billing.sql` (+ schema.prisma sync).
- Lib baru: `catalog.ts`, `billing.ts`, `billingRenewal.ts`, `credit.ts`,
  `payments.ts`, `providers/tripay.ts` (+ tests masing-masing).
- Route baru: `api/public/catalog`, `api/auth/register`, `api/billing/orders[/:id]`,
  `api/billing/tripay/callback`, `api/billing/sync`, `api/billing/my`.
- Halaman: `/register`, `/checkout`, `/dashboard/langganan` (+ komponen), Pricing.tsx
  dinamis, `/platform/orders`, perbaikan PlansTable (isPublic/sortOrder).
- Ubah: `src/lib/auth.ts`, `authStore.ts`, `tenantStore.ts` (activatedAt gate + clone),
  `quota.ts`/`tenantConfig.ts` (addon activeUntil), titik metering send (lib
  sendMessage/sendTemplate/sendBulk), skema D1 & `workers/d1-resync` (mirror
  activatedAt), `.env.example`, docs API & README.
