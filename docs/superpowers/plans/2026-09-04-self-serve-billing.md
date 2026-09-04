# Self-Serve Billing & Katalog Produk — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) atau superpowers:executing-plans untuk mengimplementasikan plan ini task-by-task. Steps memakai checkbox (`- [ ]`) untuk tracking.
>
> Spec acuan: `docs/superpowers/specs/2026-09-04-self-serve-billing-design.md` (commit `0e0e1d6`). Kerjakan TDD (red→green) per task; tiap task diakhiri `tsc` + `vitest run <file>` hijau + commit. Ledger progres: `.superpowers/sdd/2026-09-04-self-serve-billing/progress.md` (buat saat Task 0).

**Goal:** User bisa mandiri membeli paket Wavio — registrasi publik, checkout Tripay (closed payment), aktivasi otomatis tenant, invoice bulanan ber-link, dan paket per-pesan (Espresso) prepaid.

**Architecture:** Katalog dinamis dari DB (`Plan` + `Addon` baru + `PlatformSetting` harga). Order-centric billing: `Order` = instrument bayar (snapshot item, `merchant_ref` Tripay = order.id); `Invoice` tetap registri bulanan dan order renewal menaut ke invoice. Tenant baru disimpan dgn `activatedAt = NULL` (pending) dan gate via blokir API key + device connect; owner boleh login untuk menyelesaikan checkout. Gateway dipisah di `lib/payments.ts` (interface) + `lib/providers/tripay.ts`.

**Tech Stack:** Next.js (OpenNext Worker) · raw SQL `@neondatabase/serverless` (`src/lib/db.ts`) · D1 mirror (`src/lib/d1.ts`) · Auth.js v5 Credentials (JWT) · bcryptjs · vitest.

## Global Constraints

- Semua query Neon lewat `import { query, queryOne } from "@/lib/db"`; query D1 lewat `queryD1One` / `changesD1` dari `@/lib/d1`. **Tidak ada** pemakaian ORM runtime (Prisma hanya untuk schema → DDL).
- UUID v7 via `uuidv7()` dari `@/lib/uuidv7` (dibangkitkan aplikasi, bukan DB).
- ID tenant selalu di-scope dari session (`parsePrincipal` dari `@/lib/abac`); platform admin memakai pola guard yang ada (`requirePlatformAdmin` di `src/app/api/platform/tenants/route.ts:17` atau helper abac).
- Key addon wajib impor dari `@/lib/addonKeys` (single source) — dilarang literal `'remove_watermark'|'random_delay'|'campaign'` di query baru.
- Periode bulan memakai util `monthPeriodRange`/`currentMonthStartIso` dari `@/lib/monthPeriod` (WIB).
- Setiap order/pembayaran idempoten: finalisasi hanya transisi `pending → paid` (guard status), callback ganda aman.
- Migration idempotent (`IF NOT EXISTS` / guard), pola `prisma/migrations/2026-09-04-*.sql`. Jangan menyentuh `wavio-schema.sql` (dump regenerasi deploy).
- Audit: aksi mutasi penting dicatat `audit.record` (pola `src/lib/audit.ts`; lihat pemakaian di route platform).
- Bahasa kode: Indonesia utk komentar/error user-facing (konsisten repo).

---

### Task 0: Worktree + baseline verifikasi

**Files:**
- Create: (direktori baru via git) — jalankan di root `wavio/`
- Modify: tidak ada

**Interfaces:**
- Produces: worktree ter-isolasi `feat/self-serve-billing` dari `main` (HEAD `0e0e1d6`), suite hijau sebagai baseline.

- [ ] **Step 1: Buat worktree + branch**
```bash
cd "/e/Project/Satu Pintu Digital/wavio"
git worktree add .worktrees/feat-self-serve-billing -b feat/self-serve-billing main
```
- [ ] **Step 2: Buat ledger SDD**
```bash
cd "/e/Project/Satu Pintu Digital/wavio/.worktrees/feat-self-serve-billing"
mkdir -p .superpowers/sdd/2026-09-04-self-serve-billing
echo "# SDD — Self-Serve Billing (2026-09-04)" > .superpowers/sdd/2026-09-04-self-serve-billing/progress.md
```
- [ ] **Step 3: Baseline test + tsc**
Run: `npm run test 2>&1 | tail -5` lalu `npx tsc --noEmit`
Expected: suite hijau (849 test baseline) + tsc bersih.

---

### Task 1: Migration skema billing + sinkron schema/d1

**Files:**
- Create: `prisma/migrations/2026-09-04-self-serve-billing.sql`
- Modify: `prisma/schema.prisma` (Plan, Tenant, TenantAddon + model baru Order/Addon/TenantBalance/CreditLedger)
- Modify: `prisma/d1-schema.sql` (kolom `activatedAt` di tabel `Tenant`)
- Modify: `prisma/seed.ts` (baris Plan `kind`/`isPublic`/`sortOrder` + `Addon` seed — hanya referensi, idempotent)

**Interfaces:**
- Produces kolom/tabel yang dipakai semua task: `Plan.kind` (`'subscription'|'prepaid'`), `Plan.isPublic`, `Plan.sortOrder`; `Tenant.activatedAt`, `Tenant.planPeriodEnd`; `TenantAddon.activeUntil`; tabel `Addon(key,name,tagline,priceMonthly,isActive)`, `Order`, `TenantBalance`, `CreditLedger` (semua PascalCase, kolom quoted).

- [ ] **Step 1: Tulis migration (failing terhadap DB kosong = verifikasi di task akhir; idempotent)** — isi file penuh:
```sql
-- Self-serve billing: katalog addon, order, saldo prepaid, penanda aktivasi/plan.
-- Idempotent: aman dijalankan ulang.

ALTER TABLE "Plan" ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'subscription';
ALTER TABLE "Plan" ADD COLUMN IF NOT EXISTS "isPublic" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Plan" ADD COLUMN IF NOT EXISTS "sortOrder" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "activatedAt" TIMESTAMPTZ;
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "planPeriodEnd" TIMESTAMPTZ;

ALTER TABLE "TenantAddon" ADD COLUMN IF NOT EXISTS "activeUntil" TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS "Addon" (
  id TEXT PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  tagline TEXT NOT NULL DEFAULT '',
  "priceMonthly" INTEGER,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "Order" (
  id TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  kind TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  "invoiceId" TEXT,
  "planId" TEXT,
  "addonKey" TEXT,
  amount INTEGER NOT NULL,
  "itemsJson" TEXT NOT NULL,
  "periodStart" TIMESTAMPTZ,
  "periodEnd" TIMESTAMPTZ,
  "creditMessages" INTEGER,
  gateway TEXT NOT NULL DEFAULT 'tripay',
  "gatewayRef" TEXT,
  "payCode" TEXT,
  "checkoutUrl" TEXT,
  "payMethod" TEXT,
  "expiresAt" TIMESTAMPTZ,
  "paidAt" TIMESTAMPTZ,
  "callbackRaw" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_order_tenant ON "Order"("tenantId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS idx_order_status ON "Order"(status, "expiresAt");
CREATE INDEX IF NOT EXISTS idx_order_invoice ON "Order"("invoiceId");

CREATE TABLE IF NOT EXISTS "TenantBalance" (
  "tenantId" TEXT PRIMARY KEY,
  balance INTEGER NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "CreditLedger" (
  id TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "orderId" TEXT,
  delta INTEGER NOT NULL,
  reason TEXT NOT NULL,
  "refId" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_creditledger_tenant ON "CreditLedger"("tenantId", "createdAt" DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_creditledger_ref ON "CreditLedger"("refId") WHERE "refId" IS NOT NULL;

-- Backfill: tenant hasil provisioning lama dianggap aktif (activatedAt = createdAt).
UPDATE "Tenant" SET "activatedAt" = "createdAt" WHERE "activatedAt" IS NULL;
-- Seed data: Espresso = prepaid; Addon katalog (random_delay harga landing Rp25.000).
UPDATE "Plan" SET kind = 'prepaid' WHERE name = 'Espresso';
INSERT INTO "Addon" (id, key, name, tagline, "priceMonthly", "isActive")
SELECT '10000000-0000-7000-8000-000000000001', 'random_delay', 'Random delay', 'Jeda acak 3–10 dtk antar kirim (anti-spam).', 25000, true
WHERE NOT EXISTS (SELECT 1 FROM "Addon" WHERE key = 'random_delay');
INSERT INTO "Addon" (id, key, name, tagline, "priceMonthly", "isActive")
SELECT '10000000-0000-7000-8000-000000000002', 'remove_watermark', 'Remove watermark', 'Hapus footnote iklan dari pesan keluar tenant.', NULL, true
WHERE NOT EXISTS (SELECT 1 FROM "Addon" WHERE key = 'remove_watermark');
INSERT INTO "Addon" (id, key, name, tagline, "priceMonthly", "isActive")
SELECT '10000000-0000-7000-8000-000000000003', 'campaign', 'Campaign', 'Modul blast massal WA Campaign.', NULL, true
WHERE NOT EXISTS (SELECT 1 FROM "Addon" WHERE key = 'campaign');
```
- [ ] **Step 2: Sinkron `schema.prisma`** — tambahkan model berikut + kolom baru (ikutkan field relation seperti model lain; generator Prisma hanya dipakai utk DDL, bukan runtime):
  - `Plan`: `kind String @default("subscription")`, `isPublic Boolean @default(true)`, `sortOrder Int @default(0)`, relasi `orders Order[]`.
  - `Tenant`: `activatedAt DateTime?`, `planPeriodEnd DateTime?`, relasi `orders Order[]`, `balance TenantBalance?`, `creditLedger CreditLedger[]`.
  - `TenantAddon`: `activeUntil DateTime?`.
  - `Addon`, `Order`, `TenantBalance`, `CreditLedger` (sesuai SQL; relasi opsional diisi konsisten).
  - Prisma pakai `@default(uuid(7))` — TIDAK berlaku utk raw SQL (ID dibangkitkan app); biarkan seperti pola model existing.
- [ ] **Step 3: Sinkron `prisma/d1-schema.sql`** — tabel `Tenant` tambah kolom:
```sql
ALTER TABLE Tenant ADD COLUMN activatedAt TEXT;
```
(baris CREATE TABLE asli juga diberi `activatedAt TEXT,`; file ini utk database D1 `wavio-auth` — eksekusi deploy dijelaskan Task 14).
- [ ] **Step 4: Sinkron `prisma/seed.ts`** — seed Plan menambah `kind:'subscription'|'prepaid'` & `isPublic/sortOrder` (Espresso: prepaid, sort 0; Latte sort 1; Mocha sort 2), dan INSERT Addon seed (pola ON CONFLICT id DO NOTHING yang sudah ada).
- [ ] **Step 5: Verifikasi**
Run: `npx tsc --noEmit` + `npm run test 2>&1 | tail -3` + `node -e "JSON.parse(require('fs').readFileSync('prisma/migrations/2026-09-04-self-serve-billing.sql','utf8'))"` (pastikan tidak error sintaks)
Expected: tsc bersih; suite hijau (tak ada kode konsumen kolom baru selain seed).
- [ ] **Step 6: Commit**
```bash
git add -A && git commit -m "feat(billing): migration skema order/addon/saldo + penanda plan/tenant"
```

---

### Task 2: Harga platform (PlatformSetting) + `catalog.ts`

**Files:**
- Modify: `src/lib/platformSettings.ts` (keys baru + default + bounds)
- Create: `src/lib/catalog.ts`, `src/lib/catalog.test.ts`
- Modify: `src/lib/platformSettings.test.ts` (jika ada assertion keys — tambahkan coverage key baru via route test Task 12; minimal pastikan hijau)

**Interfaces:**
- Consumes: `getPlatformSetting`/`setPlatformSetting` (existing), `PLATFORM_SETTING_KEYS`.
- Produces:
  - `PLATFORM_SETTING_KEYS` bertambah: `activation_fee_rp: "number"`, `credit_price_per_message: "number"`, `credit_min_topup_rp: "number"`, `order_expiry_minutes: "number"`.
  - Defaults: 350000, 400, 20000, 1440.
  - `getPublicCatalog(now = new Date()): Promise<PublicCatalog>` di `catalog.ts`:
```ts
export interface PublicPlan { id: string; name: string; tagline: string; kind: string;
  priceMonthly: number | null; pricePerMessage: number | null; maxMessagesPerMonth: number | null; features: string[]; }
export interface PublicAddon { key: string; name: string; tagline: string; priceMonthly: number | null; }
export interface PublicCatalogSettings { activationFeeRp: number; creditPerMessageRp: number;
  creditMinTopupRp: number; orderExpiryMinutes: number; }
export interface PublicCatalog { plans: PublicPlan[]; addons: PublicAddon[]; settings: PublicCatalogSettings; }
export async function getPublicCatalog(): Promise<PublicCatalog>
```
- `features` diisi dari teks statis per plan id di file yang sama (daftar fitur landing; `getPlanFeatures(planId)`); plan prepaid → `pricePerMessage` dari setting.

- [ ] **Step 1: Tulis test gagal `catalog.test.ts`** — mock `@/lib/db` (query) + `@/lib/platformSettings`:
  - query Plan join Addon? Pisahkan: mock `query` utk 2 SELECT (plans aktif+isPublic order sortOrder; addons aktif). `getPlatformSetting` mock utk 4 angka. Assert: hanya plan publik & addon aktif; harga prepaid = 400 per pesan; activationFee 350000.
- [ ] **Step 2: Run test → RED** (modul belum ada).
- [ ] **Step 3: Implementasi**
```ts
// src/lib/catalog.ts
import { query } from "@/lib/db";
import { getPlatformSetting } from "@/lib/platformSettings";

export async function getPublicCatalog(): Promise<PublicCatalog> {
  const planRows = await query<{ id: string; name: string; tagline: string; kind: string;
    "priceMonthly": number | null; "maxMessagesPerMonth": number | null }>(
    'SELECT id, name, tagline, kind, "priceMonthly", "maxMessagesPerMonth" FROM "Plan" ' +
    'WHERE "isActive" = true AND "isPublic" = true ORDER BY "sortOrder" ASC, name ASC');
  const addonRows = await query<{ key: string; name: string; tagline: string; "priceMonthly": number | null }>(
    'SELECT key, name, tagline, "priceMonthly" FROM "Addon" WHERE "isActive" = true ORDER BY name ASC');
  const num = async (k: string, d: number) => { const v = await getPlatformSetting(k); return typeof v === "number" ? v : d; };
  const settings = { activationFeeRp: await num("activation_fee_rp", 350000),
    creditPerMessageRp: await num("credit_price_per_message", 400),
    creditMinTopupRp: await num("credit_min_topup_rp", 20000),
    orderExpiryMinutes: await num("order_expiry_minutes", 1440) };
  return { plans: planRows.map(p => ({ ...p, pricePerMessage: p.kind === "prepaid" ? settings.creditPerMessageRp : null,
    features: getPlanFeatures(p.name) })), addons: addonRows, settings };
}
```
(+ `getPlanFeatures(name)` pure — daftar fitur string utk kartu landing; default `[]`.)
- [ ] **Step 4: Update `platformSettings.ts`** keys/defaults + batas di `encodeSettingValue` (semua angka 0..10_000_000; `order_expiry_minutes` 15..10080).
- [ ] **Step 5: Run test → GREEN** + `npx tsc --noEmit`.
- [ ] **Step 6: Commit** `feat(billing): katalog publik dinamis (plan+addon+harga platform)`

---

### Task 3: `credit.ts` — saldo pesan prepaid

**Files:**
- Create: `src/lib/credit.ts`, `src/lib/credit.test.ts`

**Interfaces:**
- Consumes: `query` (`@/lib/db`), `uuidv7`.
- Produces:
```ts
export async function getBalance(tenantId: string): Promise<number>
export async function addCredit(input: { tenantId: string; messages: number;
  orderId?: string | null; reason?: string }): Promise<number>   // returns balance baru
export async function spendCredit(input: { tenantId: string; messages: number;
  refId: string; reason?: string }): Promise<{ ok: boolean; balance: number }>
```
- `addCredit`: `INSERT INTO "TenantBalance" (...,balance) VALUES ($1,$2) ON CONFLICT ("tenantId") DO UPDATE SET balance = "TenantBalance".balance + EXCLUDED.balance, "updatedAt"=now()` + `CreditLedger(+delta, refId=orderId?)`. Idempoten per orderId? Ledger refId unique — utk top-up guard dipakai di billing (finalisasi sekali), jadi cukup tulis sekali.
- `spendCredit`: UPDATE atomik `SET balance = balance - $2 WHERE "tenantId"=$1 AND balance >= $2 RETURNING balance`; jika 0 baris → `{ok:false}` tanpa ledger; jika sukses INSERT ledger dgn `refId` unique (`ON CONFLICT DO NOTHING`), return balance.

- [ ] **Step 1: Test RED** (mock db query ber-sequence): getBalance default 0; addCredit upsert & ledger; spendCredit cukup/kurang; spendCredit refId ganda → satu ledger saja (ON CONFLICT).
- [ ] **Step 2–4: Implementasi** sesuai kontrak; run test hijau + tsc.
- [ ] **Step 5: Commit** `feat(billing): saldo prepaid (tenantBalance + creditLedger)`

---

### Task 4: `payments.ts` + `providers/tripay.ts`

**Files:**
- Create: `src/lib/payments.ts`, `src/lib/providers/tripay.ts`, `src/lib/payments.test.ts`

**Interfaces:**
- Consumes: tidak ada (murni HTTP + HMAC).
- Produces:
```ts
export interface PaymentCreateInput { merchantRef: string; amount: number;
  customerName: string; customerEmail: string;
  items: { name: string; price: number; quantity: number }[];
  method: string; returnUrl: string; expiryMinutes: number; }
export interface PaymentCreateResult { gatewayRef: string; payCode: string | null;
  checkoutUrl: string | null; payMethod: string; qrString: string | null; }
export interface PaymentProvider { createPayment(i: PaymentCreateInput): Promise<PaymentCreateResult>;
  verifyCallback(bodyText: string, signatureHeader: string | null): Promise<{ merchantRef: string; status: string } | null>;
  checkStatus(gatewayRef: string): Promise<{ status: string; paidAt: string | null }>;
  listChannels(): Promise<{ code: string; name: string; group: string; type: string; active: boolean }[]>; }
export function tripaySignature(privateKey: string, method: string, merchantRef: string, amount: number): string
export function createPaymentProvider(env?: Record<string, string | undefined>): PaymentProvider  // default process.env
```
- Tripay facts (dari docs developer): base sandbox `https://tripay.co.id/api-sandbox`, prod `https://tripay.co.id/api` (env `TRIPAY_MODE=sandbox|production`, default sandbox); header `Authorization: Bearer {TRIPAY_API_KEY}`; create `POST /transaction/create` body termasuk `signature = HMAC-SHA256(TRIPAY_PRIVATE_KEY, method + merchant_ref + amount)`; respon `data.reference`, `data.pay_code`, `data.checkout_url`, `data.qr_string`; `GET /transaction/detail?reference=` utk status (`data.status`: PAID/UNPAID/EXPIRED/REFUND/FAILED, `data.paid_at`); `GET /merchant/payment-channel` utk daftar channel (`data[].code|name|group|type|active`). Callback: POST JSON; valid = `HMAC-SHA256(TRIPAY_PRIVATE_KEY, bodyText)` hex dibanding konstan-waktu dgn header `X-Callback-Signature`; parse `data.merchant_ref` & `data.status`.
- Pemakaian `TRIPAY_MERCHANT_CODE`: tidak dipakai body create versi saat ini (signature cukup method+ref+amount) — env tetap dibaca & divalidasi ada.

- [ ] **Step 1: Test RED `payments.test.ts`**: `tripaySignature` vektor tetap (hitung manual); `createPaymentProvider` default sandbox (cek URL via fetch mock `vi.stubGlobal('fetch', ...)`); createPayment benar mengirim signature & membaca respon; verifyCallback benar/salah signature (mock `crypto.subtle`? gunakan node:crypto `createHmac` — runtime Workers menyediakan? Repo memakai `bcryptjs` & webcrypto di worker; **pakai `node:crypto` createHmac bila import aman di build OpenNext (nodejs_compat aktif) — fallback: `crypto.subtle` seperti `workers/campaign-dispatch/worker.js` pola hmacSha256Hex**; pilih pola yang sama dgn campaign worker (subtle) agar aman di kedua runtime). Implementasi helper `hmacSha256Hex(secret, data)` internal (pola campaign-dispatch worker).
- [ ] **Step 2–4**: Implementasi; green; tsc.
- [ ] **Step 5: Commit** `feat(billing): provider payment interface + tripay (create/verify/status/channels)`

---

### Task 5: `billing.ts` — order inti

**Files:**
- Create: `src/lib/billing.ts`, `src/lib/billing.test.ts`

**Interfaces:**
- Consumes: `getPublicCatalog` (Task 2), `addCredit` (Task 3), `getPaymentProvider` (Task 4), `query`/`queryOne` (`@/lib/db`), `uuidv7`, `audit.record` (pola: `await auditRecord?.(...)` — ikuti signature `src/lib/audit.ts` `recordAudit`/varian yang dipakai route platform; cek file & pakai fungsi yang ada), `getTenantQuota` tidak wajib.
- Produces:
```ts
export type OrderKind = "first_subscription" | "renewal_subscription" | "addon" | "topup";
export type OrderStatus = "pending" | "paid" | "expired" | "cancelled";
export interface OrderItem { type: "plan" | "activation" | "addon" | "credit";
  refId?: string | null; name: string; quantity: number; unitPrice: number; }
export interface OrderRow { id: string; tenantId: string; userId: string; kind: OrderKind;
  status: OrderStatus; invoiceId: string | null; planId: string | null; addonKey: string | null;
  amount: number; itemsJson: string; periodStart: string | null; periodEnd: string | null;
  creditMessages: number | null; gateway: string; gatewayRef: string | null; payCode: string | null;
  checkoutUrl: string | null; payMethod: string | null; expiresAt: string | null; paidAt: string | null;
  createdAt: string; updatedAt: string; }
export async function getOrder(tenantId: string, orderId: string): Promise<OrderRow | null>
export async function getOrderAnyScope(orderId: string): Promise<OrderRow | null>
// getOrderAnyScope: hanya utk callback internal pasca-verifikasi HMAC (Task 9);
// TIDAK dipakai route session (selalu getOrder dgn scope tenant).
export async function listOrders(tenantId: string, limit?: number): Promise<OrderRow[]>
export async function findPendingOrder(opts: { tenantId: string; kind: OrderKind;
  planId?: string | null; addonKey?: string | null; now?: Date }): Promise<OrderRow | null>
export async function createOrder(input: { tenantId: string; userId: string; kind: OrderKind;
  planId?: string | null; addonKey?: string | null; items: OrderItem[];
  creditMessages?: number | null; periodStart?: Date | null; periodEnd?: Date | null;
  payMethod: string; returnUrl: string; skipGateway?: boolean; now?: Date }): Promise<OrderRow>
// skipGateway=true → simpan pending TANPA memanggil provider (gatewayRef null,
// checkoutUrl null); dipakai renewal (Task 6) — bayar dibuat belakangan saat klik.
// skipGateway=false (default) → panggil provider.createPayment lalu simpan hasilnya.
export async function expireStaleOrders(now?: Date): Promise<number>
export async function finalizePaidOrder(orderId: string,
  payment: { gatewayRef?: string | null; payMethod?: string | null; paidAt?: string | null },
  actor?: { id: string; name: string } | null): Promise<{ ok: boolean; error?: string }>
export async function markOrderExpiredFromGateway(orderId: string): Promise<boolean>
```
- `createOrder` alur: validasi tenant (harus ada; `planId` utk kind subscription wajib & plan `isActive`; addonKey utk kind addon wajib ada di tabel `Addon` aktif & `priceMonthly` tidak null; topup wajib `creditMessages ≥ 1` & `amount = creditMessages × settings.creditPerMessageRp`); **idempoten**: bila `findPendingOrder` (kind+ref yg sama, belum expire) → kembalikan order itu (tanpa create Tripay baru) ATAU lemparkan `OrderPendingError` — keputusan: kembalikan order lama bila masih pending & belum expire (UX checkout kembali); simpan amount = jumlah items (hitung server-side dari katalog, jangan percaya client). Panggil `provider.createPayment({ merchantRef: order.id, amount, customerName: tenant.name, customerEmail: owner.email, items: nama item, method: payMethod, returnUrl, expiryMinutes: settings.orderExpiryMinutes })`; simpan gatewayRef/payCode/checkoutUrl/payMethod/expiresAt (= now + expiryMinutes).
- `finalizePaidOrder`: BEGIN; `SELECT ... FOR UPDATE` order; jika status ≠ pending → ROLLBACK & `{ok:true}` (idempoten); UPDATE `status='paid', paidAt, gatewayRef?, payMethod?, callbackRaw?`; lalu efek per kind (lihat di bawah); COMMIT. Gagal di tengah → ROLLBACK, log, `{ok:false}`.
  - `first_subscription`: `UPDATE "Tenant" SET "activatedAt" = COALESCE("activatedAt", now()), "planId"=$plan, "planAssignedAt"=now(), "planPeriodEnd"=$end WHERE id=$tenant`; item addon → upsert `TenantAddon` (`active=true, activeUntil=$end`) ON CONFLICT (tenantId,key) DO UPDATE; `tenantStore.syncTenantD1` (Task 6 menyediakan; panggil bila ada).
  - `renewal_subscription`: `UPDATE "Tenant" SET "planId"=$plan, "planAssignedAt"=now(), "planPeriodEnd"=$end WHERE id=$tenant`; bila `invoiceId` → `UPDATE "Invoice" SET status='paid', "paidAt"=now() WHERE id=$invoiceId AND status='issued'`.
  - `addon`: upsert `TenantAddon` aktif + `activeUntil` = akhir bulan berjalan WIB (dari `monthPeriodRange` utk bulan berjalan; jika tenant plan subscription & `planPeriodEnd` ada → sampai `planPeriodEnd`; sederhana: sampai akhir bulan kalender berjalan) → pilih: sampai `planPeriodEnd` bila ada, else akhir bulan kalender WIB.
  - `topup`: `addCredit({tenantId, messages: order.creditMessages, orderId: order.id, reason:"topup"})`.
  - Akhiri: `recordAudit({ tenantId, actor: { id: null, email: "system", role: "system" }, action: "billing.order.paid", targetType: "Order", targetId: order.id, meta: { kind, amount } })` (never-throw, import dari `@/lib/audit`) + `console.log` ringkas.
- `periodEnd` helper: `nextPeriodEndWib()` = akhir bulan berjalan WIB (bulan berikutnya tanggal 1 - 1ms / exclusive; pakai `monthPeriodRange` + periode yg sesuai). Penjelasan: first payment bulan berjalan → periode = sisa bulan berjalan; implementasi `periodEndForStart(startIso)` di `billing.ts` (pure, di-test).
- `expireStaleOrders`: `UPDATE "Order" SET status='expired', "updatedAt"=now() WHERE status='pending' AND "expiresAt" < now() RETURNING id` → count.

- [ ] **Step 1: Test RED** — mock db query berurutan; coverage: create first_subscription amount = plan.priceMonthly + addon + activationFee (plan bulanan) ; create topup amount = creditMessages×400; pending duplikat → kembalikan order sama (tanpa fetch gateway baru); finalize first → activatedAt/planId/planPeriodEnd/addon upsert + idempoten (panggil 2x ok); renewal → invoice paid; addon → activeUntil; topup → addCredit dipanggil; expireStale count.
- [ ] **Step 2–4**: implementasi; green; tsc. Gunakan mock `fetch` utk createPayment di route test saja (unit billing mock provider via `vi.mock("@/lib/payments", ...)`).
- [ ] **Step 5: Commit** `feat(billing): service order (create/finalize/expire) + efek aktivasi`

---

### Task 6: `billingRenewal.ts` + mirror D1 tenant

**Files:**
- Create: `src/lib/billingRenewal.ts`, `src/lib/billingRenewal.test.ts`
- Modify: `src/lib/tenantStore.ts` (+`syncTenantD1`), `src/lib/tenantStore.test.ts`

**Interfaces:**
- Consumes: `monthPeriodRange`/`currentMonthStartIso`, `getTenantConfig` tidak wajib; `listOrders`/`createOrder` (Task 5) TIDAK dipakai langsung — renewal membuat `Invoice`+`Order` via query & helper internal agar tidak memanggil provider gateway saat penerbitan (order dibuat pending TANPA Tripay; Tripay dibuat saat user klik Bayar — lihat Task 8/11). Maka tambahan kontrak Task 5: `createOrder(..., skipGateway?: boolean)` opsional → bila true, simpan pending tanpa panggil provider (gatewayRef null; checkoutUrl null). **Update Task 5 implementasi utk menerima `skipGateway`.**  
- Produces:
```ts
export async function ensureCurrentPeriod(tenantId: string, now?: Date): Promise<{
  invoiceCreated: boolean; orderCreated: boolean; }>
```
Alur: SELECT tenant (planId, planPeriodEnd, activatedAt, suspendedAt) JOIN Plan (kind, name, priceMonthly, isActive). Kondisi renewal perlu: tenant `kind='subscription'`, `activatedAt` ada, tidak suspended, periode habis (`planPeriodEnd IS NULL` utk tenant subscription yang sudah aktif tapi belum pernah set? — hanya proses bila planPeriodEnd != null dan < now, ATAU planPeriodEnd null && activatedAt != null && order pertama sudah lama? Sederhana: proses bila `planPeriodEnd IS NULL OR planPeriodEnd < now` DAN tenant sudah activated & plan subscription & belum ada Invoice utk periode berjalan). Hitung periode berikutnya = bulan kalender WIB setelah periode terakhir/berjalan (`nextMonthPeriod(periodStart?)` pure helper di file ini + test). Cek Invoice existing `WHERE "tenantId"=$1 AND "periodStart"=$2` → ada → skip. Insert Invoice (id uuid, tenantId, planId, planName, priceMonthly snapshot, periodStart/End WIB, status 'issued') lalu Order kind `renewal_subscription`, planId, amount=priceMonthly, itemsJson, periodStart/End, invoiceId, skipGateway, expiresAt = now + expiryMinutes setting. Return flags.
- `tenantStore.syncTenantD1(tenant: {id,name,suspendedAt,activatedAt})`: INSERT OR REPLACE ke D1 `Tenant (id,name,suspendedAt,activatedAt)`. `setTenantSuspended` dipakai route platform → perluas juga menulis activatedAt yang sudah ada dari D1 (SELECT name, activatedAt dulu lalu INSERT OR REPLACE keduanya) agar tidak menghapus nilai.

- [ ] **Step 1–5 (TDD)**: renewal test (subscription period habis → create invoice+order sekali, tidak dobel; prepaid & pending & suspended → skip; addon-only → skip); tenantStore test (syncTenantD1 insert + setTenantSuspended mempertahankan activatedAt). Green + tsc.
- [ ] **Step 6: Commit** `feat(billing): renewal bulanan lazy + sync D1 activatedAt`

---

### Task 7: Registrasi publik + gate login tenant baru

**Files:**
- Create: `src/app/api/auth/register/route.ts`, `src/lib/register.ts`, `src/app/api/auth/register/route.test.ts`
- Modify: `src/lib/authStore.ts` (ApiKey gate: tolak saat tenant `activatedAt` NULL — kecuali owner? API key milik tenant; pending → tolak), `src/lib/authStore.test.ts`
- Modify: `src/app/api/devices/route.ts` (blokir device baru saat tenant pending) — lihat isi route; tambah guard `assertTenantNotPending(tenantId)` dari `src/lib/tenantGate.ts` (baru, kecil)
- Create: `src/lib/tenantGate.ts`, `src/lib/tenantGate.test.ts`

**Interfaces:**
- Produces:
```ts
// src/lib/tenantGate.ts
export async function getTenantActivation(tenantId: string): Promise<{ activatedAt: string | null;
  suspendedAt: string | null; planId: string | null; pending: boolean }>
export async function assertTenantCanOperate(tenantId: string): Promise<{ ok: true } | { ok: false; error: string; code: string }>
```
  - `pending = activatedAt === null`; `canOperate = !suspendedAt && !pending`; kode error `TENANT_PENDING` / `TENANT_SUSPENDED`.
```ts
// src/lib/register.ts
export interface RegisterInput { name: string; email: string; password: string; tenantName: string }
export async function registerTenantOwner(input: RegisterInput): Promise<{ tenantId: string; userId: string }>
```
  - Validasi (email regex sederhana, password ≥ 8, nama tenant 3..100). Cek duplikat email (User Neon) → lempar `Error("EMAIL_TAKEN")`. Insert transaksi Neon: Tenant (id, name, activatedAt NULL) + User (role 'owner', passwordHash bcrypt.hashSync(password,10), id uuid) → lalu D1: INSERT User (id, tenantId, email, name, passwordHash, role — cek kolom D1 User di `prisma/d1-schema.sql`) + `syncTenantD1` (activatedAt null) + Neon `TenantBalance` init (balance 0). Kirim email sambutan: reuse `sendWelcomeEmail`/`sendEmail` dari `src/lib/email.ts` (cek nama fungsi yang ada; bungkus try/catch jangan gagalkan register bila email gagal).
- `POST /api/auth/register` route: parse body, validasi, **Turnstile** (bila env `NEXT_PUBLIC_TURNSTILE_SITEVERIFY_URL` terisi: `fetch(siteverifyUrl, { method:'POST', body: token })` → gagal = 400; kosong/absent = izinkan utk dev/sandbox — pola env yang sudah ada di `.env`), panggil register, lalu `signIn("credentials", { email, password, redirect:false })` dari `@/lib/auth`, redirect `/checkout` dgn query `plan`/`addon` yang dikirim client (echo query param aman whitelist: plan id valid via catalog). Response JSON `{ ok:true, tenantId, redirectTo }`.
- Gate authStore ApiKey: query D1 ApiKey join Tenant (suspendedAt + activatedAt); tambah kondisi tolak bila `activatedAt` null → kembalikan null (401). (Login tetap mengizinkan pending owner — tanpa perubahan auth.ts.)

- [ ] **Step 1–5 (TDD)**: tenantGate tests; register service tests (mock Neon db + D1 helpers + email + bcrypt — pakai `vi.mock` pola `tenantMembers.test.ts`); route test (POST valid → 200 & signIn dipanggil; duplikat → 409; password pendek → 400); authStore test pending key → null. Implement; green; tsc.
- [ ] **Step 6: Commit** `feat(billing): registrasi publik tenant owner + gate tenant pending`

---

### Task 8: Route API billing (katalog publik, orders, my, sync)

**Files:**
- Create: `src/app/api/public/catalog/route.ts`, `src/app/api/billing/orders/route.ts`, `src/app/api/billing/orders/[id]/route.ts`, `src/app/api/billing/my/route.ts`, `src/app/api/billing/sync/route.ts` (+ 1 file test gabungan `src/app/api/billing/route.test.ts` dan `src/app/api/public/catalog/route.test.ts`)

**Interfaces:**
- Consumes: `getPublicCatalog` (Task 2), `billing.*` (Task 5), `ensureCurrentPeriod` (Task 6), `expireStaleOrders`, `assertTenantCanOperate` (Task 7), `parsePrincipal` + `isPlatformAdmin` (`@/lib/abac`), pattern guard route platform (`src/app/api/platform/settings/route.ts` sbg referensi GET session + PUT platform admin; `src/app/api/platform/tenants/route.ts:17` utk requirePlatformAdmin).
- Produces:
  - `GET /api/public/catalog` → `PublicCatalog` (tanpa auth; cache-control `s-maxage=60`).
  - `POST /api/billing/orders` body `{ kind: 'first_subscription'|'renewal_subscription'|'addon'|'topup', planId?, addonKey?, creditMessages?, payMethod, addonKeys?: string[] (khusus first_subscription) }`; guard session owner/tenant_admin tenant-nya; untuk `first_subscription`: tenant boleh pending (aktivasi) — validasi item lewat katalog: plan wajib `kind='subscription'` saat kind subscription; addonKeys hanya yang `priceMonthly != null`; hitung activationFee bila plan subscription (kecuali sudah pernah `activatedAt`); `topup`: amount = creditMessages × creditPerMessageRp (min creditMinTopupRp). Delegasi `createOrder` (Task 5, skipGateway=false). Response 201 order + `redirectUrl` (checkoutUrl) atau `payCode`.
  - `GET /api/billing/orders/[id]` (session tenant yg sama) → OrderRow + sisa detik expiry (`expiresInSec`). Bila order pending & sudah lewat `expiresAt` → jalankan `expireStaleOrders` dulu (satu order) → status expired.
  - Referensi pola guard route session owner/tenant_admin (bukan platform admin): `parsePrincipal(req)` dari `@/lib/abac`; izinkan bila principal ada & `role ∈ {owner, tenant_admin}` & `tenantId === target.tenantId`. Buat helper kecil `requireTenantPrincipal` di file route test yang sama bila dipakai >1 route (atau inline per route).
  - `GET /api/billing/my` (session owner/tenant_admin) → panggil `ensureCurrentPeriod(tenantId)` dulu, lalu `{ catalog: getPublicCatalog(), plan: <row tenant join plan>, balance: getBalance(tenantId), orders: listOrders(tenantId, 20), pending: tenantGate.pending, deviceCount }`. Query plan tenant langsung di route ini (SELECT t.*, p.name/p.kind/priceMonthly dari Tenant t JOIN Plan p).
  - `POST /api/billing/sync` (platform admin): `expireStaleOrders()`; lalu utk tiap Order pending dgn `gatewayRef` → `provider.checkStatus`; status PAID → `finalizePaidOrder`; EXPIRED → `markOrderExpiredFromGateway`. Response `{ expired, paid, stillPending }`.
- Audit: `billing.order.paid` hanya dari `finalizePaidOrder` (Task 5). Route sync log singkat console.

- [ ] **Step 1–5 (TDD)**: test route (mock `@/lib/db` + `@/lib/payments` + session via `parsePrincipal` mock pola `src/app/api/platform/tenants/[id]/status/route.test.ts` — lihat bagaimana session di-mock di test route platform yang ada). Publik catalog tanpa auth 200. Orders: owner session OK, member → 403, pending tenant boleh first_subscription; my: renewal dipicu saat periode habis (mock ensureCurrentPeriod). Sync: admin saja.
- [ ] **Step 6: Run full route test + tsc; commit** `feat(billing): route orders/my/sync + katalog publik`

---

### Task 9: Callback Tripay (webhook pembayaran)

**Files:**
- Create: `src/app/api/billing/tripay/callback/route.ts`, `src/app/api/billing/tripay/callback/route.test.ts`

**Interfaces:**
- Consumes: `createPaymentProvider` (Task 4), `finalizePaidOrder`, `markOrderExpiredFromGateway`, `getOrder` (Task 5).
- Produces: `POST /api/billing/tripay/callback` (tanpa session):
  1. Baca raw body text `await request.text()`.
  2. `provider.verifyCallback(bodyText, request.headers.get("X-Callback-Signature"))` → null → `Response.json({ ok:false }, { status: 401 })` + `console.error` (log audit ringan `audit.record` bila tersedia helper tanpa actor — pakai actor null `{ id:"tripay", name:"Tripay callback" }`? pola audit memerlukan principal; bila repot, cukup console.error + return 401).
  3. `{ merchantRef, status }`: cari order by id `merchantRef` (`getOrder` butuh tenantId — buat `getOrderByRef(gatewayRef=merchantRef)`? merchant_ref = order.id → `SELECT ... WHERE id=$1` tanpa tenant scope utk callback (internal, sudah diverifikasi HMAC) — tambahkan `getOrderAnyScope(orderId)` kecil di billing.ts utk ini (Task 5 backfill satu fungsi + test).
  4. status `PAID` → `finalizePaidOrder(order.id, { gatewayRef, payMethod, paidAt }, null)`. `EXPIRED` → `markOrderExpiredFromGateway`. Lainnya (`UNPAID`/`REFUND`/`FAILED`) → 200 tanpa aksi (jangan cancel order PAID).
  5. Selalu balas `200 { ok:true }` setelah proses (Tripay retry bila non-2xx). Body raw disimpan ke `order.callbackRaw` saat finalisasi (Task 5 update: field callbackRaw di-set dari param opsional).
- [ ] **Step 1–5 (TDD)**: callback test: signature salah → 401 & finalize tidak dipanggil; PAID → finalize dipanggil dgn order; EXPIRED → mark; UNPAID → 200 tanpa aksi; panggilan ganda PAID → finalize tetap ok (idempoten). Implementasi + green + tsc.
- [ ] **Step 6: Commit** `feat(billing): webhook callback tripay (HMAC + idempoten)`

---

### Task 10: Gating addon `activeUntil` + config tenant

**Files:**
- Modify: `src/lib/tenantConfig.ts` (SELECT TenantAddon + kondisi aktif utk `remove_watermark`/`random_delay`/`campaign`; SELECT Plan tambah `kind`; cfg.plan.kind baru), `src/lib/tenantConfig.test.ts`
- Modify: `src/lib/watermark.ts` `tenantHasRemoveWatermark` (tambah `AND ("activeUntil" IS NULL OR "activeUntil" > now())`), `src/lib/watermark.test.ts`
- Modify: `src/lib/delay.ts` & `src/lib/campaigns.ts` & `watermarkAddon.ts` HANYA bila mereka query TenantAddon langsung (cek; yang lewat tenantConfig otomatis ikut) — perbaiki query tambah kondisi aktif.
- Modify: `src/app/api/platform/tenants/[id]/addons/route.ts` (grant manual platform: set `activeUntil=NULL`; cabut tetap `active=false`)

**Interfaces:**
- Produces: helper `tenantAddonActiveWhere()` ekspor dari `tenantConfig.ts` (string SQL `'active = true AND ("activeUntil" IS NULL OR "activeUntil" > now())'`) agar query tersentral. `getTenantConfig` kembalikan `plan.kind` (`'subscription'|'prepaid'|null`).
- [ ] **Step 1–5 (TDD)**: config test mock: addon dgn activeUntil lampau → tidak aktif; Plan.kind ikut di cfg. watermark/delay/campaign test update (activeUntil future aktif, past tidak). Implementasi + green + tsc (perhatikan test existing yang mock `getTenantConfig` — tambah field `kind` pada mock objek agar tidak undefined-crash; pola mock `cfg.plan` di sendMessage.test dll diperbarui di Task 11 bersamaan).
- [ ] **Step 6: Commit** `feat(billing): addon kedaluwarsa (activeUntil) di config tenant`

---

### Task 11: Metering kirim prepaid (Espresso)

**Files:**
- Modify: `src/lib/sendMessage.ts`, `src/lib/sendTemplate.ts`, `src/lib/sendBulk.ts`, `src/lib/sendRichMessage.ts` (+ test masing-masing: `sendMessage.test.ts`, `sendTemplate.test.ts`, `sendBulk.test.ts`, `sendRichMessage.test.ts`)
- Consumes: `credit.getBalance`/`spendCredit` (Task 3), `tenantConfig.getTenantConfig` (Task 10 → `cfg.plan.kind`).

**Kontrak metering (prepaid):** tenant dgn `cfg.plan.kind === 'prepaid'`:
1. **Pra-kirim**: setelah `cfg` didapat (semua file sudah memanggil `getTenantConfig(ctx.tenantId)` di awal fungsi eksekusi — cek lokasi persisnya per file), jika prepaid dan `await getBalance(tenantId) < 1` → gagalkan kirim dgn error/return pola yang dipakai file tsb (mengikuti cara file mengembalikan error kuota; usahakan kode string `INSUFFICIENT_CREDIT` di `error`/`message`) SEBELUM memanggil OpenWA.
2. **Pasca-kirim sukses**: setelah OpenWA sukses & sebelum return, `await spendCredit({ tenantId, messages: 1, refId: <messageId/row id unik utk pesan tsb>, reason: 'send' })`. refId harus unik per pesan (gunakan id/`messageId` yang tersedia di hasil kirim; bila tidak ada, kombinasi `deviceId+Date.now()+random` — **prioritas: id pesan DB bila file menulis MessageLog, else messageId OpenWA**). Panggil dalam try/catch non-fatal (kegagalan ledger tidak menggagalkan kirim, cukup console.error) — keputusan: spendCredit best-effort pasca kirim, tapi gate pra-kirim keras (saldo 0 = tolak).
3. Test mock `cfg.plan.kind` (tambahkan `kind` di objek plan mock; mock default `'subscription'` agar test lama tak terpengaruh), plus test baru: prepaid saldo 0 → tolak `INSUFFICIENT_CREDIT`; prepaid saldo cukup → kirim sukses & spendCredit dipanggil dgn refId; subscription → spendCredit tidak dipanggil.
- Catatan lingkup (spec §8): worker `campaign-dispatch` & `platform-broadcast` potong kredit = **fase-2, TIDAK dikerjakan di plan ini**; sisakan TODO komentar di worker bila relevan.
- [ ] **Step 1–5 (TDD)**: per file — tambah test prepaid (red), implement gate+spend, green. Jalankan seluruh test 4 file + file lain yang mock cfg (grep `getTenantConfig` mock yg return objek plan → tambah `kind`) — jalankan `npm run test` penuh di akhir task, perbaiki mock yang error, tsc.
- [ ] **Step 6: Commit** `feat(billing): metering kirim prepaid espresso (gate saldo + potong idempoten)`

---

### Task 12: UI publik — Pricing dinamis, Register, Checkout

**Files:**
- Modify: `src/components/landing/Pricing.tsx` (fetch `/api/public/catalog`; state `catalog`; render dari data; toggle tahunan dihapus; CTA → `/register?plan=<id>` atau `/register?addon=<key>`; kartu addon dari `catalog.addons`; catatan aktivasi hanya paket bulanan)
- Create: `src/app/register/page.tsx` (form: nama, email, password, nama tenant, pilihan plan radio dari catalog fetch, addon checkbox; submit POST `/api/auth/register` → redirect response `redirectTo`; tambah link "Sudah punya akun? Masuk")
- Create: `src/app/checkout/page.tsx` (client; baca query `plan`/`addon`/`topup`/`kind`; fetch catalog + channel via `GET /api/billing/channels`? — **tanpa route baru**: daftar channel default statis `["QRIS2","BRIVA","BCAVA","MANDIRIVA","ALFAMART","DANA","OVO","SHOPEEPAY"]` dengan UI pilih; POST `/api/billing/orders`; hasil: redirect ke `checkoutUrl` (window.location) atau tampil kode bayar + countdown + polling `GET /api/billing/orders/:id` tiap 5 dtk (setInterval) sampai `status=paid` → `router.push('/dashboard/langganan?paid=1')`; tombol "Saya sudah bayar" → sekali cek)
- Create: `src/components/billing/PayCodePanel.tsx` (komponen tampil kode bayar/QR + instruksi + countdown — props `{ order, onPaid }`)

**Catatan styling:** pakai pola class Tailwind existing (landing: `rounded-2xl border border-line bg-surface` dst; dashboard: pola komponen panel). Tidak perlu desain baru.
- [ ] **Step 1**: Pricing dinamis — render fallback skeleton saat loading & error state kecil; verifikasi visual via `npm run dev` opsional.
- [ ] **Step 2**: Halaman register + checkout (client, minimal) — validasi form frontend; error server ditampilkan.
- [ ] **Step 3**: `npx tsc --noEmit` + `npm run lint -- src/components/landing/Pricing.tsx src/app/register src/app/checkout src/components/billing 2>&1 | tail` (pola lint file tertentu; perbaiki warning react-hooks bila ada — hindari `useEffect` async langsung, pakai pola `.then`/callback seperti komponen tabel existing).
- [ ] **Step 4: Commit** `feat(billing): landing harga dinamis + halaman register & checkout`

---

### Task 13: Dashboard Langganan + halaman/platform admin

**Files:**
- Create: `src/app/dashboard/langganan/page.tsx` (server component: `auth()` → redirect login; render `<SubscriptionDashboard />`), `src/components/dashboard/SubscriptionDashboard.tsx` (client; fetch `/api/billing/my`; tampilan: kartu plan aktif + kuota (device/user/pesan dari quota — reuse util), saldo pesan + tombol Top-up (modal pilih nominal: min catalog.settings.creditMinTopupRp, kelipatan rate; POST order kind=topup → redirect checkout), daftar order/tagihan dgn status badge + tombol "Bayar Sekarang" (bila pending & belum expire → redirect ke order checkoutUrl atau tampil PayCodePanel bila payCode langsung; bila renewal invoice issued tanpa order → tombol membuat order via POST orders kind renewal_subscription dengan planId tenant → lanjut bayar), addon aktif/tersedia (beli mandiri → POST orders kind addon), banner bila `pending` (activatedAt null) menyuruh checkout first_subscription & sembunyikan menu fitur lain)
- Modify: `src/components/dashboard/SidebarNav.tsx` (tambah menu "Langganan" `/dashboard/langganan` utk role owner/tenant_admin; sembunyikan menu fitur saat tenant pending — passing `pending` prop dari layout)
- Modify: `src/app/dashboard/layout.tsx` (baca tenant pending via api? server: `getTenantActivation(session.user.tenantId)` → prop `pending` ke SidebarNav; redirect non-owner ke halaman pending bila perlu — cukup prop)
- Create: `src/app/platform/orders/page.tsx` + `src/components/platform/OrdersTable.tsx` (daftar order semua tenant: tenant name, kind, status, amount, createdAt, paidAt; tombol "Resync Tripay" → POST `/api/billing/sync` lalu reload; filter status via query — pola TenantTable)
- Modify: `src/components/platform/PlatformSidebar.tsx` + `src/app/platform/page.tsx` (tambah menu "Orders" `/platform/orders`)
- Modify: `src/components/platform/PlansTable.tsx` (tambah input `isPublic` (checkbox), `sortOrder` (number), tampil `kind` label; PUT body tambah `isPublic`,`sortOrder`), `src/app/api/platform/plans/[id]/route.ts` + `src/lib/platform.ts` `PlanPatch`/`updatePlan` (terima & simpan field baru — cek lokasi definisi `PlanPatch` di platform.ts)
- Modify: `src/components/platform/SettingsForm.tsx` (tambah 4 input number utk `activation_fee_rp`, `credit_price_per_message`, `credit_min_topup_rp`, `order_expiry_minutes`) — `PLATFORM_SETTING_KEYS` sudah mendukung (Task 2)
- [ ] **Step 1–3 (bertahap, tsc + lint tiap selesai)**: SubscriptionDashboard (inti + langganan my) → Sidebar/layout pending → platform orders + plans/settings form.
- [ ] **Step 4: `npm run lint`** (semua file baru kita bersih; masalah lint pra-ada dibiarkan) + `npm run test` penuh + tsc.
- [ ] **Step 5: Commit** `feat(billing): dashboard langganan tenant + platform orders/plan/settings`

---

### Task 14: Worker D1 resync, docs, env, verifikasi akhir

**Files:**
- Modify: `workers/d1-resync/worker.js` (sinkron kolom `activatedAt` Neon → D1 bila worker ini menyalin Tenant — cek isi worker; tambah kolom pada INSERT OR REPLACE; deployment worker terpisah dicatat di README bagian deploy)
- Modify: `.env.example` (tambah `TRIPAY_MODE`, `TRIPAY_API_KEY`, `TRIPAY_PRIVATE_KEY`, `TRIPAY_MERCHANT_CODE` placeholder + komentar sandbox; pola section `🔗 TRIPAY (self-serve billing)`)
- Modify: `README.md` (fitur billing + env Tripay + catatan deploy worker d1-resync + migrasi baru)
- Modify: `src/app/docs/api/page.tsx` (seksi endpoint publik/auth/billing: `/api/public/catalog`, `/api/auth/register`, `/api/billing/*`)
- Modify: `docs/wavio-fitur-review.md` (tandai gap jual paket tertutup — tambah baris ringkas)

**Verifikasi akhir (wajib sebelum commit):**
- [ ] `npx tsc --noEmit` bersih
- [ ] `npm run test` → seluruh suite hijau (baseline 849 + test baru)
- [ ] `npm run lint` → hanya problem pra-ada (file dashboard channels/labels lama) yang tersisa
- [ ] Migration `2026-09-04-self-serve-billing.sql` di-apply ke Neon production + verifikasi objek (idempotent; `node prisma/apply-migration.mjs prisma/migrations/2026-09-04-self-serve-billing.sql` pola lama — cek nama script apply yang dipakai di repo; jalankan setelah persetujuan, dokumentasikan di ledger)
- [ ] D1: `npx wrangler d1 execute wavio-auth --file prisma/d1-schema.sql` (atau pola deploy D1 yang dipakai — verifikasi di repo) supaya kolom `activatedAt` ada di D1
- [ ] Update ledger `.superpowers/sdd/2026-09-04-self-serve-billing/progress.md` (semua task + verifikasi)
- [ ] **Commit** `docs(billing): env tripay, docs api, readme, review fitur + d1 resync`

---

## Setelah plan (manual, bukan bagian task otomatis)

1. **Kredensial Tripay sandbox** dari user: `TRIPAY_MODE=sandbox`, `TRIPAY_API_KEY`, `TRIPAY_PRIVATE_KEY`, `TRIPAY_MERCHANT_CODE` → `.env` + secret worker wavio (bila route callback butuh di Worker, env dibaca process.env — pasang sbg secret Cloudflare bila prod).
2. Deploy: merge `feat/self-serve-billing` → main, `npm run deploy`, deploy ulang `workers/d1-resync`, jalankan migrasi Neon+D1 (Task 14).
3. E2E sandbox manual (spec §11): daftar akun → checkout QRIS2/BRIVA sandbox → bayar via simulator Tripay → tenant aktif; top-up; Espresso saldo 0 ditolak; renewal periode habis.

