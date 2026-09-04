import { auth } from "@/lib/auth";
import { queryD1, queryD1One } from "@/lib/d1";

export async function GET(_req: Request, { params }: { params: Promise<{ labelId: string }> }) {
  const session = await auth();
  const tenantId = session?.user?.tenantId;
  if (!tenantId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { labelId } = await params;

  const label = await queryD1One<{ id: string; name: string; color: string }>(
    "SELECT id, name, color FROM Label WHERE id = ? AND tenantId = ? AND isActive = 1",
    [labelId, tenantId]
  );
  if (!label) return Response.json({ error: "Label tidak ditemukan" }, { status: 404 });

  const contacts = await queryD1<{ id: string; chatId: string; createdAt: string }>(
    "SELECT * FROM LabelContact WHERE labelId = ? ORDER BY createdAt DESC LIMIT 200",
    [labelId]
  );

  return Response.json({
    label,
    chats: contacts.map((c) => ({ chatId: c.chatId, addedAt: c.createdAt })),
  });
}

export async function POST(req: Request, { params }: { params: Promise<{ labelId: string }> }) {
  const session = await auth();
  const tenantId = session?.user?.tenantId;
  if (!tenantId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { labelId } = await params;
  const body = (await req.json().catch(() => null)) as { chatId?: unknown } | null;
  const chatId = typeof body?.chatId === "string" ? body.chatId.trim() : "";

  if (!chatId) return Response.json({ error: "chatId wajib diisi" }, { status: 400 });

  const label = await queryD1One<{ id: string }>(
    "SELECT id FROM Label WHERE id = ? AND tenantId = ? AND isActive = 1",
    [labelId, tenantId]
  );
  if (!label) return Response.json({ error: "Label tidak ditemukan" }, { status: 404 });

  // Check if already added
  const existing = await queryD1One<{ id: string }>(
    "SELECT id FROM LabelContact WHERE labelId = ? AND chatId = ?",
    [labelId, chatId]
  );
  if (existing) return Response.json({ ok: true, added: false, reason: "already_added" });

  const id = `lc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  await queryD1One(
    "INSERT INTO LabelContact (id, tenantId, labelId, chatId, createdAt) VALUES (?, ?, ?, ?, ?)",
    [id, tenantId, labelId, chatId, new Date().toISOString()]
  );

  return Response.json({ ok: true, added: true });
}
