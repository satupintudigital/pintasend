import { query } from "@/lib/db";

// Rute diagnostik: memastikan DATABASE_URL tersedia di runtime Worker dan
// koneksi Neon (serverless driver) berhasil.
export async function GET() {
  const hasUrl = Boolean(process.env.DATABASE_URL);
  const host = process.env.DATABASE_URL?.split("@")[1]?.split("/")[0] ?? null;
  try {
    const rows = await query<{ count: number }>('SELECT COUNT(*)::int AS count FROM "User"');
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
