# Superadmin Capabilities Expansion (Paket A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Menambahkan kemampuan Tenant Impersonation, Emergency Credit/Period Adjustment, dan Financial Metrics pada platform Superadmin PintaSend.

**Architecture:** Memanfaatkan session JWT Auth.js dengan atribut impersonation untuk bypass tenant context; Neon database untuk query finansial agregat dan manual adjustment; Next.js server components + Client components untuk visual dashboard.

**Tech Stack:** Next.js 16 (App Router), Cloudflare Workers runtime (@opennextjs/cloudflare), Neon Serverless Postgres, D1 Database, TailwindCSS, Phosphor Icons.

---

### Task 1: Financial & Business Metrics Aggregations

**Files:**
- Modify: `src/lib/platform.ts`
- Modify: `src/app/api/platform/metrics/route.ts`
- Create: `src/lib/platformFinancialMetrics.test.ts`

- [ ] **Step 1: Tulis unit test untuk financial metrics (MRR, MTD Revenue)**
- [ ] **Step 2: Implementasi query agregasi MRR dan Order paid di `src/lib/platform.ts`**
- [ ] **Step 3: Update response `GET /api/platform/metrics` untuk menyertakan objek `financial`**
- [ ] **Step 4: Jalankan test `npx vitest run src/lib/platformFinancialMetrics.test.ts` dan pastikan PASS**
- [ ] **Step 5: Commit**

---

### Task 2: Emergency Credit & Period Adjustment Backend

**Files:**
- Create: `src/app/api/platform/tenants/[id]/adjust-credit/route.ts`
- Create: `src/app/api/platform/tenants/[id]/extend-period/route.ts`
- Create: `src/lib/tenantAdjustment.test.ts`

- [ ] **Step 1: Tulis unit test untuk guard `platform_admin` & mutasi saldo/periode**
- [ ] **Step 2: Implementasi endpoint `POST /api/platform/tenants/[id]/adjust-credit`**
- [ ] **Step 3: Implementasi endpoint `POST /api/platform/tenants/[id]/extend-period` dengan audit logging**
- [ ] **Step 4: Jalankan test dan pastikan PASS**
- [ ] **Step 5: Commit**

---

### Task 3: Tenant Impersonation Mechanism

**Files:**
- Modify: `src/lib/auth.ts`
- Create: `src/app/api/platform/tenants/[id]/impersonate/route.ts`
- Create: `src/app/api/auth/exit-impersonate/route.ts`
- Create: `src/components/dashboard/ImpersonationBanner.tsx`
- Modify: `src/app/dashboard/layout.tsx`

- [ ] **Step 1: Tambahkan support `impersonatedTenantId` pada JWT token & session di `src/lib/auth.ts`**
- [ ] **Step 2: Buat route `impersonate` dan `exit-impersonate`**
- [ ] **Step 3: Pasang banner peringatan visual di top header `/dashboard` saat mode impersonasi aktif**
- [ ] **Step 4: Verifikasi alur switch context & exit switch**
- [ ] **Step 5: Commit**

---

### Task 4: Superadmin UI Components & Integration

**Files:**
- Modify: `src/components/platform/TenantDetailPanel.tsx`
- Modify: `src/app/platform/page.tsx`
- Modify: `src/app/platform/metrics/page.tsx`

- [ ] **Step 1: Pasang tombol aksi "Impersonate", "Tambah Saldo", dan "Perpanjang Aktif" di `TenantDetailPanel.tsx`**
- [ ] **Step 2: Tampilkan card metrik finansial (MRR, Total Revenue MTD, Active Subscriptions) di `/platform` dan `/platform/metrics`**
- [ ] **Step 3: Jalankan typecheck `npx tsc --noEmit` dan full build test**
- [ ] **Step 4: Commit & deploy readiness check**
