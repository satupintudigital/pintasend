import { queryD1 } from "@/lib/d1";

// Rute diagnostik: userCount dihitung dari D1 (wavio-auth) — tidak
// menyentuh Neon sama sekali, sehingga health check tidak memicu
// active compute time Neon. Field hasUrl/host tetap dari env sebagai
// indikator konfigurasi.
export async function GET() {
  const hasUrl = Boolean(process.env.DATABASE_URL);
  const host = process.env.DATABASE_URL?.split("@")[1]?.split("/")[0] ?? null;
  try {
    const rows = await queryD1<{ count: number }>("SELECT COUNT(*) AS count FROM User");
    return Response.json({ ok: true, hasUrl, host, userCount: rows[0]?.count ?? 0 });
  } catch (e) {
    return Response.json({
      ok: false,
      hasUrl,
      host,
      error: String((e as Error)?.message ?? e),
    });
  }
}
