# SDD — Self-Serve Billing (2026-09-04)
# plan: docs/superpowers/plans/2026-09-04-self-serve-billing.md
Task 0: complete (worktree feat/self-serve-billing dari main 52cf1d7; baseline 849 test hijau, tsc bersih)
Task 1: complete (commits 52cf1d7..919a5fb, review clean — migration+prisma+d1+seed, 849 test hijau, tsc bersih)
Task 2: complete (commits 919a5fb..1b946a3, review clean — catalog.ts + 4 key PlatformSetting, 852 test hijau, tsc bersih)
Task 3: complete (commits 1b946a3..HEAD, review clean — credit.ts, 856 test hijau, tsc bersih)
Task 4: complete (commits 1e07291..HEAD, review clean — payments.ts + providers/tripay.ts, 862 test hijau, tsc bersih)
Task 5: complete (commits d368468..HEAD, review clean — billing.ts order service + syncTenantD1, 876 test hijau, tsc bersih)
Task 6: complete (commits d9b5c22..HEAD, review clean — billingRenewal.ts + syncTenantD1/setTenantSuspended, 884 test hijau, tsc bersih)

- **Task 7 — Registrasi publik + gate tenant pending** ✅ (commit 097ddc6)
  - register.ts (validate+create Tenant/User/TenantBalance+welcome email), tenantGate.ts
  - Route POST /api/auth/register + gate pending di login/API key/devices
  - 895 test hijau (+11), tsc OK

## Task 8: Route API billing + keputusan "top-up pertama = aktivasi Espresso" — complete
- Keputusan user (ask_user): tenant baru yg pilih Espresso aktif lewat TOP-UP PERTAMA (assign plan prepaid + activatedAt; tanpa biaya aktivasi). Diterapkan di billing.ts (createOrder topup terima planId prepaid; finalizePaidOrder topup: aktivasi bila tenant pending, guard `activatedAt IS NULL` race-safe + syncTenantD1) + gate route orders.
- billing.ts: + listPendingGatewayOrders (resync admin).
- Routes baru: GET /api/public/catalog (tanpa auth, s-maxage 60), POST /api/billing/orders (guard owner/tenant_admin; first_subscription hanya utk tenant pending + plan subscription + addon berbayar; renewal harus planId = plan tenant aktif; addon & renewal butuh tenant aktif; topup min rupiah catalog; topup pending = aktivasi Espresso dgn planId prepaid), GET /api/billing/orders/[id] (scope tenant, refresh status bila lewat expiresAt), GET /api/billing/my (renewal lazy dulu; plan join Tenant×Plan + balance + orders + pending + deviceCount), POST /api/billing/sync (platform admin; expire + checkStatus Tripay → finalize/mark).
- Test: +54 (938 total), tsc bersih.
- Catatan lint pra-ada tidak disentuh.

## Task 9: Callback Tripay — complete
- src/app/api/billing/tripay/callback/route.ts: webhook tanpa session; verifikasi X-Callback-Signature (HMAC body) via provider.verifyCallback; merchant_ref=order.id → getOrderAnyScope; PAID → finalizePaidOrder (callbackRaw tersimpan); EXPIRED → markOrderExpiredFromGateway; UNPAID/REFUND/FAILED → 200 tanpa aksi; order tak dikenal → 200 (tanpa info leak); 200 setelah proses (Tripay retry non-2xx).
- Test 6: signature salah → 401; PAID finalize + callbackRaw; PAID order tak dikenal → 200; EXPIRED → mark; UNPAID → tanpa aksi; ganda PAID → 200 2x (idempoten di finalize). +6 (944 total), tsc bersih.

## Task 10: Addon kedaluwarsa (activeUntil) di config tenant — complete
- tenantConfig.ts: + tenantAddonActiveWhere(alias) (active=true AND (activeUntil IS NULL OR > now())); SELECT Plan + p.kind; TenantPlanConfig.kind (subscription|prepaid|null); EMPTY_CONFIG plan.kind=null; EXISTS addon di fetchFromNeon pakai kondisi aktif-terpusat.
- watermark.ts tenantHasRemoveWatermark, delay.ts getTenantDelayInfo, platform.ts getTenantDetail: EXISTS addon pakai tenantAddonActiveWhere (addon kedaluwarsa dianggap nonaktif). campaigns.ts via getTenantConfig otomatis ikut.
- platform.ts setTenantAddon: grant (active=true) → activeUntil=NULL (permanen); revoke mempertahankan activeUntil lama.
- Mock cfg.plan di sendMessage/sendTemplate.test + kind:"subscription" (disiapkan untuk Task 11 metering). Test: +tenantConfig.test (helper), watermark aktif-until SQL, delay SQL alias. 947 total, tsc bersih.

## Task 11: Metering kirim prepaid (Espresso) — complete
- credit.ts: + prepaidSendGate(planKind, tenantId, needed) — prepaid butuh saldo ≥ needed sebelum OpenWA (INSUFFICIENT_CREDIT); subscription/null lolos tanpa query DB. Test 4 baru.
- sendMessage/sendTemplate/sendRichMessage: gate 402 pasca-quota; pasca-kirim sukses spendCredit messages=1 refId=messageId??`send-|tpl-|rich-${uuidv7}` best-effort (.catch logEvent credit_spend_failed). sendBulk: gate needed=count (batch N penerima = N pulsa), pasca-submit potong total count refId=`bulk:${batchId}` (batch jalan async di OpenWA).
- Test 4 file +16: saldo 0 → 402 INSUFFICIENT_CREDIT tanpa OpenWA/spend; saldo cukup → kirim & potong dgn refId benar; subscription → tanpa potong. 963 total (+16), tsc bersih.
- Catatan: worker campaign-dispatch & platform-broadcast potong kredit = fase-2 (TODO di plan), tidak dikerjakan.

## Task 12: UI publik — Pricing dinamis, Register, Checkout — complete
- Pricing.tsx: fetch /api/public/catalog (useEffect .then), skeleton/error; toggle tahunan dihapus; kartu plan data-driven (format harga prepaid per-pesan / subscription per-bulan); CTA → /register?plan=; kartu add-on berbayar dari catalog.
- /register: form nama/email/password/nama tenant + radio plan (semua plan, incl. Espresso utk aktivasi top-up) + checkbox add-on berbayar + Turnstile (wajib hanya bila env siteverify diset); POST /api/auth/register → push redirectTo; sudah login → redirect ke /checkout (cegah akun duplikat).
- /checkout: baca query plan/addon/topup/creditMessages + /api/billing/my (auth 401 → ajakan login); mode subscription (first_subscription + bundle addon), topup (aktivasi Espresso bila pending dgn planId prepaid; clamp min top-up), addon; daftar channel Tripay statis; POST /api/billing/orders; PayCodePanel (kode bayar/copy/CTA bayar + countdown) & polling 5 dtk → paid → /dashboard/langganan?paid=1; expired state.
- Lint & tsc bersih pada 4 file; 963 test tetap hijau.

## Task 13: Dashboard Langganan + platform orders/plan/settings — complete
- /dashboard/langganan (server auth) + SubscriptionDashboard: kartu plan + kuota (device/user/pesan) + periode, saldo pulsa + modal top-up (→ /checkout?topup=1&creditMessages=), daftar order/tagihan dgn badge status + Bayar Sekarang (→ /checkout?kind=renewal), add-on beli mandiri, banner aktivasi saat pending.
- SidebarNav + dashboard layout: menu Langganan (owner/tenant_admin); saat tenant pending hanya Beranda/Langganan/Profil yang tampil (getTenantActivation di layout).
- Checkout + mode renewal_subscription (attach payment ke order renewal tanpa gateway — createOrder idempoten).
- Platform: menu Orders; /platform/orders + OrdersTable (filter status + tombol Resync Tripay → POST /api/billing/sync + refresh); listPlatformOrders di platform.ts; PlansTable + isPublic/sortOrder input & label kind; plans PUT terima isPublic/sortOrder (PlanPatch/updatePlan); SettingsForm + 4 input billing (activation_fee_rp, credit_price_per_message, credit_min_topup_rp, order_expiry_minutes).
- tsc & lint bersih; 963 test hijau.

## Task 14: Worker D1 resync, docs, env, verifikasi akhir — complete
- workers/d1-resync/worker.js: spec "tenant" kini sync activatedAt (Neon → D1) — gate login/API key D1 butuh membedakan pending vs aktif; INSERT OR REPLACE 4 kolom.
- .env.example: seksi 🔗 TRIPAY (TRIPAY_MODE sandbox/production, TRIPAY_API_KEY, TRIPAY_PRIVATE_KEY, TRIPAY_MERCHANT_CODE) + catatan callback URL.
- README.md: seksi "Self-serve billing (registrasi publik + pembayaran)" (alur, top-up pertama = aktivasi, renewal, saldo, addon activeUntil, UI) + Tripay env + update seksi Env & secret.
- src/app/docs/api/page.tsx: 6 endpoint billing baru di tabel daftar + seksi "Self-serve billing — registrasi & pembayaran" (catalog, register, orders, my, sync, callback Tripay).
- docs/wavio-fitur-review.md: gap "jual paket ke user" ditandai tertutup (self-serve billing).
- Lint: tripay.ts no-explicit-any dibereskan (TripayJson + dataRecord, tanpa cast any); 4 error tersisa = pra-ada dashboard channels/labels/profile. Warnings baru dibersihkan (import tak terpakai register.ts/route.test.ts/register.test.ts).
- Verifikasi: npx tsc --noEmit bersih; npm run test 963 hijau (119 file); lint hanya 4 error pra-ada.

## Verifikasi akhir (Task 14 checklist)
- [x] npx tsc --noEmit bersih
- [x] npm run test → 963 hijau (119 file)
- [x] npm run lint → hanya 4 error pra-ada (dashboard channels/labels/profile)
- [x] Migrasi Neon 2026-09-04-self-serve-billing.sql di-apply ke production (idempotent; 20 statement OK) + verifikasi objek
- [x] D1: kolom activatedAt di-apply ke wavio-auth (ALTER TABLE + backfill 3 tenant dari Neon)
- [x] Deploy: merge → npm run deploy + deploy ulang workers/d1-resync (4 kolom tenant)
- [ ] Secret Tripay di worker wavio (TRIPAY_MODE/API_KEY/PRIVATE_KEY/MERCHANT_CODE) + .env — DITUNDA: Tripay sedang menutup pendaftaran (per 2026-09-05). Re-check pendaftaran Tripay nanti; sebelum itu alur checkout/order belum bisa diuji end-to-end (paywall self-serve nonaktif sementara).

## Deploy ke production (2026-09-05)
- Merge `feat/self-serve-billing` → main (fast-forward, tip cdefbb5).
- `npm run deploy`: wavio Version ce579d08-f427-4613-8693-c0402f318395 live di wavio.satupintudigital.co.id.
- `npx wrangler deploy --config workers/d1-resync/wrangler.jsonc`: d1-resync-wavio Version 5ca89919-4434-4e34-a0f5-677a60e4211b (spec tenant 4 kolom + activatedAt).
- Smoke test live: / 200, /register 200, /checkout 200, /api/public/catalog 200 (data plan+addon dari Neon), /login 200, /dashboard/langganan & /platform/orders 307 (redirect login, wajar), /pricing 404 (bukan route — pricing adalah seksi di landing /).
- D1 wavio-auth tetap konsisten: 3 tenant activatedAt terisi; write-through main kini 4 kolom sehingga tidak menimpa activatedAt.

## E2E live registrasi publik (2026-09-05) + bug turnstile fixed
- E2E Chrome asli (puppeteer-core) di production: register akun unik → plan Latte otomatis terseleksi → turnstile resolved → redirect /checkout?plan=… → POST /api/devices 403 "Tenant belum aktif" (TENANT_PENDING) → /api/billing/my pending:true → /dashboard/langganan banner "Akunmu belum aktif" + menu hanya Beranda/Langganan/Profil (operasional tersembunyi). Semua PASS.
- BUG DITEMUKAN: route register POST token turnstile sbg raw string ke siteverify worker → request.json() gagal → captcha SELALU ditolak (registrasi publik tidak mungkin lolos). Diperbaiki commit e1fbc90 (kirim JSON { token }, kontrak sama dgn login page) + 1 test regresi. Sudah di-deploy (wavio Version 5a74f8ef).
- Cleanup E2E: tenant uji dihapus dari Neon + D1 (tidak ada sisa data test).

## Helper fetch terpusat postJson (2026-09-05)
- src/lib/http.ts: postJson(url, body, init?, fetchImpl?) — method selalu POST; body SELALU JSON.stringify; Content-Type application/json DIPAKSA (tidak bisa ditimpa header custom); fetchImpl injectable utk unit test. Mencegah regresi bug raw-body (register route pernah kirim token sbg raw string → siteverify selalu tolak).
- Route register dipakai sbg contoh pertama (ganti fetch manual). 5 test baru src/lib/http.test.ts (body stringify, primitive string dibungkus literal, header merge content-type dipaksa, init lain diteruskan, return Response).
- Catatan: endpoint HMAC (webhook-delivery, nalaniagaSso) sengaja TIDAK pakai helper — butuh raw body sama persis utk signature; komentar di http.ts menjelaskan.
- Commit a890d2a + style fix 4b03e23 (type alias utk PostJsonInit — lint). 969 test hijau (+5), tsc bersih, lint bersih. Deploy: wavio Version bfc65513. Smoke live: /register 200, /checkout 200, /api/public/catalog 200.

## Apply migrasi Neon + D1 (2026-09-05)
- Neon production (ep-silent-block-azloxik2/neondb): `node prisma/apply-migration.mjs prisma/migrations/2026-09-04-self-serve-billing.sql` → 20 statement OK (idempotent).
- Verifikasi objek: kolom baru ada (Plan.kind/isPublic/sortOrder, Tenant.activatedAt/planPeriodEnd, TenantAddon.activeUntil); tabel Addon/Order/TenantBalance/CreditLedger + index; Plan Espresso→prepaid, Latte/Mocha subscription (isPublic true); Addon ter-seed (random_delay Rp25rb, remove_watermark, campaign); 3 tenant backfill activatedAt=createdAt.
- D1 wavio-auth (remote): `ALTER TABLE Tenant ADD COLUMN activatedAt TEXT` (CREATE TABLE IF NOT EXISTS di d1-schema.sql tak cukup utk tabel lama) + UPDATE backfill 3 tenant (Toko Budi, Wavio Demo, Wavio Platform) dari nilai Neon.
- Catatan urutan deploy: kode main SAAT INI masih menulis Tenant 3 kolom (tenantStore.ts, workers/d1-resync 3 kolom) — INSERT OR REPLACE akan menimpa activatedAt ke NULL. Wajib deploy kode feat/self-serve-billing + d1-resync 4 kolom SEBELUM ada operasi tulis Tenant (suspend/plan) pasca-migrasi.

## Refactor: openwa & tripay pakai helper jsonFetch/postJson (2026-09-05)
- http.ts: tambah jsonFetch(method POST/PUT/PATCH, url, body, init, fetchImpl); postJson jadi wrapper jsonFetch("POST"). +3 test jsonFetch (PUT/PATCH body+content-type; postJson≡jsonFetch POST). http.test.ts root kini 8 test.
- openwa.ts: request() menyerialisasi body TERSTRUKTUR via jsonFetch (single source of truth); ~35 call site berhenti memanggil JSON.stringify manual (kirim objek langsung). init.body bertipe unknown; GET/DELETE tanpa body tetap fetch biasa + header X-API-Key. Import relatif ./http (konvensi modul ini).
- tripay.ts: tripayFetch pakai postJson utk body create (signature Tripay TIDAK terikat raw body — dari method+merchant_ref+amount); GET status/channels tetap fetch biasa. payments.test.ts assertion header diubah ke Headers.get (robust thd Headers instance dari postJson) + assert content-type.
- Tidak disentuh (sengaja): nalaniagaSso/webhookDelivery (HMAC atas raw body — butuh fetch manual persis), workers/* (unit deploy terpisah, tak bisa import src/lib).
- Commit c0884ae (branch feat/self-serve-billing). 972 test hijau (+3), tsc bersih, lint bersih (5 file berubah). Catatan: npm run test dari root ikut menjalankan .worktrees → artefak double-run (alias @/ nyampur tree) — verifikasi full suite selalu dari dalam worktree.

## Helper GET/query + vitest exclude + shared worker helper (2026-09-05)
- http.ts: tambah getJson(url, { query }) — query object diserialisasi URLSearchParams terpusat (null/undefined di-skip, array diulang, gabung dgn & bila URL sudah ?). 6 test baru (encoding, skip null/undefined, array berulang, tanpa query, URL existing, headers/signal).
- openwa.ts: request() pakai getJson utk GET (init.query dipisah dari body); URLSearchParams manual di listMessages/listChats/listGroups → query object. DELETE tanpa body tetap fetch langsung. tripay.ts: tripayFetch GET via getJson; reference checkStatus → query object.
- vitest.config.ts: exclude "**/.worktrees/**" — npm run test dari root sebelumnya ikut menjalankan checkout worktree (alias @/ nyampur dua pohon kode → 48 test hijau tampak gagal dari 2790). Kini root full suite = 978 hijau (120 file), sama dgn run dari dalam worktree.
- workers/shared/http.js (baru): sibling JS polos dari src/lib/http.ts (worker tak bisa import TS src/lib) — postJson/jsonFetch body selalu JSON.stringify + Content-Type dipaksa; getJson serialisasi query. template-sync (openwaRequest) & campaign-dispatch (openwaSend + guard sesi GET) refactor ke helper; JSON.stringify manual di call site hilang. Wrangler dry-run bundling OK utk keduanya.
- Commit: 1da6f9e (vitest exclude), 6fa1eb5 (getJson + openwa/tripay), 5ea834f (worker shared helper). 978 test hijau, tsc bersih, lint bersih.
- Lanjutan: platform-broadcast (openwaSendText) pakai shared helper (commit e190996, deploy Version 7d67dff9). d1-resync & message-retention hanya fetch handler inbound (tanpa HTTP keluar); turnstile (FormData) & webhook-delivery (raw body ber-HMAC) tidak memakai helper JSON — sudah tervalidasi.
- workers/shared/http.test.js: 12 test kontrak postJson/jsonFetch/getJson (commit ead5546). 990 test hijau (root & worktree), lint bersih. Test-only — tanpa deploy produksi.
- docs/http-helpers.md (baru, commit e84a868): kontrak helper HTTP JSON terpusat utk developer baru — src/lib/http.ts & sibling workers/shared/http.js, kasus yg sengaja tidak memakai helper, checklist, cara test. Ditautkan dari README.
- Audit menyeluruh fetch di src (2026-09-05): server-side SUDAH patuh penuh (lib/route/worker via helper atau raw sengaja utk HMAC/FormData; docs/* hanya teks contoh literal). Sisa fetch = client same-origin (browser → /api sendiri, body benar, DELETE/FormData/AbortSignal tanpa helper). Keputusan user: server-side saja — docs/http-helpers.md §4 ditambah tabel hasil audit + scope client di luar (commit e2376ad). Tanpa perubahan kode produksi.
- Review fitur lanjutan (2026-09-05) → docs/wavio-fitur-review.md §8 (commit f610950): state pasca self-serve billing terverifikasi; 8 gap (katalog plan/addon tanpa UI, rekonsiliasi manual order, renewal tak otomatis, metrik bisnis, invoice vs order, offboarding, /pricing, secret Tripay); roadmap P0–P3. Docs-only, tanpa deploy.
