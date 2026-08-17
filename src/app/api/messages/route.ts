import { auth } from "@/lib/auth";
import { listMessagesPaginated } from "@/lib/messageStore";

// Riwayat pesan tenant — baca Neon (tabel MessageLog, source of truth).
// Halaman dashboard /dashboard/pesan memakai endpoint ini.
// Query: q (cari body/chatId) · direction (incoming|outgoing) · page · limit
export async function GET(req: Request) {
  const session = await auth();
  const tenantId = session?.user?.tenantId;
  if (!tenantId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const q = url.searchParams.get("q") ?? "";
  const direction = url.searchParams.get("direction") ?? "";
  const rawPage = Number(url.searchParams.get("page") ?? "1");
  const rawLimit = Number(url.searchParams.get("limit") ?? "20");

  if (!Number.isInteger(rawPage) || rawPage < 1) {
    return Response.json({ error: "page harus angka >= 1" }, { status: 400 });
  }
  if (!Number.isInteger(rawLimit) || rawLimit < 1 || rawLimit > 50) {
    return Response.json({ error: "limit harus angka 1–50" }, { status: 400 });
  }
  if (q.length > 100) {
    return Response.json({ error: "q maksimal 100 karakter" }, { status: 400 });
  }

  try {
    const result = await listMessagesPaginated({
      tenantId,
      query: q,
      direction,
      page: rawPage,
      limit: rawLimit,
    });
    return Response.json({
      messages: result.messages,
      total: result.total,
      page: rawPage,
      limit: rawLimit,
    });
  } catch (e) {
    console.error("api/messages GET:", e);
    return Response.json({ error: "Gagal memuat riwayat pesan" }, { status: 500 });
  }
}
