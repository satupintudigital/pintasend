# Design Spec: Superadmin Capabilities Expansion (Paket A)

## 1. Overview & Objectives
Menambahkan kemampuan operasional esensial pada platform superadmin (PintaSend) untuk mempercepat troubleshooting pelanggan dan memberikan visibilitas bisnis secara real-time:
1. **Tenant Impersonation ("Login as Tenant")**: Superadmin dapat masuk sementara ke session tenant tanpa mengetahui password pemilik.
2. **Emergency Quota & Grace Period Adjustment**: Penyesuaian kuota pesan prepaid / perpanjangan aktif tenant langsung dari panel Tenant Detail.
3. **Financial & Business Metrics**: Agregasi metrik revenue (MRR, Total Pendapatan, Prepaid Balance, utilisasi kuota) pada `/platform` dan `/platform/metrics`.

---

## 2. Technical Architecture & Data Flow

### 2.1 Tenant Impersonation
- **Security Invariant**:
  - Hanya role `platform_admin` yang berhak memicu impersonasi.
  - Sesi impersonasi menyertakan tanda `impersonatedBy: superadmin_user_id` di dalam token JWT session / cookie.
  - Setiap request saat impersonasi tercatat di `AuditLog` dengan action `admin.impersonate_start` dan `admin.impersonate_action`.
  - Superadmin dapat kembali ke platform admin kapan saja via banner bar atas ("Exit Impersonation").
- **Endpoint**:
  - `POST /api/platform/tenants/[id]/impersonate` -> Mengembalikan session switch / redirect URL ke `/dashboard`.
  - `POST /api/auth/exit-impersonate` -> Mengembalikan session asli `platform_admin`.

### 2.2 Manual Adjustment (Emergency Credit & Grace Period)
- **Database / Storage**:
  - Memanfaatkan tabel `Order` internal (`kind: 'topup' | 'manual_adjustment'`) dan field `Tenant.planPeriodEnd` serta kredit balance.
  - Write-through ke cache KV tenant config untuk invalidasi seketika (0 delay).
- **Endpoint**:
  - `POST /api/platform/tenants/[id]/adjust-credit`: `{ amount: number, reason: string }`
  - `POST /api/platform/tenants/[id]/extend-period`: `{ days: number, reason: string }`

### 2.3 Financial & Business Metrics
- **Database Aggregations**:
  - `MRR`: Penjumlahan `priceMonthly` dari semua Tenant aktif yang berlangganan plan subscription.
  - `Total Revenue (MTD & YTD)`: Agregasi `Order` dengan `status = 'paid'`.
  - `Quota Utilization Heatmap`: Persentase pemakaian kuota bulanan per tenant aktif.
- **Endpoint**:
  - `GET /api/platform/metrics` (diperkaya dengan struktur `financial`: `{ mrr, totalRevenueMtd, activeSubscriptions, prepaidVolume }`).

---

## 3. UI/UX Components
1. **Header Impersonation Banner**: Komponen global di `/dashboard/*` bila session memiliki flag `impersonating`.
2. **TenantDetailPanel Action Buttons**: Tombol "Impersonate Tenant", "Beri Kredit Manual", "Perpanjang Masa Aktif".
3. **Financial Summary Cards**: Card visual di `/platform` dan `/platform/metrics` (MRR, MTD Revenue, Top Spenders).

---

## 4. Verification & Testing Plan
1. **Unit & Integration Tests**:
   - `abac.test.ts` & `auth.test.ts`: Pastikan member/tenant_admin tidak bisa memicu impersonate.
   - `platformMetrics.test.ts`: Verifikasi kalkulasi MRR dan MTD revenue.
   - `tenantAdjustment.test.ts`: Verifikasi penambahan kredit tercatat di audit log & saldo bertambah.
2. **End-to-End Smoke Test**:
   - Superadmin login -> Klik Impersonate -> Masuk ke dashboard tenant -> Navigasi menu -> Klik Exit Impersonate -> Kembali ke Superadmin.
