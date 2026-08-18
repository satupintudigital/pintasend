// D1 re-sync worker (pola workers/turnstile-siteverify: standalone, deploy terpisah).
//
// Tujuan: menutup celah "D1 stale" — saat write-through (Neon → D1) gagal di
// authStore/webhookStore/devices, D1 tertinggal dari Neon. Job ini
// merekonsiliasi D1 terhadap Neon (source of truth) untuk 4 replika:
//   User, ApiKey, Device, Webhook
//   1. Baca SEMUA baris dari Neon.
//   2. Upsert ke D1 (INSERT OR REPLACE) — menutup baris yang hilang/basi.
//   3. Hapus dari D1 baris yang tidak ada di Neon — menutup baris "hantu".
//
// Arah WAJIB Neon → D1. Membalik arah (menimpa Neon dengan isi D1) akan
// merusak source of truth — jangan pernah.
//
// Trigger:
//   - Cron (wrangler.jsonc triggers.crons) — otomatis berkala.
//   - HTTP POST manual: ?token=<RESYNC_TOKEN> (untuk on-demand / testing).
//
// Secret: DATABASE_URL (Neon), RESYNC_TOKEN (proteksi trigger manual).
//
// Catatan kolom yang hanya hidup di D1:
//   - ApiKey.lastUsedAt   — di-update saat verify (0 Neon); re-sync mereset ke
//     nilai Neon (NULL). Metadata tampilan, bukan data kritis (disengaja).
//   - User.updatedAt      — D1 punya, Neon (tabel Prisma) tidak; re-sync menimpa
//     dengan waktu sekarang (perubahan password sudah ikut dari Neon).
import { Client } from "@neondatabase/serverless";

const iso = (v) => (v instanceof Date ? v.toISOString() : v);

// Konfigurasi tiap tabel — kolom Neon (source of truth) → kolom D1 (replika).
const TABLE_SPECS = [
  {
    stat: "user",
    neonTable: "User",
    d1Table: "User",
    neonColumns: 'id, "tenantId", email, name, "passwordHash", role, "createdAt"',
    d1Columns: "(id, tenantId, email, name, passwordHash, role, createdAt, updatedAt)",
    d1Values: "(?, ?, ?, ?, ?, ?, ?, ?)",
    map: (u) => [
      u.id,
      u.tenantId,
      u.email,
      u.name,
      u.passwordHash,
      u.role,
      iso(u.createdAt),
      new Date().toISOString(),
    ],
  },
  {
    stat: "apikey",
    neonTable: "ApiKey",
    d1Table: "ApiKey",
    neonColumns:
      'id, "tenantId", label, "keyHash", prefix, "createdAt", "lastUsedAt", "revokedAt"',
    d1Columns: "(id, tenantId, label, keyHash, prefix, createdAt, lastUsedAt, revokedAt)",
    d1Values: "(?, ?, ?, ?, ?, ?, ?, ?)",
    map: (k) => [
      k.id,
      k.tenantId,
      k.label,
      k.keyHash,
      k.prefix,
      iso(k.createdAt),
      iso(k.lastUsedAt),
      iso(k.revokedAt),
    ],
  },
  {
    stat: "device",
    neonTable: "Device",
    d1Table: "Device",
    neonColumns:
      'id, "tenantId", label, "openwaSessionId", "openwaWebhookId", phone, status, "createdAt", "updatedAt"',
    d1Columns:
      "(id, tenantId, label, openwaSessionId, openwaWebhookId, phone, status, createdAt, updatedAt)",
    d1Values: "(?, ?, ?, ?, ?, ?, ?, ?, ?)",
    map: (d) => [
      d.id,
      d.tenantId,
      d.label,
      d.openwaSessionId,
      d.openwaWebhookId,
      d.phone,
      d.status,
      iso(d.createdAt),
      iso(d.updatedAt),
    ],
  },
  {
    stat: "webhook",
    neonTable: "Webhook",
    d1Table: "Webhook",
    neonColumns:
      'id, "tenantId", url, secret, events, active, "createdAt", "updatedAt"',
    d1Columns: "(id, tenantId, url, secret, events, active, createdAt, updatedAt)",
    d1Values: "(?, ?, ?, ?, ?, ?, ?, ?)",
    map: (w) => [
      w.id,
      w.tenantId,
      w.url,
      w.secret,
      w.events,
      w.active ? 1 : 0,
      iso(w.createdAt),
      iso(w.updatedAt),
    ],
  },
  {
    stat: "tenant",
    neonTable: "Tenant",
    d1Table: "Tenant",
    neonColumns: 'id, name, "suspendedAt"',
    d1Columns: "(id, name, suspendedAt)",
    d1Values: "(?, ?, ?)",
    map: (t) => [t.id, t.name, t.suspendedAt ? new Date(t.suspendedAt).toISOString() : null],
  },
];

const worker = {
  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(runResync(env));
  },

  async fetch(request, env) {
    try {
      if (request.method !== "POST") {
        return Response.json({ ok: false, error: "Method not allowed" }, { status: 405 });
      }
      const url = new URL(request.url);
      const token = url.searchParams.get("token") ?? "";
      if (!env.RESYNC_TOKEN || token !== env.RESYNC_TOKEN) {
        return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
      }
      const result = await runResync(env);
      return Response.json(result);
    } catch (e) {
      console.error("d1-resync: unexpected", e);
      return Response.json(
        { ok: false, error: e?.message ?? String(e) },
        { status: 500 },
      );
    }
  },
};

export default worker;

async function runResync(env) {
  const started = Date.now();
  const stats = {
    ok: true,
    durationMs: 0,
    finishedAt: null,
    errors: [],
  };

  const connectionString = String(env.DATABASE_URL ?? "").trim();
  if (!connectionString) {
    stats.ok = false;
    stats.errors = ["DATABASE_URL secret tidak tersedia"];
    return stats;
  }

  const client = new Client(connectionString);
  await client.connect();
  try {
    for (const spec of TABLE_SPECS) {
      try {
        await syncTable(client, env.WAVIO_AUTH_DB, spec, stats);
      } catch (e) {
        stats.ok = false;
        stats.errors.push(`${spec.stat} sync: ${e?.message ?? String(e)}`);
      }
    }
  } finally {
    await client.end();
  }

  stats.durationMs = Date.now() - started;
  stats.finishedAt = new Date().toISOString();
  return stats;
}

// Sinkronisasi satu tabel: upsert semua baris Neon → D1, lalu hapus baris D1
// yang tidak ada di Neon. Per-baris try/catch agar satu baris error tidak
// menghentikan seluruh tabel.
async function syncTable(client, d1, spec, stats) {
  const prefix = `${spec.stat}:`;

  const { rows } = await client.query(
    `SELECT ${spec.neonColumns} FROM "${spec.neonTable}" ORDER BY "createdAt"`,
  );
  stats[`${prefix}scanned`] = rows.length;

  let upserted = 0;
  let removed = 0;
  let failed = 0;

  for (const row of rows) {
    try {
      await d1
        .prepare(
          `INSERT OR REPLACE INTO ${spec.d1Table} ${spec.d1Columns} VALUES ${spec.d1Values}`,
        )
        .bind(...spec.map(row))
        .run();
      upserted++;
    } catch (e) {
      failed++;
      stats.errors.push(`${prefix}upsert ${row.id}: ${e?.message ?? String(e)}`);
    }
  }
  stats[`${prefix}upserted`] = upserted;
  stats[`${prefix}failed`] = failed;

  // Reconcile terbalik: hapus baris D1 yang sudah tidak ada di Neon.
  try {
    const d1Rows = await d1.prepare(`SELECT id FROM ${spec.d1Table}`).all();
    const neonIds = new Set(rows.map((r) => String(r.id)));
    for (const row of d1Rows.results ?? []) {
      if (!neonIds.has(String(row.id))) {
        await d1.prepare(`DELETE FROM ${spec.d1Table} WHERE id = ?`).bind(row.id).run();
        removed++;
      }
    }
  } catch (e) {
    stats.errors.push(`${prefix}cleanup: ${e?.message ?? String(e)}`);
  }
  stats[`${prefix}removed`] = removed;

  if (failed > 0) stats.ok = false;
}
