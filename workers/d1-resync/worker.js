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

const APIKEY_COLUMNS =
  'id, "tenantId", label, "keyHash", prefix, "createdAt", "lastUsedAt", "revokedAt"';

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
    scanned: 0,
    upserted: 0,
    removed: 0,
    failed: 0,
    apikeysScanned: 0,
    apikeysUpserted: 0,
    apikeysRemoved: 0,
    apikeysFailed: 0,
    errors: [],
  };

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
      stats.errors.push(`cleanup user: ${e?.message ?? String(e)}`);
    }

    // ===== Sinkronisasi tabel ApiKey (Neon source of truth → D1 replika) =====
    // Menutup celah "D1 stale" yang sama untuk API key: write-through yang gagal
    // (create/revoke) membuat D1 tertinggal → verifyApiKey (baca D1) menolak key
    // yang baru dibuat atau masih menerima key yang sudah di-revoke.
    //
    // Catatan: lastUsedAt hanya di-update di D1 (fire-and-forget saat verify) dan
    // TIDAK pernah ditulis ke Neon — re-sync ini meresetnya ke nilai Neon (NULL/
    // apa adanya). Itu perilaku yang disengaja: metadata tampilan, bukan data kritis.
    try {
      const apiRows = (
        await client.query(`SELECT ${APIKEY_COLUMNS} FROM "ApiKey" ORDER BY "createdAt"`)
      ).rows;
      stats.apikeysScanned = apiRows.length;

      for (const k of apiRows) {
        try {
          const lastUsed =
            k.lastUsedAt instanceof Date ? k.lastUsedAt.toISOString() : k.lastUsedAt;
          const revoked =
            k.revokedAt instanceof Date ? k.revokedAt.toISOString() : k.revokedAt;
          const createdAt =
            k.createdAt instanceof Date ? k.createdAt.toISOString() : k.createdAt;
          await env.WAVIO_AUTH_DB.prepare(
            "INSERT OR REPLACE INTO ApiKey (id, tenantId, label, keyHash, prefix, createdAt, lastUsedAt, revokedAt) " +
              "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
          )
            .bind(k.id, k.tenantId, k.label, k.keyHash, k.prefix, createdAt, lastUsed, revoked)
            .run();
          stats.apikeysUpserted++;
        } catch (e) {
          stats.apikeysFailed++;
          stats.errors.push(`upsert apikey ${k.id}: ${e?.message ?? String(e)}`);
        }
      }

      // Reconcile terbalik: hapus api key D1 yang sudah tidak ada di Neon
      // (mis. dihapus manual di Neon atau tenant dihapus).
      const d1Api = await env.WAVIO_AUTH_DB.prepare("SELECT id FROM ApiKey").all();
      const neonApiIds = new Set(apiRows.map((r) => String(r.id)));
      for (const row of d1Api.results ?? []) {
        if (!neonApiIds.has(String(row.id))) {
          await env.WAVIO_AUTH_DB.prepare("DELETE FROM ApiKey WHERE id = ?")
            .bind(row.id)
            .run();
          stats.apikeysRemoved++;
        }
      }
    } catch (e) {
      stats.errors.push(`apikey sync: ${e?.message ?? String(e)}`);
    }
  } finally {
    await client.end();
  }

  return {
    ok: stats.failed === 0 && stats.apikeysFailed === 0,
    ...stats,
    durationMs: Date.now() - started,
    finishedAt: new Date().toISOString(),
  };
}
