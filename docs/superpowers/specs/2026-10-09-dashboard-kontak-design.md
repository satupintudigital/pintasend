# Dashboard Kontak (CRM & Audiens) — Design Spec

**Date:** 2026-10-09  
**Status:** Approved  
**Target:** `/dashboard/kontak`, `src/components/dashboard/ContactsPanel.tsx`, `src/components/dashboard/SidebarNav.tsx`, `src/app/dashboard/kontak/page.tsx`, `src/app/api/campaigns/contacts/**`

---

## 1. Background & Problem

Saat ini, halaman `/dashboard/kontak` memiliki isu akses dan kelengkapan:
1. **Redirect Issue:** `src/app/dashboard/kontak/page.tsx` memiliki guard ketat `if (session.user.role !== "owner") redirect("/dashboard");` serta link di `SidebarNav.tsx` hanya ditampilkan jika tenant memiliki addon `campaign`. Akibatnya, member/admin non-owner atau navigasi langsung mengalami redirect balik ke `/dashboard`, tampak seperti tombol tidak merespons.
2. **Addon Coupling:** Fitur penambahan dan impor kontak dinonaktifkan (`disabled={!hasAddon}`) bila tenant belum mengaktifkan addon campaign, padahal penyimpanan kontak adalah kapabilitas dasar CRM & segmentasi.
3. **Fitur UI Terbatas:** Belum ada dialog modal Edit Kontak, filter berdasarkan Tag / Opt-out, dan tombol Ekspor CSV kontak.

---

## 2. Goals & Non-Goals

### Goals
- Membuka akses `/dashboard/kontak` untuk seluruh role tenant (`owner`, `tenant_admin`, `member`).
- Menjadikan menu **Kontak** sebagai menu navigasi utama di sidebar dashboard (desktop & mobile).
- Memisahkan manajemen kontak dasar dari keharusan addon campaign (kontak dapat disimpan dan dikelola kapan saja).
- Melengkapi antarmuka:
  - Form/Modal Tambah Kontak baru (nomor, nama, tags, catatan).
  - Modal Edit Kontak (nama, tags, catatan, status opt-out).
  - Penghapusan kontak dengan konfirmasi.
  - Quick toggle status Opt-Out.
  - Pencarian debounced & filter tag.
  - Impor CSV massal dengan laporan hasil.
  - Ekspor daftar kontak tenant ke format CSV.

### Non-Goals
- Mengubah skema database Neon `Contact` (skema tabel saat ini sudah lengkap: `id`, `tenantId`, `chatId`, `name`, `tags`, `optedOut`, `notes`, `createdAt`, `updatedAt`).

---

## 3. Architecture & Access Control

### 3.1 Role Matrix
| Role | Akses `/dashboard/kontak` | Tambah / Edit / Hapus | Impor / Ekspor CSV |
|---|---|---|---|
| `member` | Ya | Ya | Ya |
| `tenant_admin` | Ya | Ya | Ya |
| `owner` | Ya | Ya | Ya |
| `platform_admin` (saat impersonate) | Ya | Ya | Ya |

### 3.2 Navigation Placement
Di `src/components/dashboard/SidebarNav.tsx`, pindahkan item `Kontak` dari `campaignItems` ke `items` standar:
```ts
const items = [
  { href: "/dashboard", label: "Beranda", icon: House },
  { href: "/dashboard/devices", label: "Device", icon: Devices },
  { href: "/dashboard/pesan", label: "Riwayat Pesan", icon: ChatCircleText },
  { href: "/dashboard/kontak", label: "Kontak", icon: Users },
  { href: "/dashboard/labels", label: "Labels", icon: Tag },
  { href: "/dashboard/bot", label: "Auto-Reply Bot", icon: Robot },
  { href: "/dashboard/channels", label: "Channels", icon: Radio },
  { href: "/dashboard/profile", label: "Profil", icon: UserCircle },
];
```

---

## 4. UI / UX Design (`ContactsPanel.tsx`)

### 4.1 Header & Actions
- **Title:** "Kontak"
- **Subtitle:** "Buku kontak & audiens campaign — {total} kontak terdaftar."
- **Action Buttons:**
  - `Muat Ulang` (refresh data)
  - `Ekspor CSV` (mengunduh CSV seluruh kontak tenant saat ini)
  - `Impor CSV` (upload file `.csv` dengan parser nomor, nama, tag)
  - `Tambah Kontak` (membuka modal/form input kontak)

### 4.2 Filter & Pencarian
- **Search bar:** Pencarian nomor telepon / nama kontak dengan debounce 350ms.
- **Tag filter dropdown / chip:** Filter instan kontak yang memiliki tag tertentu.
- **Status filter:** Filter Semua / Aktif / Opt-Out.

### 4.3 Table & Contact Card
- **Kolom Tabel:**
  1. **Kontak:** Nama kontak + Nomor WhatsApp (`chatId`).
  2. **Tags:** Badges warna lembut untuk tag-tag kontak.
  3. **Catatan:** Snippet catatan/keterangan tambahan.
  4. **Status:** Badge "Aktif" (hijau) atau "Opt-Out" (abu/merah muda).
  5. **Dibuat:** Tanggal pendaftaran kontak (format lokal ID).
  6. **Aksi:**
     - Tombol `Edit` (membuka modal edit)
     - Tombol `Toggle Opt-Out` (beralih status)
     - Tombol `Hapus` (menghapus kontak)
     - Tombol cepat `Kirim Pesan / Chat WhatsApp` (link langsung via `https://wa.me/<nomor>`).

### 4.4 Modal Edit Kontak
- Field yang dapat diedit:
  - **Nama:** Text input.
  - **Tags:** Text input dipisah koma atau titik koma.
  - **Catatan (Notes):** Textarea untuk catatan CRM.
  - **Opt-Out:** Checkbox untuk menandai opt-out dari blast campaign.

---

## 5. API Endpoints

Semua endpoint beroperasi di layer session tenant:
- `GET /api/campaigns/contacts?q=&tag=&optedOut=&page=&limit=`
  - Mengambil daftar kontak dengan filter dan pagination.
- `POST /api/campaigns/contacts`
  - Upsert kontak tunggal: `{ chatId|nomor, name?, tags?, notes? }`
  - Atau impor massal CSV: `{ csv: string }`
- `PATCH /api/campaigns/contacts/[id]`
  - Mengubah atribut kontak: `{ name?, tags?, optedOut?, notes? }`
- `DELETE /api/campaigns/contacts/[id]`
  - Menghapus kontak by id.

---

## 6. Testing & Verification

- **Unit Tests:**
  - Verifikasi parser CSV dan validasi nomor di `src/lib/contacts.test.ts`.
  - Verifikasi route handler `/api/campaigns/contacts` untuk role `member`, `tenant_admin`, dan `owner`.
- **Smoke Tests:**
  - Navigasi ke `/dashboard/kontak` tanpa redirect.
  - Tambah kontak baru dan pastikan tersimpan di Neon PostgreSQL.
  - Edit nama/tags/notes dan simpan perubahan.
  - Toggle status opt-out.
  - Ekspor CSV dan verifikasi file hasil download.
  - Hapus kontak dan verifikasi kontak terhapus dari daftar.
