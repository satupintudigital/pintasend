# Wavio — WhatsApp API Gateway untuk Bisnis

Dashboard + API gateway WhatsApp multi-tenant berbasis **OpenWA**. Produk mandiri Satu Pintu Digital (brand: **Wavio**), sekaligus addon integrasi NalaNiaga.

- **Produksi:** https://wavio.satupintudigital.co.id
- **Workers dev fallback:** https://wavio.xolution.workers.dev
- **Spec & plan:** `NalaNiaga/docs/superpowers/specs/2026-08-17-wa-gateway-saas-design.md` · `NalaNiaga/docs/superpowers/plans/2026-08-17-wavio-fase-0-1.md`
- **Spec & plan (Fase 4 — integrasi NalaNiaga):** `NalaNiaga/docs/superpowers/specs/2026-08-18-wavio-gateway-sso-design.md` · `NalaNiaga/docs/superpowers/plans/2026-08-18-wavio-gateway-sso.md`
- **Deploy OpenWA (v0.22.0):** [`docs/openwa-deploy.md`](docs/openwa-deploy.md)

## Arsitektur (aktual)

```
Browser ──► Cloudflare Workers (OpenNext Next.js 16)  ──► Neon Postgres (@neondatabase/serverless)
                │  wavio.satupintudigital.co.id            (raw SQL, WebSocket 443)
                ▼
        OpenWA via Cloudflare Tunnel  https://owa.nalaniaga.id  (VPS :2785)
```

- **Runtime DB:** raw SQL via `@neondatabase/serverless` (`src/lib/db.ts`). Prisma **tidak** berjalan di Worker (bundle > 3 MiB free tier). Prisma dipakai hanya untuk schema → generate DDL.
- **ID:** UUID v7 dibangkitkan aplikasi (`src/lib/uuidv7.ts`) — `@default(uuid(7))` Prisma tidak diterapkan oleh raw SQL.
- **OpenWA (v0.22.0):** hanya dicapai via hostname tunnel (`owa.nalaniaga.id`) — Worker memblokir fetch IP mentah (error 1003), dan port `2785` di VPS terikat `127.0.0.1` + tertutup firewall sehingga tidak bisa diakses via IP mentah. Detail deploy, upgrade, dan modifikasi compose lokal: [`docs/openwa-deploy.md`](docs/openwa-deploy.md).
- **Isolasi tenant:** semua query device di-scope `tenantId`; admin key OpenWA internal-only.

## Stack

Next.js 16 (App Router) · React 19 · TypeScript 5 · Tailwind CSS 4 · Auth.js v5 (credentials, JWT) · bcryptjs · Vitest · `@opennextjs/cloudflare` + wrangler.

## Setup lokal

```bash
npm install
cp .env.example .env   # isi DATABASE_URL, AUTH_SECRET, OPENWA_*
npm run db:seed        # seed demo: owner@wavio.test / admin123
npm run dev            # http://localhost:3000
```

## Script

| Script | Fungsi |
|---|---|
| `npm run dev` | Dev server |
| `npm test` | Unit test (vitest) |
| `npm run lint` | ESLint |
| `npm run db:seed` | Seed demo ke Neon |
| `npm run deploy` | Build + deploy ke Cloudflare Workers (OpenNext) |
| `npm run cf-typegen` | Generate `cloudflare-env.d.ts` |

## API publik (v1)

| Endpoint | Fungsi |
|---|---|
| `POST /v1/messages` | Kirim teks/media — dukung `mentions` (@ di grup) & `replyTo` (balasan) |
| `POST /v1/messages/send-template` | Kirim template tersimpan dengan `vars` |
| `POST`/`DELETE /v1/contacts/:number/block` | Blokir / buka blokir kontak |
| `POST /v1/chats/read` | Tandai chat/pesan dibaca |
| `GET /v1/contacts/check/:number` | Cek nomor terdaftar WhatsApp |
| `GET /v1/groups` | Daftar grup device |

Referensi lengkap: `src/app/docs/api/page.tsx` (halaman `/docs/api`).

## Integrasi NalaNiaga (Fase 4 — gateway SSO)

NalaNiaga memakai Wavio sebagai gateway WhatsApp tanpa konfigurasi manual:

- **SSO wizard** — NalaNiaga menerbitkan JWT HS256 (secret bersama `NALANIAGA_SSO_SECRET`) → pemilik toko diarahkan ke `wavio.satupintudigital.co.id/connect?token=` → scan QR → selesai otomatis via callback `POST /api/webhooks/wavio/callback` (API key + webhook secret toko dikirim balik, header `X-Wavio-Signature`)
- **Tenant auto-provision** — `findOrCreateTenantByNalaniaga` menautkan toko NalaNiaga (`nalaniagaStoreId`) ke tenant Wavio (tanpa tabel baru)
- **Webhook inbound dual-format** — NalaNiaga menerima event Wavio (`x-wavio-signature`) di endpoint webhook yang sama dengan jalur OpenWA lama

## Skema DB & migrasi

`prisma/schema.prisma` = source of truth. DDL diterapkan ke Neon via:

```bash
npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script > prisma/wavio-schema.sql
node prisma/apply-schema.mjs   # menerapkan SQL ke DATABASE_URL
```

## Env & secret

`.env` (lokal) dan `wrangler secret put` (Worker): `DATABASE_URL`, `AUTH_SECRET`, `OPENWA_BASE_URL` (`https://owa.nalaniaga.id`), `OPENWA_ADMIN_KEY`, `RESEND_API_KEY` + `EMAIL_FROM` (email via Resend, sender `Wavio <noreply@wavio.satupintudigital.co.id>`).

## Email (Resend)

Email transaksional via Resend: `src/lib/email.ts` (`sendEmail`, `sendWelcomeEmail`) + `POST /api/email`. Setup lengkap — akun, API key, verifikasi domain di Resend, records DNS Cloudflare, dan DMARC — ada di [`docs/resend-setup.md`](docs/resend-setup.md).
