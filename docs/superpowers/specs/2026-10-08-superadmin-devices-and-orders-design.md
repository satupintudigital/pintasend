# Design Spec: Superadmin Capabilities (Paket B) — Global Device Inspector & Manual Order Approval with Financial CSV Export

## 1. Overview & Objectives
Menambahkan 2 modul operasional utama pada superadmin PintaSend:
1. **Global Device & Session Inspector (`/platform/devices`)**:
   - Superadmin dapat memantau seluruh WhatsApp device dari semua tenant dalam satu tabel terpusat.
   - Menampilkan label device, tenant pemilik, status OpenWA (ready, authenticating, disconnected), nomor WA yang tertaut, waktu update terakhir.
   - Tindakan perbaikan langsung: **Force Logout**, **Restart Session / Re-sync**, dan **Inspect Session Status**.
2. **Manual Order Approval UI & Financial CSV Export (`/platform/orders`)**:
   - Di halaman `/platform/orders`, tambahkan tombol interaktif **"Tandai Lunas & Aktifkan"** untuk order yang berstatus `pending` (memanggil `POST /api/platform/orders/[id]/mark-paid` dan memicu `finalizePaidOrder`).
   - Fitur **Export CSV Laporan Keuangan Transaksi**: endpoint `GET /api/platform/orders/export` + tombol Download CSV di antarmuka orders.

---

## 2. Technical Architecture & Endpoints

### 2.1 Global Device Inspector
- **Query & Service**:
  - Fungsi `listAllPlatformDevices(params: { q?: string; status?: string; page?: number; limit?: number })` di `src/lib/platform.ts`.
  - Mengambil data dari Neon DB tabel `Device` di-join dengan `Tenant` (`d.id, d.label, d."tenantId", t.name AS "tenantName", d.status, d."phoneNumber", d."openwaSessionId", d."updatedAt", d."createdAt"`).
- **Endpoints**:
  - `GET /api/platform/devices`: Mengembalikan daftar device terpaginasi.
  - `POST /api/platform/devices/[id]/restart`: Trigger restart/sync status session OpenWA.
  - `POST /api/platform/devices/[id]/logout`: Force logout session device via OpenWA API.
- **UI Page & Components**:
  - Halaman `/platform/devices/page.tsx` dengan server fetch.
  - Komponen `src/components/platform/DeviceInspectorTable.tsx` dengan filter status, pencarian, dan action modal konfirmasi.
  - Navigasi sidebar `/platform`: Tambahkan menu **"Devices"** (ikon Phone / DeviceMobile).

### 2.2 Manual Order Approval & Financial CSV Export
- **Endpoints**:
  - `POST /api/platform/orders/[id]/mark-paid`: Sudah ada di backend, perlu dipastikan memanggil `finalizePaidOrder(orderId, { payMethod: "manual_admin", paidAt: new Date().toISOString() })`.
  - `GET /api/platform/orders/export`: Endpoint baru yang menghasilkan `text/csv` berisi seluruh order (`ID, Tenant, Jenis Order, Jumlah (Rp), Status, Metode Bayar, Tanggal Dibuat, Tanggal Lunas`).
- **UI Integration**:
  - Update `src/components/platform/OrdersTable.tsx`: Tambahkan tombol aksi **"Tandai Lunas"** pada baris order `pending` dan tombol **"Export CSV"** di header atas.

---

## 3. Security & Access Control
- Semua endpoint dilindungi oleh `requirePlatformAdmin(session)` via `src/lib/abac.ts`.
- Setiap approval manual dan tindakan device inspector mencatat audit log:
  - `order.manual_mark_paid`
  - `device.admin_restart`
  - `device.admin_force_logout`

---

## 4. Verification & Testing Plan
1. **Unit & Integration Tests**:
   - `platformDevices.test.ts`: Verifikasi query list devices dan action restart/logout.
   - `platformOrdersExport.test.ts`: Verifikasi formatting CSV order export.
   - `platformOrdersApproval.test.ts`: Verifikasi mark-paid trigger `finalizePaidOrder`.
2. **Manual & Smoke Test**:
   - Masuk ke `/platform/devices` -> Filter device -> Cek detail.
   - Masuk ke `/platform/orders` -> Klik tombol Export CSV -> Klik Tandai Lunas pada order pending -> Verifikasi status menjadi paid dan tenant aktif.
