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
| `POST /v1/messages/location` | Kirim pesan lokasi (koordinat + deskripsi) |
| `POST /v1/messages/contact` | Kirim kartu kontak (nama + nomor) |
| `POST /v1/messages/poll` | Kirim poll WhatsApp (2–12 pilihan) |
| `POST /v1/messages/react` | Beri / hapus reaksi emoji pada pesan |
| `POST /v1/messages/send-bulk` | Broadcast ke banyak penerima (async, kuota per penerima) |
| `GET /v1/messages/batch/:batchId` | Status batch broadcast (progress & hasil) |
| `GET /v1/messages/:chatId/history` | Baca riwayat chat langsung dari WhatsApp |
| `POST /v1/messages/send-template` | Kirim template tersimpan dengan `vars` |
| `POST`/`DELETE /v1/contacts/:number/block` | Blokir / buka blokir kontak |
| `POST /v1/chats/read` | Tandai chat/pesan dibaca |
| `GET /v1/contacts/check/:number` | Cek nomor terdaftar WhatsApp |
| `GET /v1/groups` | Daftar grup device |
| `GET`/`POST /v1/contacts` | Kontak audiens campaign — daftar / upsert tunggal / impor CSV |
| `PATCH`/`DELETE /v1/contacts/:id` | Sunting / hapus kontak audiens |
| `GET`/`POST /v1/campaigns` | Daftar & buat draft campaign blast (modul Campaign) |
| `GET /v1/campaigns/:id` | Detail campaign + progress per penerima |
| `POST /v1/campaigns/:id/start\|pause\|resume\|cancel` | Transisi status campaign |

Referensi lengkap: `src/app/docs/api/page.tsx` (halaman `/docs/api`).

## Modul Campaign (WA Blast)

Blast massal ratusan–ribuan penerima, digate `TenantAddon` key `campaign`:

- **Kontak audiens** — tabel `Contact` per tenant (chatId unik, tag JSON, opt-out); impor CSV di `/dashboard/kontak`.
- **Campaign** — template `{{nama}}/{{nomor}}/{{tanggal}}`, media opsional (URL publik), filter audiens by tag, jadwal, jeda acak antar pesan; UI di `/dashboard/campaign`.
- **Dispatcher** — `workers/campaign-dispatch` (HTTP on-demand): claim batch pending → kirim via OpenWA berjeda acak → cap harian per device → auto-pause saat device restriction/kuota habis → finalisasi + event webhook `campaign.completed` (via outbox `WebhookDelivery`).
- **Skema & migrasi:** `prisma/migrations/2026-08-21-campaign.sql` (apply: `node prisma/apply-migration.mjs prisma/migrations/2026-08-21-campaign.sql`).

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

## Sinkronisasi template NalaNiaga → Wavio → OpenWA

NalaNiaga adalah sumber canonical template. Publish dari dashboard NalaNiaga menyimpan perubahan secara lokal, memasukkannya ke outbox, lalu mengirim snapshot bertanda HMAC ke endpoint internal Wavio. Wavio mem-fan-out satu job per device dan worker `template-sync-wavio` membuat template OpenWA immutable (`nala_<event>_v<version>`) menggunakan operasi list/create saja.

- Endpoint internal: `POST /internal/nalaniaga/template-sync` (HMAC timestamp + nonce; bukan API tenant).
- Worker: `workers/template-sync` dipanggil via HTTP on-demand; offline device di-retry dengan backoff dan tidak menghentikan device lain. Tidak ada cron agar Neon dapat scale-to-zero.
- Pengiriman memakai nama canonical; Wavio menyelesaikan binding physical secara internal dan menerapkan watermark tepat satu kali.
- Set secret route Wavio pada deployment app: `WAVIO_TEMPLATE_SYNC_SECRET`.
- Set secret worker: `DATABASE_URL`, `OPENWA_ADMIN_KEY`, `TEMPLATE_SYNC_TOKEN`; URL OpenWA non-rahasia berada di `workers/template-sync/wrangler.jsonc`.
- Deploy worker secara terpisah: `npx wrangler deploy --config workers/template-sync/wrangler.jsonc`.

Jangan mengisi secret template sync di `NEXT_PUBLIC_*`, dan jangan menjalankan worker memakai database/schema yang berbeda dari Wavio app.

## Kebijakan Neon scale-to-zero

Semua worker yang memakai Neon (`template-sync`, `campaign-dispatch`, `webhook-delivery`, `d1-resync`, dan `message-retention`) sengaja tidak memiliki `triggers.crons` maupun handler `scheduled`. Masing-masing hanya berjalan ketika endpoint HTTP `POST` bertoken dipanggil, sehingga tidak ada invocation berkala yang membangunkan Neon saat idle.

Perubahan ini berlaku setelah setiap worker di-deploy ulang dengan file `workers/*/wrangler.jsonc` terbaru. Campaign dispatch, template sync, retry webhook, resync D1, dan retention harus dipicu on-demand melalui endpoint worker masing-masing; bila otomatisasi tetap diperlukan, gunakan scheduler eksternal yang hanya memanggil worker ketika memang ada pekerjaan.

## Email (Resend)

Email transaksional via Resend: `src/lib/email.ts` (`sendEmail`, `sendWelcomeEmail`) + `POST /api/email`. Setup lengkap — akun, API key, verifikasi domain di Resend, records DNS Cloudflare, dan DMARC — ada di [`docs/resend-setup.md`](docs/resend-setup.md).
