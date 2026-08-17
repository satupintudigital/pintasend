// D1 re-sync worker (pola workers/turnstile-siteverify: standalone, deploy terpisah).
//
// Tujuan: menutup celah "D1 stale" — saat write-through (Neon → D1) gagal di
// authStore, D1 tertinggal dari Neon. Job ini merekonsiliasi D1 terhadap Neon
// (source of truth):
//   1. Baca SEMUA user dari Neon.
//   2. Upsert ke D1 (INSERT OR REPLACE) — menutup user yang hilang/basi.
//   3. Hapus dari D1 user yang tidak ada di Neon — menutup user "hantu".
//
// Arah WAJIB Neon → D1. Membalik arah (menimpa Neon dengan isi D1) akan
// merusak source of truth — jangan pernah.
//
// Trigger:
//   - Cron (wrangler.jsonc triggers.crons) — otomatis berkala.
//   - HTTP POST manual: ?token=<RESYNC_TOKEN> (untuk on-demand / testing).
//
// Secret: DATABASE_URL (Neon), RESYNC_TOKEN (proteksi trigger manual).
import { Client } from "@neondatabase/serverless";

const USER_COLUMNS =
  'id, "tenantId", email, name, "passwordHash", role, "createdAt"';

export default {
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

async function runResync(env) {
  const started = Date.now();
  const stats = { scanned: 0, upserted: 0, removed: 0, failed: 0, errors: [] };

  const connectionString = String(env.DATABASE_URL ?? "").trim();
  if (!connectionString) {
    return { ok: false, ...stats, errors: ["DATABASE_URL secret tidak tersedia"] };
  }

  const client = new Client(connectionString);
  await client.connect();
  try {
    const { rows } = await client.query(
      `SELECT ${USER_COLUMNS} FROM "User" ORDER BY "createdAt"`,
    );
    stats.scanned = rows.length;

    for (const u of rows) {
      try {
        await env.WAVIO_AUTH_DB.prepare(
          "INSERT OR REPLACE INTO User (id, tenantId, email, name, passwordHash, role, createdAt, updatedAt) " +
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        )
          .bind(
            u.id,
            u.tenantId,
            u.email,
            u.name,
            u.passwordHash,
            u.role,
            u.createdAt instanceof Date ? u.createdAt.toISOString() : u.createdAt,
            new Date().toISOString(),
          )
          .run();
        stats.upserted++;
      } catch (e) {
        stats.failed++;
        stats.errors.push(`upsert ${u.id}: ${e?.message ?? String(e)}`);
      }
    }

    // Reconcile terbalik: hapus user D1 yang sudah tidak ada di Neon.
    try {
      const d1 = await env.WAVIO_AUTH_DB.prepare("SELECT id FROM User").all();
      const neonIds = new Set(rows.map((r) => String(r.id)));
      for (const row of d1.results ?? []) {
        if (!neonIds.has(String(row.id))) {
          await env.WAVIO_AUTH_DB.prepare("DELETE FROM User WHERE id = ?")
            .bind(row.id)
            .run();
          stats.removed++;
        }
      }
    } catch (e) {
      stats.errors.push(`cleanup: ${e?.message ?? String(e)}`);
    }
  } finally {
    await client.end();
  }

  return {
    ok: stats.failed === 0,
    ...stats,
    durationMs: Date.now() - started,
    finishedAt: new Date().toISOString(),
  };
}
