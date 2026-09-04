import { auth } from "@/lib/auth";
import { importContacts, listContacts, parseContactsCsv, upsertContact, MAX_IMPORT_ROWS } from "@/lib/contacts";
import { normalizeChatId } from "@/lib/chat";

// Dashboard — audiens kontak modul Campaign.
//   GET  ?q=&tag=&optedOut=&page=&limit=  → daftar + total
//   POST { chatId|nomor, name?, tags?, notes? } → upsert tunggal
//        { csv } → import massal

export async function GET(req: Request) {
  const session = await auth();
  const tenantId = session?.user?.tenantId;
  if (!tenantId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const optedOutRaw = url.searchParams.get("optedOut");
  try {
    const result = await listContacts(tenantId, {
      q: url.searchParams.get("q") ?? undefined,
      tag: url.searchParams.get("tag") ?? undefined,
      ...(optedOutRaw === "true" || optedOutRaw === "false" ? { optedOut: optedOutRaw === "true" } : {}),
      page: Number(url.searchParams.get("page")) || 1,
      limit: Number(url.searchParams.get("limit")) || 20,
    });
    return Response.json({ ok: true, ...result });
  } catch (e) {
    console.error("campaigns/contacts GET:", e);
    return Response.json({ error: "Gagal memuat kontak" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const session = await auth();
  const tenantId = session?.user?.tenantId;
  if (!tenantId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object") {
    return Response.json({ error: "Body harus berupa JSON" }, { status: 400 });
  }

  try {
    if (typeof body.csv === "string") {
      if (body.csv.length > 5_000_000) {
        return Response.json({ error: `CSV terlalu besar (maksimal ~${MAX_IMPORT_ROWS} baris)` }, { status: 400 });
      }
      const parsed = parseContactsCsv(body.csv);
      if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 });
      const result = await importContacts(tenantId, parsed.rows);
      return Response.json({ ok: true, ...result, invalid: parsed.skipped ?? 0 });
    }

    const chatIdRaw = typeof body.chatId === "string" ? body.chatId : typeof body.nomor === "string" ? body.nomor : "";
    const chatId = normalizeChatId(chatIdRaw);
    if (!chatId) {
      return Response.json({ error: "Nomor WhatsApp tidak valid (6281234567890 / 081234567890)" }, { status: 400 });
    }
    if (body.tags !== undefined && !Array.isArray(body.tags)) {
      return Response.json({ error: '"tags" harus array of string' }, { status: 400 });
    }
    await upsertContact(tenantId, {
      chatId,
      name: typeof body.name === "string" && body.name.trim() ? body.name.trim() : null,
      tags: Array.isArray(body.tags) ? (body.tags as unknown[]).filter((t): t is string => typeof t === "string") : [],
      notes: typeof body.notes === "string" && body.notes.trim() ? body.notes.trim() : null,
    });
    return Response.json({ ok: true, chatId }, { status: 201 });
  } catch (e) {
    console.error("campaigns/contacts POST:", e);
    return Response.json({ error: "Gagal menyimpan kontak" }, { status: 500 });
  }
}
