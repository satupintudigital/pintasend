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
