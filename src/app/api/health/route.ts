import { queryD1 } from "@/lib/d1";

// Rute diagnostik publik: userCount dihitung dari D1 (pintasend-auth) — tidak
// menyentuh Neon sama sekali, sehingga health check tidak memicu active compute
// time Neon.
//
// Keamanan (audit #7): endpoint ini publik — TIDAK pernah mengembalikan host
// DATABASE_URL, kredensial, atau detail error internal. Yang keluar hanya:
//   { ok, hasUrl, userCount }
// Detail (host, pesan error) hanya dicatat di log server untuk debugging.
export async function GET() {
  const hasUrl = Boolean(process.env.DATABASE_URL);
  try {
    const rows = await queryD1<{ count: number }>("SELECT COUNT(*) AS count FROM User");
    return Response.json({ ok: true, hasUrl, userCount: rows[0]?.count ?? 0 });
  } catch (e) {
    // Detail lengkap (host, pesan) hanya untuk log server — jangan ke client.
    const host = process.env.DATABASE_URL?.split("@")[1]?.split("/")[0] ?? null;
    console.error(
      "[health] D1 check gagal:",
      { host, error: e instanceof Error ? e.message : String(e) },
    );
    return Response.json({ ok: false, hasUrl, userCount: 0 });
  }
}
