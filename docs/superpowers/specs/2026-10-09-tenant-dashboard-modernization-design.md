# Tenant Dashboard Modernization & Holistic Command Center — Design Spec

**Date:** 2026-10-09  
**Status:** Approved  
**Target:** `src/app/dashboard/page.tsx`, `src/components/dashboard/**`, `src/app/api/dashboard/**` / `src/lib/dashboard.ts`

---

## 1. Overview & Objectives

Modernisasi halaman Beranda Dashboard Tenant (`/dashboard`) dari halaman statistik statis 2-kartu menjadi **Holistic Command Center** yang profesional, tangguh, modern, dan responsif untuk mengelola operasional WhatsApp Gateway, CRM kontak, bot otomasi, dan integrasi API.

### Key Objectives
1. **Holistic Telemetry (6 Metric Cards):** Device aktif, Pesan hari ini, Kuota/pemakaian bulan ini, Saldo kredit & paket aktif, Total kontak CRM, dan Status bot/campaign.
2. **7-Day Message Analytics Chart:** Visualisasi tren pesan masuk vs keluar 7 hari terakhir (WIB) yang responsif dan interaktif.
3. **Live Device Status & Health Widget:** Daftar ringkas status device live (`ready`, `qr_ready`, `disconnected`) dengan tombol aksi cepat (*Scan QR*, *Restart*, *Test Message*).
4. **Recent Activity Feed:** 5-8 interaksi pesan terbaru dengan badge status pengiriman (*sent*, *delivered*, *read*, *failed*).
5. **Quick Action Hub & Developer Quickstart:** Modal Kirim Pesan Cepat (*Quick Send*), Quick Action Tambah Kontak/Bot, dan Tab Snippet Integrasi API (cURL, Node.js).
6. **Mobile-First Responsive Layout:** Pengaturan layout grid adaptif (1 kolom mobile, 2 kolom tablet, 3-4 kolom desktop) dengan visual glassmorphism dark-mode yang elegan.

---

## 2. Architecture & Data Flow

### 2.1 Backend / Service Layer (`src/lib/dashboard.ts`)
Fungsi `getTenantDashboardOverview(tenantId: string)` yang mengambil data teragregasi secara efisien dari Neon PostgreSQL:
- **Metrics Summary:**
  - `readyDevicesCount` & `totalDevicesCount` dari `Device`
  - `todayMessagesCount` (sejak 00:00 WIB hari ini) dari `MessageLog`
  - `monthMessagesCount` (bulan berjalan) & kuota paket dari `Tenant` + `Plan` + `TenantBalance`
  - `totalContactsCount` dari `Contact`
  - `activeBotRulesCount` dari `BotRule`
  - `runningCampaignsCount` dari `Campaign`
- **7-Day Trend:**
  - Agregasi harian pesan `incoming` vs `outgoing` 7 hari terakhir.
- **Recent Messages:**
  - 8 pesan terbaru (`id`, `deviceId`, `deviceLabel`, `direction`, `chatId`, `body`, `status`, `triggeredAt`).
- **Device Health List:**
  - Daftar device aktif tenant beserta status koneksi dan nomor telepon.

### 2.2 Frontend Components (`src/components/dashboard/`)
- `DashboardOverview.tsx`: Komponen utama yang merender command center.
- `MetricCardsGrid.tsx`: Grid 6 kartu telemetri responsif.
- `MessageTrendChart.tsx`: Komponen SVG/CSS chart tren 7 hari (incoming vs outgoing) yang ringan tanpa library eksternal berat.
- `DeviceHealthWidget.tsx`: Widget status perangkat live dengan tombol aksi cepat.
- `RecentActivityFeed.tsx`: Daftar interaksi pesan terbaru dengan badge visual.
- `QuickSendModal.tsx`: Modal kirim pesan instan langsung dari dashboard.
- `DeveloperQuickstart.tsx`: Tab snippet cURL / JavaScript / Python untuk integrasi API.

---

## 3. UI/UX Specifications

### 3.1 Color & Visual Hierarchy
- Menggunakan tema konsisten Pintasend: background `#090d16` (`bg-ink`), surface `#111827` (`bg-surface`), border `border-line` (`rgba(255,255,255,0.08)`), aksen `#10b981` / `#059669` (`text-accent-bright` / `bg-accent`), dan status warning/error (`#f59e0b` / `#ef4444`).
- Glassmorphism hover effect (`bk-lift`, `Spotlight`) untuk kartu-kartu interaktif.

### 3.2 Responsive Breakpoints
- **Mobile (< 768px):** 1 kolom vertikal, metric cards 2x3 grid mini, chart bar horizontal/vertikal fleksibel, recent feed swipe/scroll.
- **Tablet (768px - 1024px):** 2 kolom seimbang (kiri: Metric + Chart, kanan: Device Health + Recent Messages).
- **Desktop (≥ 1024px):** Grid terstruktur (atas: 4-6 Metric Cards; tengah: 2/3 Chart + 1/3 Quick Actions; bawah: 1/2 Device Health + 1/2 Recent Messages).

---

## 4. Error Handling & Performance

- **Zero Heavy Runtime Libs:** Visualisasi tren pesan dibangun dengan SVG / CSS Grid murni (tanpa dependency charting berat seperti Recharts/Chart.js yang menambah ukuran bundle Worker).
- **Graceful Fallbacks:** Jika tenant baru belum memiliki device atau pesan, tampilkan *Empty States* yang mengajak tenant menghubungkan nomor atau mengirim pesan pertama dengan panduan langkah yang jelas.
- **Concurrent DB Queries:** Pengambilan data telemetri di `dashboard.ts` menggunakan `Promise.all` paralel agar latency page load tetap < 250ms.

---

## 5. Testing & Verification Plan

- **Unit Test (`src/lib/dashboard.test.ts`):** Verifikasi kalkulasi metrik, agregasi 7 hari, dan query recent activity.
- **Component Test & TypeScript Check:** `npx tsc --noEmit` bersih dan `npm test` hijau.
- **Full Build Verification:** `npm run build` sukses untuk Cloudflare OpenNext.
- **Smoke Run:** Pengujian visual responsif di desktop & mobile.
