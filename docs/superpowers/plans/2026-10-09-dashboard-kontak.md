# Dashboard Kontak (CRM & Audiens) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Membuka akses penuh halaman `/dashboard/kontak` untuk seluruh role tenant, memindahkan menu Kontak ke navigasi utama sidebar, serta melengkapi antarmuka ContactsPanel dengan fitur CRUD lengkap (Tambah, Edit, Hapus, Filter Tag/Opt-Out, Impor, dan Ekspor CSV).

**Architecture:** App Router Next.js 16 (`/dashboard/kontak`), komponen client `ContactsPanel.tsx`, navigasi `SidebarNav.tsx`, Neon PostgreSQL (`@/lib/db.ts` & `src/lib/contacts.ts`), Tailwind CSS + Phosphor Icons.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript 5, Tailwind CSS 4, Phosphor Icons, Neon Serverless Postgres.

## Global Constraints

- Kontak disimpan di tabel `Contact` (Neon Postgres); tidak ada ketergantungan wajib pada addon `campaign` untuk CRUD kontak dasar.
- Seluruh query DB Neon di-scope per `tenantId` dari sesi pengguna aktif.
- Role `member`, `tenant_admin`, dan `owner` memiliki hak akses melihat dan mengelola kontak tenant mereka.
- Semua parsing respons fetch client wajib menggunakan `.catch(() => ({}))` agar aman dari error JSON tak terduga.

---

### Task 1: Akses Role & Navigasi Sidebar

**Files:**
- Modify: `src/app/dashboard/kontak/page.tsx`
- Modify: `src/components/dashboard/SidebarNav.tsx`

**Interfaces:**
- Consumes: `auth()` dari `@/lib/auth`, `tenantHasCampaignAddon` dari `@/lib/campaigns`
- Produces: Akses `/dashboard/kontak` untuk seluruh role terautentikasi dan menu navigasi `Kontak` di sidebar utama

- [ ] **Step 1: Hapus guard role-owner pada `page.tsx`**

Edit `src/app/dashboard/kontak/page.tsx` untuk menghapus redirect `session.user.role !== "owner"`, sehingga `member` dan `tenant_admin` dapat mengakses halaman kontak.

```tsx
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { tenantHasCampaignAddon } from "@/lib/campaigns";
import { ContactsPanel } from "@/components/dashboard/ContactsPanel";

export default async function KontakPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const hasAddon = session.user.tenantId
    ? await tenantHasCampaignAddon(session.user.tenantId).catch(() => false)
    : false;

  return <ContactsPanel hasAddon={hasAddon} />;
}
```

- [ ] **Step 2: Pindahkan menu Kontak ke items utama pada `SidebarNav.tsx`**

Pindahkan item Kontak ke array `items` utama dan sisakan `campaignItems` hanya untuk item `Campaign`:

```tsx
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

const campaignItems = [
  { href: "/dashboard/campaign", label: "Campaign", icon: Megaphone },
];
```

- [ ] **Step 3: Verifikasi navigasi & type check**

Run: `npx tsc --noEmit`
Expected: PASS tanpa error type.

- [ ] **Step 4: Commit**

```bash
git add src/app/dashboard/kontak/page.tsx src/components/dashboard/SidebarNav.tsx
git commit -m "fix(nav): make contacts accessible to all tenant roles and promote to main sidebar"
```

---

### Task 2: Antarmuka Lengkap `ContactsPanel.tsx` (CRUD, Filter, Ekspor CSV)

**Files:**
- Modify: `src/components/dashboard/ContactsPanel.tsx`

**Interfaces:**
- Consumes: `/api/campaigns/contacts`, `/api/campaigns/contacts/[id]`
- Produces: Full CRM contact management UI (Add, Edit Modal, Delete, Tag filter, Opt-out filter, Export CSV, Direct WhatsApp link)

- [ ] **Step 1: Implementasi fitur lengkap pada `ContactsPanel.tsx`**

Update `src/components/dashboard/ContactsPanel.tsx` dengan:
1. Modal Edit Kontak (nama, tags, catatan, status opt-out).
2. Filter Tag & Status Opt-Out (Semua, Aktif, Opt-Out).
3. Ekspor CSV kontak yang terfilter / semua kontak.
4. Quick link WhatsApp (`https://wa.me/<nomor>`).
5. Tombol Tambah & Impor CSV yang selalu aktif tanpa mensyaratkan addon campaign.
6. Safe JSON parse dan penanganan error respons informatif.

- [ ] **Step 2: Verifikasi komponen & render test**

Run: `npx tsc --noEmit`
Expected: PASS tanpa error type.

- [ ] **Step 3: Commit**

```bash
git add src/components/dashboard/ContactsPanel.tsx
git commit -m "feat(kontak): enhance ContactsPanel with edit modal, tag filters, export CSV, and direct chat"
```

---

### Task 3: Unit Testing & Verification

**Files:**
- Create: `src/app/api/campaigns/contacts/route.test.ts`
- Modify: `src/lib/contacts.test.ts` (jika ada penambahan helper)

**Interfaces:**
- Consumes: GET, POST, PATCH, DELETE `/api/campaigns/contacts/**`
- Produces: Test coverage lengkap untuk alur kontak tenant

- [ ] **Step 1: Buat file test route kontak**

Tulis unit test untuk verifikasi operasi GET/POST pada `/api/campaigns/contacts` bagi role `member`, `tenant_admin`, dan `owner`.

- [ ] **Step 2: Jalankan test suite**

Run: `npm test`
Expected: Semua unit tests lulus (100% green).

- [ ] **Step 3: Verifikasi build & commit**

Run: `npm run build`
Expected: Build Next.js dan OpenNext berhasil tanpa error.

```bash
git add src/app/api/campaigns/contacts/route.test.ts
git commit -m "test(contacts): add comprehensive route tests for contact management"
```
