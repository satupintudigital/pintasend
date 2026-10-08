# Superadmin Global Device Inspector & Manual Order Approval Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mengimplementasikan fitur Global Device & Session Inspector (`/platform/devices`) dan Manual Order Approval UI + Financial CSV Export (`/platform/orders`) untuk superadmin.

**Architecture:** 
- Device Inspector: Query lintas tabel `Device` dan `Tenant` di Neon DB + delegasi aksi ke OpenWA client + integrasi audit log.
- Manual Order Approval & Export: Endpoint `mark-paid` terintegrasi dengan `finalizePaidOrder` + endpoint streaming/download `text/csv` di `/api/platform/orders/export` + tombol interaktif pada `OrdersTable.tsx`.

**Tech Stack:** Next.js 16 (App Router), Neon Postgres, OpenWA HTTP Client, Phosphor Icons, TailwindCSS.

---

### Task 1: Manual Order Approval & Financial CSV Export Backend

**Files:**
- Modify: `src/app/api/platform/orders/[id]/mark-paid/route.ts`
- Create: `src/app/api/platform/orders/export/route.ts`
- Modify: `src/lib/platform.ts`
- Create: `src/lib/platformOrdersApproval.test.ts`

- [ ] **Step 1: Pastikan `mark-paid/route.ts` memanggil `finalizePaidOrder` dari `src/lib/billing.ts` dan mencatat audit log**
- [ ] **Step 2: Buat endpoint `GET /api/platform/orders/export` untuk menghasilkan download CSV riwayat order**
- [ ] **Step 3: Tulis unit test di `src/lib/platformOrdersApproval.test.ts` dan pastikan PASS**
- [ ] **Step 4: Commit**

---

### Task 2: OrdersTable UI Integration (Mark Paid Button & CSV Export)

**Files:**
- Modify: `src/components/platform/OrdersTable.tsx`
- Modify: `src/app/platform/orders/page.tsx`

- [ ] **Step 1: Tambahkan tombol "Tandai Lunas" pada order pending di `OrdersTable.tsx` dengan konfirmasi dan loading state**
- [ ] **Step 2: Tambahkan tombol "Export CSV" di header tabel order**
- [ ] **Step 3: Verifikasi build dan interaktivitas komponen**
- [ ] **Step 4: Commit**

---

### Task 3: Global Device Inspector Backend & API

**Files:**
- Modify: `src/lib/platform.ts` (tambahkan fungsi `listAllPlatformDevices`)
- Create: `src/app/api/platform/devices/route.ts`
- Create: `src/app/api/platform/devices/[id]/logout/route.ts`
- Create: `src/app/api/platform/devices/[id]/restart/route.ts`
- Create: `src/lib/platformDevices.test.ts`

- [ ] **Step 1: Implementasi `listAllPlatformDevices` di `src/lib/platform.ts` dengan paginasi, filter status, dan search**
- [ ] **Step 2: Buat route `GET /api/platform/devices`**
- [ ] **Step 3: Buat route `POST /api/platform/devices/[id]/logout` dan `restart` dengan integrasi OpenWA client dan audit log**
- [ ] **Step 4: Tulis unit test di `src/lib/platformDevices.test.ts` dan pastikan PASS**
- [ ] **Step 5: Commit**

---

### Task 4: Global Device Inspector Frontend & Navigation

**Files:**
- Create: `src/components/platform/DeviceInspectorTable.tsx`
- Create: `src/app/platform/devices/page.tsx`
- Modify: `src/components/platform/PlatformSidebar.tsx`

- [ ] **Step 1: Buat komponen `DeviceInspectorTable.tsx` dengan tabel interaktif, badge status, filter, dan tombol aksi Force Logout / Restart**
- [ ] **Step 2: Buat halaman `/platform/devices/page.tsx`**
- [ ] **Step 3: Tambahkan menu "Devices" pada `PlatformSidebar.tsx`**
- [ ] **Step 4: Jalankan typecheck dan full test suite**
- [ ] **Step 5: Commit & deploy readiness verification**
