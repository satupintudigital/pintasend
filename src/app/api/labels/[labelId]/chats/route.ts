import { auth } from "@/lib/auth";
import { query, queryOne } from "@/lib/db";

export async function GET(_req: Request, { params }: { params: Promise<{ labelId: string }> }) {
  const session = await auth();
  const tenantId = session?.user?.tenantId;
  if (!tenantId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { labelId } = await params;

  try {
    const label = await queryOne<{ id: string; name: string; color: string }>(
      'SELECT id, name, color FROM "Label" WHERE id = $1 AND "tenantId" = $2 AND "isActive" = true',
      [labelId, tenantId]
    );
    if (!label) return Response.json({ error: "Label tidak ditemukan" }, { status: 404 });

    const contacts = await query<{ id: string; chatId: string; createdAt: string }>(
      'SELECT * FROM "LabelContact" WHERE "labelId" = $1 ORDER BY "createdAt" DESC LIMIT 200',
      [labelId]
    );

    return Response.json({
      label,
      chats: contacts.map((c) => ({ chatId: c.chatId, addedAt: c.createdAt })),
    });
  } catch (e) {
    console.error("GET /api/labels/[labelId]/chats error:", e);
    return Response.json({ error: "Gagal memuat kontak label" }, { status: 500 });
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ labelId: string }> }) {
  const session = await auth();
  const tenantId = session?.user?.tenantId;
  if (!tenantId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { labelId } = await params;
  const body = (await req.json().catch(() => null)) as { chatId?: unknown } | null;
  const chatId = typeof body?.chatId === "string" ? body.chatId.trim() : "";

  if (!chatId) return Response.json({ error: "chatId wajib diisi" }, { status: 400 });

  try {
    const label = await queryOne<{ id: string }>(
      'SELECT id FROM "Label" WHERE id = $1 AND "tenantId" = $2 AND "isActive" = true',
      [labelId, tenantId]
    );
    if (!label) return Response.json({ error: "Label tidak ditemukan" }, { status: 404 });

    const id = `lc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const rows = await query<{ chatId: string }>(
      'INSERT INTO "LabelContact" (id, "tenantId", "labelId", "chatId", "createdAt") VALUES ($1, $2, $3, $4, now()) ON CONFLICT ("labelId", "chatId") DO NOTHING RETURNING "chatId"',
      [id, tenantId, labelId, chatId]
    );

    if (rows.length === 0) return Response.json({ ok: true, added: false, reason: "already_added" });
    return Response.json({ ok: true, added: true });
  } catch (e) {
    console.error("POST /api/labels/[labelId]/chats error:", e);
    return Response.json({ error: "Gagal menambahkan chat ke label" }, { status: 500 });
  }
}
