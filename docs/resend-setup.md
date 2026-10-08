# Setup Email Resend (PintaSend)

Setup lengkap email transaksional PintaSend via Resend: akun, API key, integrasi
kode, verifikasi domain pengirim, dan **DMARC**.

Alur sekali jalan: daftar akun → API key → buat domain di Resend → tambah
records DNS di Cloudflare → verifikasi → (disarankan) DMARC.

---

## 1. Akun & API key

- Satu akun Resend gratis **per produk** (free plan: 3.000 email/bulan,
  100 email/hari, **1 domain per akun**). NalaNiaga, akuntansi, dst. daftar
  akun sendiri-sendiri — kuota & key tidak saling memakan.
- Buat API key di <https://resend.com/api-keys>, simpan di `pintasend/.env`:

  ```bash
  RESEND_API_KEY="re_xxxxxxxxx"   # ganti dengan key asli
  EMAIL_FROM="PintaSend <noreply@pintasend.satupintudigital.co.id>"
  ```

  `EMAIL_FROM` harus dari domain yang sudah diverifikasi (langkah 3).

  ⚠ **Dua jenis key berbeda**: `scripts/test-email.ts` & kode kirim (`src/lib/email.ts`)
  cukup key dengan permission **Sending access**. Sementara `scripts/resend-domain.ts`
  (buat/status/verify domain) butuh key dengan permission **Domain access** — key
  send-only akan gagal 401 `restricted_api_key` saat memanggil `/domains`. Bila
  `RESEND_API_KEY` di `.env` send-only, jalankan `resend-domain.ts` dengan key domain
  terpisah: `RESEND_API_KEY=re_... npx tsx scripts/resend-domain.ts status`.

## 2. Komponen kode (sudah ada)

| File | Fungsi |
|---|---|
| `src/lib/email.ts` | `sendEmail` (kirim mentah) + `sendWelcomeEmail` (never-throw, dipanggil saat akun dibuat) |
| `src/app/api/email/route.ts` | `POST /api/email` — auth + rate-limit + validasi, delegasi ke `sendEmail` |
| `src/app/api/platform/tenants/route.ts` · `[id]/users/route.ts` | kirim welcome email saat provisioning tenant / tambah user |
| `scripts/test-email.ts` | tes kirim hello-world (`npx tsx scripts/test-email.ts`) |
| `scripts/resend-domain.ts` | kelola domain Resend: `create` / `status` / `records` / `verify` |

## 3. Verifikasi domain pengirim

Domain PintaSend: `pintasend.satupintudigital.co.id` (subdomain produk, sudah di
Cloudflare — zone `satupintudigital.co.id`).

1. Buat domain di Resend (region `ap-northeast-1` — terdekat dengan mayoritas
   penerima di Indonesia):

   ```bash
   npx tsx scripts/resend-domain.ts create pintasend.satupintudigital.co.id
   ```

   Catat `<domainId>` dari output.

2. Tambahkan **semua records yang dicetak** (SPF TXT, DKIM CNAME, MX) di
   Cloudflare. Salin `name` & `value` apa adanya — Cloudflare menormalkan nama
   FQDN otomatis. Records ini hidup berdampingan dengan A/AAAA Worker yang ada.

3. Tunggu propagasi (biasanya < 15 menit, maks 72 jam), lalu picu verifikasi:

   ```bash
   npx tsx scripts/resend-domain.ts verify <domainId>
   npx tsx scripts/resend-domain.ts status    # status=verified
   ```

   Cek visibility records publik: <https://dns.email> (tool Resend).

## 4. DMARC (disarankan setelah domain verified)

Prasyarat: domain sudah `verified` — artinya SPF & DKIM sudah lolos (DMARC
bergantung pada keduanya).

Tambahkan **satu TXT record** di Cloudflare (zone `satupintudigital.co.id`):

| Name | Type | Value |
|---|---|---|
| `_dmarc.pintasend.satupintudigital.co.id` | TXT | `v=DMARC1; p=none; rua=mailto:dmarcreports@pintasend.satupintudigital.co.id;` |

Panduan:

- **Mulai dengan `p=none`** (mode monitoring) — jangan langsung
  `quarantine`/`reject` sebelum yakin semua email sah lolos DMARC.
- `rua` (alamat laporan agregat) harus **inbox sungguhan** yang bisa menerima
  email — boleh beda domain dari yang diverifikasi, mis. `dmarc@satupintudigital.co.id`.
- Kirim email uji dari semua sumber (PintaSend, dsb.), cek header menunjukkan
  `dmarc=pass`, lalu naikkan kebijakan bertahap:
  `p=quarantine;` → `p=reject;` (update nilai record yang sama).
- Referensi lengkap: <https://resend.com/docs/dashboard/domains/dmarc>

## 5. Production (Cloudflare Worker)

Secret Worker (bukan di `wrangler.jsonc`):

```bash
npx wrangler secret put RESEND_API_KEY
npx wrangler secret put EMAIL_FROM
```

## 6. Tes end-to-end

```bash
npx tsx scripts/test-email.ts
```

Verifikasi email diterima + header `dmarc=pass` di inbox tujuan.
