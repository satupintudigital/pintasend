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
