# Wavio — WhatsApp API Gateway untuk Bisnis

Dashboard + API gateway WhatsApp multi-tenant berbasis **OpenWA**. Produk mandiri Satu Pintu Digital (brand: **Wavio**), sekaligus addon integrasi NalaNiaga.

- **Produksi:** https://wavio.satupintudigital.co.id
- **Workers dev fallback:** https://wavio.xolution.workers.dev
- **Spec & plan:** `NalaNiaga/docs/superpowers/specs/2026-08-17-wa-gateway-saas-design.md` · `NalaNiaga/docs/superpowers/plans/2026-08-17-wavio-fase-0-1.md`

## Arsitektur (aktual)

```
Browser ──► Cloudflare Workers (OpenNext Next.js 16)  ──► Neon Postgres (@neondatabase/serverless)
                │  wavio.satupintudigital.co.id            (raw SQL, WebSocket 443)
                ▼
        OpenWA via Cloudflare Tunnel  https://owa.nalaniaga.id  (VPS :2785)
```

- **Runtime DB:** raw SQL via `@neondatabase/serverless` (`src/lib/db.ts`). Prisma **tidak** berjalan di Worker (bundle > 3 MiB free tier). Prisma dipakai hanya untuk schema → generate DDL.
- **ID:** UUID v7 dibangkitkan aplikasi (`src/lib/uuidv7.ts`) — `@default(uuid(7))` Prisma tidak diterapkan oleh raw SQL.
- **OpenWA:** hanya dicapai via hostname tunnel (`owa.nalaniaga.id`) — Worker memblokir fetch IP mentah (error 1003).
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

## Skema DB & migrasi

`prisma/schema.prisma` = source of truth. DDL diterapkan ke Neon via:

```bash
npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script > prisma/wavio-schema.sql
node prisma/apply-schema.mjs   # menerapkan SQL ke DATABASE_URL
```

## Env & secret

`.env` (lokal) dan `wrangler secret put` (Worker): `DATABASE_URL`, `AUTH_SECRET`, `OPENWA_BASE_URL` (`https://owa.nalaniaga.id`), `OPENWA_ADMIN_KEY`.
