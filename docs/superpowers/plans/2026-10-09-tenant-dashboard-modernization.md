# Tenant Dashboard Modernization & Command Center Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mengubah halaman Beranda Dashboard Tenant (`/dashboard`) menjadi Holistic Command Center yang modern, profesional, tangguh, dan responsif dengan telemetri 6 metrik, grafik tren 7 hari, status live device health, feed aktivitas pesan terkini, modal kirim pesan cepat, dan developer quickstart.

**Architecture:** App Router Next.js 16 (`src/app/dashboard/page.tsx`), Backend Service (`src/lib/dashboard.ts`), Client Components (`src/components/dashboard/**`), Neon Postgres Serverless (`@/lib/db.ts`), Tailwind CSS 4 + Phosphor Icons.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript 5, Tailwind CSS 4, Phosphor Icons, Neon Serverless Postgres.

## Global Constraints

- Tidak menambah dependency chart eksternal yang berat; grafik tren dibangun menggunakan SVG/CSS responsif murni.
- Pengambilan data dashboard menggunakan query Neon teragregasi yang efisien (`Promise.all`) agar waktu eksekusi < 200ms.
- Tampilan harus fully responsive: 1 kolom di mobile (<768px), 2 kolom di tablet (768px–1023px), 3-4 kolom di desktop (≥1024px).
- Seluruh endpoint dan interaksi harus aman dari error tak terduga dengan validasi dan graceful empty states.

---

### Task 1: Backend Service Layer (`src/lib/dashboard.ts` & `src/lib/dashboard.test.ts`)

**Files:**
- Create: `src/lib/dashboard.ts`
- Create: `src/lib/dashboard.test.ts`

**Interfaces:**
- Consumes: `@/lib/db` (`query`, `queryOne`), `@/lib/quota`
- Produces: `getTenantDashboardOverview(tenantId: string)` returning metrics, 7-day trend, recent messages, and device health list.

- [ ] **Step 1: Tulis unit test untuk `dashboard.ts`**

Tulis test suite di `src/lib/dashboard.test.ts` untuk memverifikasi kalkulasi metrik, pengelompokan 7 hari, dan query recent messages.

- [ ] **Step 2: Implementasi `src/lib/dashboard.ts`**

Implementasikan fungsi `getTenantDashboardOverview(tenantId: string)` dengan query teroptimasi untuk mengambil:
1. `metrics`: device count (ready/total), today messages, month messages, total contacts, active bot rules, running campaigns, balance, plan info.
2. `trend7Days`: array 7 hari berisi `{ date: string, incoming: number, outgoing: number }`.
3. `recentMessages`: 8 pesan terbaru dengan detail direction, chatId, status, timestamp.
4. `devices`: daftar perangkat tenant dengan status live.

- [ ] **Step 3: Jalankan unit test**

Run: `npx vitest run src/lib/dashboard.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/lib/dashboard.ts src/lib/dashboard.test.ts
git commit -m "feat(dashboard): add backend service layer for holistic tenant metrics and trend"
```

---

### Task 2: Komponen UI Dashboard (Chart, Device Health, Quick Actions, Quickstart)

**Files:**
- Create: `src/components/dashboard/MessageTrendChart.tsx`
- Create: `src/components/dashboard/QuickSendModal.tsx`
- Create: `src/components/dashboard/DeveloperQuickstart.tsx`
- Create: `src/components/dashboard/DashboardOverview.tsx`

**Interfaces:**
- Consumes: Data dari `getTenantDashboardOverview`, icons dari `@phosphor-icons/react`
- Produces: Komponen presentasi dan interaktif untuk Beranda Dashboard

- [ ] **Step 1: Buat `MessageTrendChart.tsx`**

Komponen grafik batang/area SVG responsif murni yang membandingkan pesan masuk vs pesan keluar 7 hari terakhir beserta tooltip nilai.

- [ ] **Step 2: Buat `QuickSendModal.tsx`**

Modal interaktif untuk mengirim pesan teks WhatsApp uji coba cepat ke nomor tertentu via device ready milik tenant.

- [ ] **Step 3: Buat `DeveloperQuickstart.tsx`**

Widget tab ringkas yang menyediakan contoh pemanggilan API `POST /v1/messages` dalam format cURL, Node.js (fetch), dan Python (requests) dengan penjelasan header API key.

- [ ] **Step 4: Buat `DashboardOverview.tsx`**

Komponen layout utama yang merangkum 6 metric cards, 7-day chart, live device health, recent messages feed, dan quick action bar.

- [ ] **Step 5: Verifikasi Type Checking**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/components/dashboard/MessageTrendChart.tsx src/components/dashboard/QuickSendModal.tsx src/components/dashboard/DeveloperQuickstart.tsx src/components/dashboard/DashboardOverview.tsx
git commit -m "feat(dashboard): create modern command center UI components with charts and quick actions"
```

---

### Task 3: Integrasi Halaman Beranda (`src/app/dashboard/page.tsx`)

**Files:**
- Modify: `src/app/dashboard/page.tsx`

**Interfaces:**
- Consumes: `getTenantDashboardOverview`, `DashboardOverview`
- Produces: Halaman Beranda Dashboard `/dashboard` yang lengkap dan modern

- [ ] **Step 1: Hubungkan `src/app/dashboard/page.tsx` dengan `getTenantDashboardOverview`**

Muat data server-side secara paralel dan oper ke `DashboardOverview`. Tambahkan graceful empty-state onboarding bagi tenant yang baru mendaftar.

- [ ] **Step 2: Verifikasi & Build Test**

Run: `npm test && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/app/dashboard/page.tsx
git commit -m "feat(dashboard): integrate modern holistic command center into tenant home page"
```

---

### Task 4: Verifikasi Akhir & Cloudflare Deployment

**Files:**
- Union of all changed files

- [ ] **Step 1: Jalankan Full Test Suite**

Run: `npm test`
Expected: 100% tests green.

- [ ] **Step 2: Jalankan Full Build**

Run: `npm run build`
Expected: Build Next.js 16 & OpenNext Cloudflare berhasil.

- [ ] **Step 3: Push ke Main untuk Auto-Deploy**

Run: `git push origin main`
Expected: Auto-deploy Cloudflare berjalan dan live di `pintasend.satupintudigital.co.id`.
