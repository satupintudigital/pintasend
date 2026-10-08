# Random Delay Kirim Pesan (Anti-Spam) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Menambahkan delay acak 3–10 detik sebelum kirim pesan keluar (config per tenant, gratis di plan Mocha, addon untuk plan lain) + pencatatan `triggeredAt`/`sentAt` di MessageLog untuk analitik.

**Architecture:** Config & entitlement disimpan di Neon (`Tenant.delayEnabled`, `Plan.includesDelay`, tabel baru `TenantAddon`). Jalur kirim `POST /v1/messages` membaca config (1 query), lalu menunda pengiriman secara sinkron dengan `sleep(acak 3–10 dtk)`; kedua timestamp dicatat di `MessageLog`. Admin platform mengatur semuanya via halaman `/platform`. D1 TIDAK berubah.

**Tech Stack:** Next.js 16 (App Router), Neon Postgres (via `@neondatabase/serverless`, helper `@/lib/db`), D1/KV (tidak disentuh), Vitest, Tailwind 4, Phosphor icons.

## Global Constraints

- Semua SQL memakai helper `query`/`queryOne` dari `@/lib/db` (Neon serverless; prepared statement — jangan interpolasi nilai).
- Bahasa UI & komentar: **Indonesia** (ikuti konvensi codebase).
- Konstanta delay: `DELAY_MIN_MS = 3000`, `DELAY_MAX_MS = 10000` (rentang inklusif).
- Addon pertama: `key = 'random_delay'` (whitelist ketat di route API).
- Fitur aktif = `Tenant.delayEnabled AND (Plan.includesDelay OR TenantAddon('random_delay').active)`.
- `insertMessageLog` tetap best-effort (gagal log ≠ gagal kirim).
- D1 (`verifyApiKey`, login, device ingest) TIDAK berubah — config delay hanya dibaca di jalur `v1/messages` (Neon).
- `pintasend-schema.sql` (skema dasar lama, belum punya Plan) TIDAK diubah — migrasi incremental memakai `prisma/migrations/*.sql`.
- Semua command dijalankan dari direktori `pintasend/`.

---

### Task 1: Migrasi DB + schema.prisma + seed

**Files:**
- Create: `prisma/migrations/2026-08-18-message-delay.sql`
- Modify: `prisma/schema.prisma`
- Modify: `prisma/seed.ts`

**Interfaces:**
- Produces: kolom `Plan.includesDelay`, `Tenant.delayEnabled`, `MessageLog.triggeredAt`/`sentAt`, tabel `TenantAddon(id, tenantId, key, active, createdAt, updatedAt, UNIQUE(tenantId,key))`.

- [ ] **Step 1: Tulis file migrasi**

`prisma/migrations/2026-08-18-message-delay.sql`:

```sql
-- Fitur random delay kirim pesan (anti-spam) + analitik delay.
-- Lihat docs/superpowers/specs/2026-08-18-message-delay-design.md

-- Plan yang menyertakan fitur delay GRATIS (seed: Mocha = TRUE).
ALTER TABLE "Plan" ADD COLUMN IF NOT EXISTS "includesDelay" BOOLEAN NOT NULL DEFAULT FALSE;

-- Config per tenant (diatur platform admin).
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "delayEnabled" BOOLEAN NOT NULL DEFAULT FALSE;

-- Addon per tenant (extensible: cukup key baru, tanpa migrasi).
CREATE TABLE IF NOT EXISTS "TenantAddon" (
  id          TEXT PRIMARY KEY,
  "tenantId"  TEXT NOT NULL REFERENCES "Tenant"(id) ON DELETE CASCADE,
  key         TEXT NOT NULL,
  active      BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "TenantAddon_tenantId_key_key" UNIQUE ("tenantId", key)
);
CREATE INDEX IF NOT EXISTS idx_tenantaddon_tenant ON "TenantAddon"("tenantId");

-- Waktu trigger & waktu kirim pesan keluar (delay aktual = sentAt - triggeredAt).
-- NULL untuk pesan masuk.
ALTER TABLE "MessageLog" ADD COLUMN IF NOT EXISTS "triggeredAt" TIMESTAMPTZ;
ALTER TABLE "MessageLog" ADD COLUMN IF NOT EXISTS "sentAt" TIMESTAMPTZ;
```

- [ ] **Step 2: Update `prisma/schema.prisma`**

Model `Plan` — tambah setelah `maxMessagesPerMonth`:

```prisma
  maxMessagesPerMonth Int?
  includesDelay       Boolean  @default(false)
```

Model `Tenant` — tambah relasi addon + kolom (setelah `suspendedAt`):

```prisma
  delayEnabled        Boolean        @default(false)
  addons              TenantAddon[]
```

Model baru (taruh setelah `Tenant`):

```prisma
model TenantAddon {
  id        String   @id @default(uuid(7))
  tenantId  String
  tenant    Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  key       String
  active    Boolean  @default(true)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt @default(now())

  @@unique([tenantId, key])
}
```

Model `MessageLog` — tambah setelah `createdAt`:

```prisma
  triggeredAt DateTime?
  sentAt      DateTime?
```

- [ ] **Step 3: Update `prisma/seed.ts`** — Mocha `includesDelay: true`

Ganti blok insert plan:

```ts
  const plans = [
    { id: "00000000-0000-7000-8000-000000000101", name: "Espresso", tagline: "Bayar sesuai pakai", priceDisplay: "Rp 400/pesan", maxDevices: 1, maxUsers: 3, maxMessagesPerMonth: null, includesDelay: false },
    { id: "00000000-0000-7000-8000-000000000102", name: "Latte", tagline: "Paling laris", priceDisplay: "Rp 150.000/bulan", maxDevices: 3, maxUsers: 5, maxMessagesPerMonth: 500, includesDelay: false },
    { id: "00000000-0000-7000-8000-000000000103", name: "Mocha", tagline: "Unlimited", priceDisplay: "Rp 300.000/bulan", maxDevices: 10, maxUsers: 20, maxMessagesPerMonth: null, includesDelay: true },
  ];
  for (const p of plans) {
    await client.query(
      'INSERT INTO "Plan" (id, name, tagline, "priceDisplay", "maxDevices", "maxUsers", "maxMessagesPerMonth", "includesDelay") VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (id) DO NOTHING',
      [p.id, p.name, p.tagline, p.priceDisplay, p.maxDevices, p.maxUsers, p.maxMessagesPerMonth, p.includesDelay],
    );
  }
```

- [ ] **Step 4: Verifikasi** — `npx tsc --noEmit` (di `pintasend/`) → harus sukses (schema.prisma bukan input tsc, tapi memastikan tidak ada regresi).
- [ ] **Step 5: Commit**

```bash
git add prisma/migrations/2026-08-18-message-delay.sql prisma/schema.prisma prisma/seed.ts
git commit -m "feat: migrasi & schema random delay (includesDelay, delayEnabled, TenantAddon, triggeredAt/sentAt)"
```

---

### Task 2: Lib `src/lib/delay.ts` + unit test

**Files:**
- Create: `src/lib/delay.ts`
- Create: `src/lib/delay.test.ts`

**Interfaces:**
- Produces:
  - `DELAY_MIN_MS = 3000`, `DELAY_MAX_MS = 10000` (konstanta export)
  - `randomDelayMs(): number` — acak inklusif [3000, 10000]
  - `sleep(ms: number): Promise<void>`
  - `resolveDelayActive(enabled: boolean, planIncludesDelay: boolean, addonActive: boolean): DelayInfo` — pure
  - `getTenantDelayInfo(tenantId: string): Promise<DelayInfo>` — 1 query Neon
  - `interface DelayInfo { enabled: boolean; entitled: boolean; active: boolean }`
- Consumes: `queryOne` dari `@/lib/db`.

- [ ] **Step 1: Tulis test yang gagal** — `src/lib/delay.test.ts`:

```ts
import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  DELAY_MAX_MS,
  DELAY_MIN_MS,
  getTenantDelayInfo,
  randomDelayMs,
  resolveDelayActive,
} from "./delay";

const neonQuery = vi.fn(async (_text: string, _params?: unknown[]) => []);
vi.mock("@/lib/db", () => ({
  query: (_t: string, _p?: unknown[]) => neonQuery(_t, _p),
  queryOne: (_t: string, _p?: unknown[]) => neonQuery(_t, _p).then((rows: unknown[]) => rows[0]),
}));

describe("delay", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    neonQuery.mockReset();
    neonQuery.mockImplementation(async () => []);
  });

  it("randomDelayMs selalu dalam rentang 3.000–10.000 ms", () => {
    for (let i = 0; i < 200; i++) {
      const v = randomDelayMs();
      expect(v).toBeGreaterThanOrEqual(DELAY_MIN_MS);
      expect(v).toBeLessThanOrEqual(DELAY_MAX_MS);
    }
  });

  it("randomDelayMs mencapai batas bawah & atas (Math.random 0 dan ~1)", () => {
    const spy = vi.spyOn(Math, "random");
    spy.mockReturnValue(0);
    expect(randomDelayMs()).toBe(DELAY_MIN_MS);
    spy.mockReturnValue(0.9999999999);
    expect(randomDelayMs()).toBe(DELAY_MAX_MS);
    spy.mockRestore();
  });

  it("resolveDelayActive: aktif hanya bila enabled DAN entitled", () => {
    expect(resolveDelayActive(true, true, false).active).toBe(true); // via plan
    expect(resolveDelayActive(true, false, true).active).toBe(true); // via addon
    expect(resolveDelayActive(true, false, false).active).toBe(false); // tidak entitled
    expect(resolveDelayActive(false, true, false).active).toBe(false); // dimatikan admin
    expect(resolveDelayActive(false, false, true).active).toBe(false);
    const info = resolveDelayActive(true, false, true);
    expect(info).toEqual({ enabled: true, entitled: true, active: true });
  });

  it("getTenantDelayInfo: peta baris Neon → DelayInfo", async () => {
    neonQuery.mockResolvedValueOnce([
      { delayEnabled: true, includesDelay: false, addonActive: true },
    ]);
    expect(await getTenantDelayInfo("t1")).toEqual({
      enabled: true,
      entitled: true,
      active: true,
    });
    expect(neonQuery.mock.calls[0][0]).toContain("TenantAddon");
  });

  it("getTenantDelayInfo: tenant tanpa plan / tidak ditemukan → nonaktif", async () => {
    neonQuery.mockResolvedValueOnce([{ delayEnabled: false, includesDelay: null, addonActive: null }]);
    expect(await getTenantDelayInfo("t2")).toEqual({
      enabled: false,
      entitled: false,
      active: false,
    });
    neonQuery.mockResolvedValueOnce([]);
    expect(await getTenantDelayInfo("t-hilang")).toEqual({
      enabled: false,
      entitled: false,
      active: false,
    });
  });
});
```

- [ ] **Step 2: Jalankan test → pastikan GAGAL (delay.ts belum ada)**

Run: `npx vitest run src/lib/delay.test.ts` → Expected: FAIL (module not found).

- [ ] **Step 3: Implementasi minimal** — `src/lib/delay.ts`:

```ts
// Random delay kirim pesan (anti-spam) — config per tenant.
//
// Fitur AKTIF bila tenant mengaktifkan delay (Tenant.delayEnabled, diatur
// platform admin) DAN berhak: plan menyertakan fitur gratis (Plan.includesDelay,
// seed: Mocha) ATAU addon "random_delay" aktif (TenantAddon).
//
// Baca config dari Neon (source of truth) — jalur kirim v1/messages sudah
// membaca Neon untuk kuota/device, jadi tidak ada jalur D1 baru.

import { queryOne } from "@/lib/db";

export const DELAY_MIN_MS = 3000;
export const DELAY_MAX_MS = 10000;

export interface DelayInfo {
  /** Tenant.delayEnabled — config per tenant (admin). */
  enabled: boolean;
  /** Plan.includesDelay ATAU addon random_delay aktif. */
  entitled: boolean;
  /** enabled && entitled — fitur benar-benar berlaku. */
  active: boolean;
}

interface DelayRow {
  delayEnabled: boolean;
  includesDelay: boolean | null;
  addonActive: boolean | null;
}

// Pure function — di-unit-test (delay.test.ts).
export function resolveDelayActive(
  enabled: boolean,
  planIncludesDelay: boolean,
  addonActive: boolean,
): DelayInfo {
  const entitled = planIncludesDelay || addonActive;
  return { enabled, entitled, active: enabled && entitled };
}

// Delay acak inklusif [3000, 10000] ms — 3–10 detik sesuai kesepakatan.
export function randomDelayMs(): number {
  return DELAY_MIN_MS + Math.floor(Math.random() * (DELAY_MAX_MS - DELAY_MIN_MS + 1));
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Satu query Neon: join Tenant → Plan + EXISTS addon random_delay.
export async function getTenantDelayInfo(tenantId: string): Promise<DelayInfo> {
  const row = await queryOne<DelayRow>(
    `SELECT t."delayEnabled",
            p."includesDelay",
            EXISTS(SELECT 1 FROM "TenantAddon" a
                   WHERE a."tenantId" = t.id AND a.key = 'random_delay' AND a.active) AS "addonActive"
     FROM "Tenant" t LEFT JOIN "Plan" p ON p.id = t."planId"
     WHERE t.id = $1`,
    [tenantId],
  );
  if (!row) return { enabled: false, entitled: false, active: false };
  return resolveDelayActive(
    row.delayEnabled,
    row.includesDelay ?? false,
    row.addonActive ?? false,
  );
}
```

- [ ] **Step 4: Jalankan test → PASS**

Run: `npx vitest run src/lib/delay.test.ts` → Expected: 5 passing.

- [ ] **Step 5: Commit**

```bash
git add src/lib/delay.ts src/lib/delay.test.ts
git commit -m "feat: helper random delay per tenant (delay.ts) + unit test"
```

---

### Task 3: `messageStore.ts` — kolom `triggeredAt`/`sentAt`

**Files:**
- Modify: `src/lib/messageStore.ts`

**Interfaces:**
- Produces: `MessageLogInput` + `triggeredAt?: Date | string | null` & `sentAt?: Date | string | null`; `MessageLogRow` + `triggeredAt: string | null` & `sentAt: string | null`; `MESSAGE_COLUMNS` + kedua kolom.
- Consumes: tidak ada (dipakai Task 4 & route webhook yang TIDAK mengisi → null).

- [ ] **Step 1: Edit `MessageLogInput`**

Tambahkan ke interface (setelah `mediaKey`):

```ts
  triggeredAt?: Date | string | null;
  sentAt?: Date | string | null;
```

- [ ] **Step 2: Update INSERT**

Ganti statement insert menjadi (kolom + placeholder 14 & 15):

```ts
  await query(
    'INSERT INTO "MessageLog" (id, "tenantId", "deviceId", "deviceLabel", direction, "chatId", body, type, status, "messageId", "mediaUrl", mimetype, "mediaKey", "triggeredAt", "sentAt") ' +
      "VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)",
    [
      uuidv7(),
      input.tenantId,
      input.deviceId ?? null,
      input.deviceLabel ?? null,
      input.direction,
      input.chatId,
      input.body.slice(0, MAX_BODY_LENGTH),
      input.type ?? null,
      input.status ?? null,
      input.messageId ?? null,
      input.mediaUrl ?? null,
      input.mimetype ?? null,
      input.mediaKey ?? null,
      input.triggeredAt ? new Date(input.triggeredAt) : null,
      input.sentAt ? new Date(input.sentAt) : null,
    ],
  );
```

- [ ] **Step 3: Update `MessageLogRow` & `MESSAGE_COLUMNS`**

```ts
export interface MessageLogRow {
  // ... kolom existing ...
  triggeredAt: string | null;
  sentAt: string | null;
}

const MESSAGE_COLUMNS = `id, "tenantId", "deviceId", "deviceLabel", direction, "chatId", body, type, status, "messageId", "mediaUrl", mimetype, "mediaKey", "triggeredAt", "sentAt", "createdAt"`;
```

- [ ] **Step 4: Verifikasi** — `npx tsc --noEmit` → sukses.
- [ ] **Step 5: Commit**

```bash
git add src/lib/messageStore.ts
git commit -m "feat: MessageLog mencatat triggeredAt & sentAt (analitik delay)"
```

---

### Task 4: `POST /v1/messages` — terapkan delay sinkron

**Files:**
- Modify: `src/app/v1/messages/route.ts`

**Interfaces:**
- Consumes: `getTenantDelayInfo`, `randomDelayMs`, `sleep` (Task 2); `insertMessageLog` + `triggeredAt`/`sentAt` (Task 3).
- Produces: respons sukses + `delayMs` (hanya bila delay diterapkan).

- [ ] **Step 1: Tambah import**

Setelah `import { checkMessageQuota } from "@/lib/quota";`:

```ts
import { getTenantDelayInfo, randomDelayMs, sleep } from "@/lib/delay";
```

- [ ] **Step 2: Sisipkan blok delay sebelum `try`**

Tepat setelah blok `// Label untuk riwayat: ...` (setelah upload R2, sebelum `try`), sisipkan:

```ts
  // Random delay anti-spam (fitur per tenant, 3–10 dtk acak). Kuota & rate
  // limit dihitung SAAT TRIGGER (di atas) — window 3–10 dtk membuat risiko
  // over-quota akibat in-flight negligible.
  const delayInfo = await getTenantDelayInfo(tenantId);
  const triggeredAt = new Date();
  let delayMs: number | null = null;
  if (delayInfo.active) {
    delayMs = randomDelayMs();
    await sleep(delayMs);
  }
  const sentAt = new Date();
```

- [ ] **Step 3: Teruskan timestamp di kedua jalur log**

Jalur sukses (`insertMessageLog({ ... })` pertama): tambahkan `triggeredAt, sentAt,` setelah `mediaKey,`. Jalur gagal (`insertMessageLog({ ... })` di catch OpenwaError): tambahkan `triggeredAt, sentAt,` yang sama.

- [ ] **Step 4: Respons sukses + `delayMs`**

Ubah return sukses menjadi:

```ts
    return Response.json({
      ok: true,
      deviceId: device.id,
      to: chatId,
      messageId,
      ...(delayMs !== null ? { delayMs } : {}),
      ...(media ? { mediaType: media.mediaType } : {}),
      ...(mediaKey ? { stored: "r2" } : {}),
    });
```

- [ ] **Step 5: Verifikasi** — `npx tsc --noEmit` → sukses.
- [ ] **Step 6: Commit**

```bash
git add src/app/v1/messages/route.ts
git commit -m "feat: random delay 3-10 dtk sebelum kirim di POST /v1/messages + delayMs di respons"
```

---

### Task 5: `src/lib/platform.ts` — plan & tenant diperluas

**Files:**
- Modify: `src/lib/platform.ts`

**Interfaces:**
- Produces:
  - `PlanRow` + `includesDelay: boolean` (listPlans SELECT ikut)
  - `PlanPatch` + `includesDelay?: boolean` (updatePlan set clause ikut)
  - `TenantListRow` + `delayEnabled: boolean` (listTenants SELECT ikut)
  - `TenantDetailRow` + `delayEnabled: boolean` + `delayAddonActive: boolean` (getTenantDetail query ikut)
  - `setTenantDelayEnabled(tenantId: string, enabled: boolean): Promise<boolean>`
  - `setTenantAddon(tenantId: string, key: string, active: boolean): Promise<boolean>`
- Consumes: `query` dari `@/lib/db`; `uuidv7` dari `@/lib/uuidv7`.

- [ ] **Step 1: `PlanRow` + `listPlans`**

```ts
export interface PlanRow {
  id: string;
  name: string;
  tagline: string;
  priceDisplay: string;
  maxDevices: number;
  maxUsers: number;
  maxMessagesPerMonth: number | null;
  includesDelay: boolean;
  isActive: boolean;
}
```

Ubah SELECT `listPlans`:

```ts
  return query<PlanRow>(
    'SELECT id, name, tagline, "priceDisplay", "maxDevices", "maxUsers", "maxMessagesPerMonth", "includesDelay", "isActive" FROM "Plan" ORDER BY name ASC',
  );
```

- [ ] **Step 2: `PlanPatch` + `updatePlan`**

```ts
export interface PlanPatch {
  maxDevices?: number;
  maxUsers?: number;
  maxMessagesPerMonth?: number | null;
  includesDelay?: boolean;
  isActive?: boolean;
}
```

Di `updatePlan`, setelah blok `maxMessagesPerMonth`:

```ts
  if (patch.includesDelay !== undefined) {
    args.push(patch.includesDelay);
    sets.push(`"includesDelay" = $${args.length}`);
  }
```

- [ ] **Step 3: `TenantListRow` + `listTenants`**

```ts
export interface TenantListRow {
  id: string;
  name: string;
  createdAt: string;
  suspendedAt: string | null;
  planId: string | null;
  planName: string | null;
  delayEnabled: boolean;
  devices: number;
  users: number;
  messages: number;
}
```

Ubah SELECT di `listTenants` (tambah `t."delayEnabled",` setelah `p.name AS "planName",`).

- [ ] **Step 4: `TenantDetailRow` + `getTenantDetail`**

```ts
export interface TenantDetailRow {
  id: string;
  name: string;
  createdAt: string;
  suspendedAt: string | null;
  planId: string | null;
  planName: string | null;
  delayEnabled: boolean;
  delayAddonActive: boolean;
  devices: number;
  users: number;
  messages: number;
}
```

Ubah query `getTenantDetail` (tambah setelah `p.name AS "planName",`):

```sql
            t."delayEnabled",
            EXISTS(SELECT 1 FROM "TenantAddon" a
                   WHERE a."tenantId" = t.id AND a.key = 'random_delay' AND a.active) AS "delayAddonActive",
```

- [ ] **Step 5: Fungsi baru `setTenantDelayEnabled` & `setTenantAddon`** (taruh setelah `setTenantPlan`)

```ts
// Toggle config delay per tenant (platform admin).
export async function setTenantDelayEnabled(tenantId: string, enabled: boolean): Promise<boolean> {
  const rows = await query<{ id: string }>(
    'UPDATE "Tenant" SET "delayEnabled" = $1 WHERE id = $2 RETURNING id',
    [enabled, tenantId],
  );
  return rows.length > 0;
}

// Grant/revoke addon tenant (upsert). Key di-whitelist di lapisan route.
export async function setTenantAddon(
  tenantId: string,
  key: string,
  active: boolean,
): Promise<boolean> {
  const rows = await query<{ id: string }>(
    'INSERT INTO "TenantAddon" (id, "tenantId", key, active) VALUES ($1, $2, $3, $4) ' +
      'ON CONFLICT ("tenantId", key) DO UPDATE SET active = EXCLUDED.active, "updatedAt" = now() ' +
      "RETURNING id",
    [uuidv7(), tenantId, key, active],
  );
  return rows.length > 0;
}
```

Tambah import `uuidv7` di bagian atas: `import { uuidv7 } from "@/lib/uuidv7";`

- [ ] **Step 6: Verifikasi** — `npx tsc --noEmit` → sukses.
- [ ] **Step 7: Commit**

```bash
git add src/lib/platform.ts
git commit -m "feat: platform.ts — includesDelay, delayEnabled, delayAddonActive, setTenantDelayEnabled, setTenantAddon"
```

---

### Task 6: Route API platform

**Files:**
- Modify: `src/app/api/platform/plans/[id]/route.ts`
- Create: `src/app/api/platform/tenants/[id]/delay/route.ts`
- Create: `src/app/api/platform/tenants/[id]/addons/route.ts`

**Interfaces:**
- Consumes: `updatePlan` (includesDelay), `setTenantDelayEnabled`, `setTenantAddon` (Task 5).
- Produces: `POST /api/platform/tenants/[id]/delay` `{ enabled }`; `POST /api/platform/tenants/[id]/addons` `{ key, active }`.

- [ ] **Step 1: `plans/[id]/route.ts` — terima `includesDelay`**

Tambah ke tipe body: `includesDelay?: unknown;` (setelah `isActive`). Tambah setelah blok `isActive`:

```ts
  if (typeof body?.includesDelay === "boolean") patch.includesDelay = body.includesDelay;
```

- [ ] **Step 2: Buat `tenants/[id]/delay/route.ts`**

```ts
import { auth } from "@/lib/auth";
import { setTenantDelayEnabled } from "@/lib/platform";

// Toggle config random delay per tenant — khusus platform_admin.
// Body: { enabled: boolean }.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "platform_admin") {
    return Response.json({ error: "Forbidden — khusus platform admin" }, { status: 403 });
  }

  const { id } = await params;
  const body = (await req.json().catch(() => null)) as { enabled?: unknown } | null;
  if (typeof body?.enabled !== "boolean") {
    return Response.json({ error: "Field enabled (boolean) wajib diisi" }, { status: 400 });
  }

  try {
    const ok = await setTenantDelayEnabled(id, body.enabled);
    if (!ok) return Response.json({ error: "Tenant tidak ditemukan" }, { status: 404 });
    return Response.json({ ok: true, enabled: body.enabled });
  } catch (e) {
    console.error("platform/tenants/[id]/delay:", e);
    return Response.json({ error: "Gagal mengubah config delay" }, { status: 500 });
  }
}
```

- [ ] **Step 3: Buat `tenants/[id]/addons/route.ts`**

```ts
import { auth } from "@/lib/auth";
import { setTenantAddon } from "@/lib/platform";

// Addon tenant (grant/revoke) — khusus platform_admin.
// Body: { key: string, active: boolean }. Key di-whitelist di sini.
const ADDON_KEYS = ["random_delay"] as const;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "platform_admin") {
    return Response.json({ error: "Forbidden — khusus platform admin" }, { status: 403 });
  }

  const { id } = await params;
  const body = (await req.json().catch(() => null)) as {
    key?: unknown;
    active?: unknown;
  } | null;
  const key = typeof body?.key === "string" ? body.key.trim() : "";
  if (!ADDON_KEYS.includes(key as (typeof ADDON_KEYS)[number])) {
    return Response.json({ error: "Addon tidak dikenal" }, { status: 400 });
  }
  if (typeof body?.active !== "boolean") {
    return Response.json({ error: "Field active (boolean) wajib diisi" }, { status: 400 });
  }

  try {
    const ok = await setTenantAddon(id, key, body.active);
    if (!ok) return Response.json({ error: "Tenant tidak ditemukan" }, { status: 404 });
    return Response.json({ ok: true, key, active: body.active });
  } catch (e) {
    console.error("platform/tenants/[id]/addons:", e);
    return Response.json({ error: "Gagal mengubah addon" }, { status: 500 });
  }
}
```

- [ ] **Step 4: Verifikasi** — `npx tsc --noEmit` → sukses.
- [ ] **Step 5: Commit**

```bash
git add src/app/api/platform/plans/[id]/route.ts src/app/api/platform/tenants/[id]/delay/route.ts src/app/api/platform/tenants/[id]/addons/route.ts
git commit -m "feat: API platform — toggle delay tenant & grant/revoke addon"
```

---

### Task 7: `PlansTable.tsx` — kolom toggle Delay

**Files:**
- Modify: `src/components/platform/PlansTable.tsx`

**Interfaces:**
- Consumes: `PlanRow.includesDelay` (Task 5) + `PUT /api/platform/plans/[id]`.

- [ ] **Step 1: Tambah field di interface & body save**

Interface `PlanRow` lokal: tambah `includesDelay: boolean;` (setelah `maxMessagesPerMonth`). Di `save(p)` body JSON, tambah `includesDelay: p.includesDelay,` (setelah `maxMessagesPerMonth`).

- [ ] **Step 2: Tambah kolom header + sel toggle**

Header: sisipkan setelah `<th ...>Pesan/bulan</th>`:

```tsx
            <th className="px-4 py-3 text-center">Delay</th>
```

Sel (setelah `<td>` Pesan/bulan, sebelum `<td>` Aktif) — toggle sama polanya dengan isActive:

```tsx
              <td className="px-4 py-3 text-center">
                <button
                  type="button"
                  role="switch"
                  aria-checked={p.includesDelay}
                  onClick={() =>
                    setPlans((ps) =>
                      ps.map((x) =>
                        x.id === p.id ? { ...x, includesDelay: !x.includesDelay } : x,
                      ),
                    )
                  }
                  title="Fitur random delay (anti-spam) gratis di plan ini"
                  className={`relative h-6 w-11 rounded-full transition-colors ${
                    p.includesDelay ? "bg-accent" : "bg-line"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
                      p.includesDelay ? "translate-x-[22px]" : "translate-x-0.5"
                    }`}
                  />
                </button>
              </td>
```

- [ ] **Step 3: Update catatan kaki tabel**

Ganti teks footer menjadi:

```tsx
      <p className="border-t border-line-soft px-4 py-3 text-xs text-fg-faint">
        Kuota pesan kosong = unlimited (Espresso per-pesan &amp; Mocha). Tenant tanpa plan
        tidak dikuota. Kolom Delay = plan menyertakan random delay kirim (3–10 dtk) gratis.
      </p>
```

- [ ] **Step 4: Verifikasi** — `npx tsc --noEmit` → sukses.
- [ ] **Step 5: Commit**

```bash
git add src/components/platform/PlansTable.tsx
git commit -m "feat: kolom toggle Delay di halaman plan (includesDelay)"
```

---

### Task 8: `TenantDetailPanel.tsx` — kartu Random Delay + addon

**Files:**
- Modify: `src/components/platform/TenantDetailPanel.tsx`

**Interfaces:**
- Consumes: `TenantDetail.delayEnabled`/`delayAddonActive` & `PlanRow.includesDelay` (Task 5); `POST /api/platform/tenants/[id]/delay` & `/addons` (Task 6).

- [ ] **Step 1: Perluas interface lokal**

```ts
interface TenantDetail {
  // ... existing ...
  delayEnabled: boolean;
  delayAddonActive: boolean;
}

interface PlanRow {
  // ... existing ...
  includesDelay: boolean;
}
```

- [ ] **Step 2: Tambah state & handler**

Setelah `const [planLoading, setPlanLoading] = useState(false);` tambah:

```ts
  const [delayLoading, setDelayLoading] = useState(false);
```

Setelah fungsi `assignPlan`, tambah dua handler:

```ts
  async function setDelayEnabled(enabled: boolean) {
    setDelayLoading(true);
    setActionError("");
    try {
      const res = await fetch(`/api/platform/tenants/${tenantId}/delay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Gagal mengubah config delay");
      setTenant((t) => ({ ...t, delayEnabled: enabled }));
      router.refresh();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Terjadi kesalahan");
    } finally {
      setDelayLoading(false);
    }
  }

  async function toggleAddon(active: boolean) {
    setDelayLoading(true);
    setActionError("");
    try {
      const res = await fetch(`/api/platform/tenants/${tenantId}/addons`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "random_delay", active }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Gagal mengubah addon");
      setTenant((t) => ({ ...t, delayAddonActive: active }));
      router.refresh();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Terjadi kesalahan");
    } finally {
      setDelayLoading(false);
    }
  }
```

- [ ] **Step 3: Hitung entitlement & render kartu**

Setelah `const quota = tenant.planId ? initial.plans.find((p) => p.id === tenant.planId) : null;` tambah:

```ts
  const delayIncludedByPlan = Boolean(quota?.includesDelay);
  const delayEntitled = delayIncludedByPlan || tenant.delayAddonActive;
```

Sisipkan kartu baru SETELAH kartu Plan (blok `<div className="rounded-2xl border border-line bg-surface p-6">` Plan ditutup) dan SEBELUM kartu Users:

```tsx
      {/* Random Delay (Anti-Spam) */}
      <div className="rounded-2xl border border-line bg-surface p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-accent-bright">
              Random Delay (Anti-Spam)
            </p>
            <p className="mt-1 max-w-[52ch] text-sm leading-relaxed text-fg-muted">
              Delay acak 3–10 detik sebelum kirim pesan keluar — mencegah deteksi
              spam. Waktu trigger &amp; kirim tercatat di riwayat pesan untuk analitik.
            </p>
          </div>
          <span
            className={`rounded-full border px-3 py-1 text-xs font-medium ${
              delayEntitled
                ? "border-accent/25 bg-accent/10 text-accent-bright"
                : "border-line-soft bg-surface-2 text-fg-faint"
            }`}
          >
            {delayIncludedByPlan
              ? `Termasuk plan ${quota?.name ?? ""}`
              : tenant.delayAddonActive
                ? "Addon aktif"
                : "Belum tersedia"}
          </span>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-4">
          <button
            type="button"
            role="switch"
            aria-checked={tenant.delayEnabled}
            aria-label="Aktifkan random delay"
            disabled={!delayEntitled || delayLoading}
            onClick={() => setDelayEnabled(!tenant.delayEnabled)}
            className={`relative h-7 w-12 rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
              tenant.delayEnabled ? "bg-accent" : "bg-line"
            }`}
          >
            <span
              className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform ${
                tenant.delayEnabled ? "translate-x-[22px]" : "translate-x-0.5"
              }`}
            />
          </button>
          <span className="text-sm text-fg-muted">
            {tenant.delayEnabled ? "Delay aktif (3–10 dtk acak)" : "Delay nonaktif"}
          </span>
          {!delayEntitled && (
            <span className="text-xs text-fg-faint">
              Tenant belum berhak — berikan addon di bawah.
            </span>
          )}
          <button
            type="button"
            disabled={delayLoading}
            onClick={() => toggleAddon(!tenant.delayAddonActive)}
            className={`ml-auto rounded-full border px-4 py-2 text-sm font-semibold transition-all active:scale-[0.97] disabled:opacity-50 ${
              tenant.delayAddonActive
                ? "border-red-500/40 bg-red-500/10 text-red-400 hover:bg-red-500/20"
                : "border-accent/40 bg-accent/10 text-accent-bright hover:bg-accent/20"
            }`}
          >
            {delayLoading
              ? "Memproses…"
              : tenant.delayAddonActive
                ? "Cabut addon"
                : "Berikan addon (random delay)"}
          </button>
        </div>
      </div>
```

- [ ] **Step 4: Verifikasi** — `npx tsc --noEmit` → sukses.
- [ ] **Step 5: Commit**

```bash
git add src/components/platform/TenantDetailPanel.tsx
git commit -m "feat: kartu Random Delay + grant/revoke addon di detail tenant"
```

---

### Task 9: `TenantTable.tsx` — badge delay

**Files:**
- Modify: `src/components/platform/TenantTable.tsx`

**Interfaces:**
- Consumes: `TenantRow.delayEnabled` (Task 5, listTenants).

- [ ] **Step 1: Interface + badge**

Tambah `delayEnabled: boolean;` di interface `TenantRow`. Di sel Status, setelah span Aktif/Suspended, tambahkan badge:

```tsx
                  <td className="px-4 py-3">
                    {t.suspendedAt ? (
                      <span className="rounded-full border border-red-500/25 bg-red-500/10 px-2 py-0.5 text-xs text-red-400">
                        Suspended
                      </span>
                    ) : (
                      <span className="rounded-full border border-accent/25 bg-accent/10 px-2 py-0.5 text-xs text-accent-bright">
                        Aktif
                      </span>
                    )}
                    {t.delayEnabled && (
                      <span
                        className="ml-1.5 rounded-full border border-amber-500/25 bg-amber-500/10 px-2 py-0.5 text-xs text-amber-400"
                        title="Random delay kirim aktif"
                      >
                        delay
                      </span>
                    )}
                  </td>
```

- [ ] **Step 2: Verifikasi** — `npx tsc --noEmit` → sukses.
- [ ] **Step 3: Commit**

```bash
git add src/components/platform/TenantTable.tsx
git commit -m "feat: badge delay di tabel tenant"
```

---

### Task 10: `MessageHistoryPanel.tsx` — chip delay (analitik)

**Files:**
- Modify: `src/components/dashboard/MessageHistoryPanel.tsx`

**Interfaces:**
- Consumes: `MessageRow.triggeredAt`/`sentAt` (Task 3, via `GET /api/messages` — mengikuti `MESSAGE_COLUMNS` otomatis).

- [ ] **Step 1: Interface + helper delay**

Interface `MessageRow` (komponen): tambah `triggeredAt: string | null; sentAt: string | null;`. Tambah helper setelah `truncateChatId`:

```ts
/** Delay aktual pesan keluar (detik) — null bila tidak ada data / pesan masuk. */
function messageDelaySec(m: MessageRow): number | null {
  if (m.direction !== "outgoing" || !m.triggeredAt || !m.sentAt) return null;
  const diffMs = new Date(m.sentAt).getTime() - new Date(m.triggeredAt).getTime();
  if (!Number.isFinite(diffMs) || diffMs <= 0) return null;
  return diffMs / 1000;
}
```

- [ ] **Step 2: Render chip delay**

Di dalam `messages.map((m) => {` — setelah baris `const showThumb = media.kind === "image" && !!m.mediaUrl;` tambah:

```ts
            const delaySec = messageDelaySec(m);
```

Di baris header pesan, setelah span `{m.status && (...)}` dan sebelum span waktu `{formatTime(m.createdAt)}`, sisipkan:

```tsx
                      {delaySec !== null && delaySec >= 1 && (
                        <span
                          className="rounded-full border border-amber-500/25 bg-amber-500/10 px-2 py-0.5 font-mono text-[10px] text-amber-400"
                          title={`Trigger: ${formatTime(m.triggeredAt!)} · Kirim: ${formatTime(m.sentAt!)}`}
                        >
                          delay {delaySec.toFixed(1)} dtk
                        </span>
                      )}
```

- [ ] **Step 3: Verifikasi** — `npx tsc --noEmit` → sukses.
- [ ] **Step 4: Commit**

```bash
git add src/components/dashboard/MessageHistoryPanel.tsx
git commit -m "feat: chip delay di riwayat pesan (analitik trigger vs kirim)"
```

---

### Task 11: Dokumentasi API

**Files:**
- Modify: `src/app/docs/api/page.tsx`

**Interfaces:**
- Consumes: tidak ada (konten dokumentasi).

- [ ] **Step 1: Tambah section "Random delay (anti-spam)"**

Sisipkan section baru SETELAH section `POST /v1/messages — Kirim pesan` ditutup dan SEBELUM section `GET /api/health`:

```tsx
          {/* Random delay */}
          <section>
            <Anchor id="random-delay">Random delay (anti-spam)</Anchor>
            <p className="mt-2 text-sm leading-relaxed text-fg-muted">
              Fitur <strong>random delay</strong> menunda pengiriman pesan keluar
              secara acak <strong>3–10 detik</strong> sebelum pesan benar-benar
              dikirim — mengurangi risiko deteksi spam oleh Meta/WhatsApp.
            </p>
            <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm text-fg-muted">
              <li>
                Termasuk <strong>gratis</strong> di plan <strong>Mocha</strong>{" "}
                (plan tertinggi); plan lain mendapatkannya via{" "}
                <strong>addon Random Delay</strong> (diatur platform admin).
              </li>
              <li>
                Request <code className="font-mono">POST /v1/messages</code> bersifat
                sinkron: menunggu delay, lalu mengirim. Respons sukses menyertakan{" "}
                <code className="font-mono">delayMs</code> (delay aktual dalam
                milidetik).
              </li>
              <li>
                Setiap pesan keluar mencatat <strong>waktu trigger</strong> dan{" "}
                <strong>waktu kirim</strong> — selisihnya adalah delay aktual yang
                disematkan. Keduanya tampil di{" "}
                <strong>Dashboard → Riwayat Pesan</strong> (chip{" "}
                <code className="font-mono">delay X dtk</code>) untuk analitik
                kebiasaan kirim yang aman.
              </li>
            </ul>
          </section>
```

- [ ] **Step 2: Verifikasi** — `npx tsc --noEmit` → sukses.
- [ ] **Step 3: Commit**

```bash
git add src/app/docs/api/page.tsx
git commit -m "docs: random delay (anti-spam) di referensi API"
```

---

### Task 12: Validasi menyeluruh + review

**Files:** (tidak ada perubahan — validasi)

- [ ] **Step 1: Jalankan semua check paralel** (dari `pintasend/`)

```bash
npx tsc --noEmit
npm run lint
npm test
```

Expected: tsc sukses; lint 0 error; vitest semua pass (termasuk `delay.test.ts`).

- [ ] **Step 2: Review kode** — dispatch code-reviewer-deepseek atas diff `git diff main` / `git diff --stat`; perbaiki temuan; ulangi check bila ada perubahan.
- [ ] **Step 3: Commit akhir bila ada perbaikan review**

```bash
git add -A
git commit -m "fix: hasil review random delay"
```

---

## Catatan Pasca-Implementasi (di luar plan — butuh konfirmasi user)

- Menerapkan migrasi `prisma/migrations/2026-08-18-message-delay.sql` ke Neon
  (dev/prod) dilakukan MANUAL oleh user (via Neon console / psql), atau atas
  konfirmasi user sebelum dijalankan dari sini.
