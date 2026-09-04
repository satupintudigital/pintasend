import { verifyApiKey } from "@/lib/authStore";
import {
  importContacts,
  listContacts,
  parseContactsCsv,
  upsertContact,
  MAX_IMPORT_ROWS,
} from "@/lib/contacts";
import { normalizeChatId } from "@/lib/chat";
import { getRequestId, logEvent } from "@/lib/requestLogger";

// API publik modul Campaign — audiens kontak tenant.
// Auth: Authorization: Bearer <API key>. Route THIN — delegasi ke contacts.ts.
//
//   GET  /v1/contacts?q=&tag=&optedOut=&page=&limit=  → daftar + total
//   POST /v1/contacts  → body { chatId, name?, tags?, notes? } (upsert tunggal)
//                        ATAU { csv: "<isi file CSV>" } (import massal)

function headers(requestId: string): Record<string, string> {
  return { "x-request-id": requestId };
}

export async function GET(req: Request) {
  const requestId = getRequestId(req);
  const authz = req.headers.get("authorization") ?? "";
  const raw = authz.startsWith("Bearer ") ? authz.slice(7).trim() : "";
  const verified = await verifyApiKey(raw);
  if (!verified) {
    logEvent("warn", "api_key_auth", requestId, { ok: false });
    return Response.json({ error: "API key tidak valid atau telah dicabut" }, {
      status: 401,
      headers: headers(requestId),
    });
  }

  const url = new URL(req.url);
  const optedOutRaw = url.searchParams.get("optedOut");
  const result = await listContacts(verified.tenantId, {
    q: url.searchParams.get("q") ?? undefined,
    tag: url.searchParams.get("tag") ?? undefined,
    ...(optedOutRaw === "true" || optedOutRaw === "false"
      ? { optedOut: optedOutRaw === "true" }
      : {}),
    page: Number(url.searchParams.get("page")) || 1,
    limit: Number(url.searchParams.get("limit")) || 20,
  });

  return Response.json(
    { ok: true, ...result, page: Number(url.searchParams.get("page")) || 1 },
    { headers: headers(requestId) },
  );
}

export async function POST(req: Request) {
  const requestId = getRequestId(req);
  const authz = req.headers.get("authorization") ?? "";
  const raw = authz.startsWith("Bearer ") ? authz.slice(7).trim() : "";
  const verified = await verifyApiKey(raw);
  if (!verified) {
    logEvent("warn", "api_key_auth", requestId, { ok: false });
    return Response.json({ error: "API key tidak valid atau telah dicabut" }, {
      status: 401,
      headers: headers(requestId),
    });
  }
  logEvent("info", "api_key_auth", requestId, { ok: true, tenantId: verified.tenantId });

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object") {
    return Response.json({ error: "Body harus berupa JSON" }, { status: 400, headers: headers(requestId) });
  }

  // Jalur import massal: { csv }.
  if (typeof body.csv === "string") {
    if (body.csv.length > 5_000_000) {
      return Response.json(
        { error: `CSV terlalu besar (maksimal ~${MAX_IMPORT_ROWS} baris)` },
        { status: 400, headers: headers(requestId) },
      );
    }
    const parsed = parseContactsCsv(body.csv);
    if (!parsed.ok) {
      return Response.json({ error: parsed.error }, { status: 400, headers: headers(requestId) });
    }
    const result = await importContacts(verified.tenantId, parsed.rows);
    logEvent("info", "contacts_imported", requestId, {
      tenantId: verified.tenantId,
      ...result,
    });
    return Response.json(
      { ok: true, ...result, invalid: parsed.skipped ?? 0 },
      { headers: headers(requestId) },
    );
  }

  // Jalur upsert tunggal: { chatId | nomor, name?, tags?, notes? }.
  const chatIdRaw = typeof body.chatId === "string" ? body.chatId : typeof body.nomor === "string" ? body.nomor : "";
  const chatId = normalizeChatId(chatIdRaw);
  if (!chatId) {
    return Response.json(
      { error: 'Field "chatId" wajib nomor WhatsApp valid (6281234567890 / 081234567890)' },
      { status: 400, headers: headers(requestId) },
    );
  }
  if (body.tags !== undefined && !Array.isArray(body.tags)) {
    return Response.json({ error: '"tags" harus array of string' }, { status: 400, headers: headers(requestId) });
  }

  await upsertContact(verified.tenantId, {
    chatId,
    name: typeof body.name === "string" && body.name.trim() ? body.name.trim() : null,
    tags: Array.isArray(body.tags) ? body.tags.filter((t): t is string => typeof t === "string") : [],
    notes: typeof body.notes === "string" && body.notes.trim() ? body.notes.trim() : null,
  });
  logEvent("info", "contact_upserted", requestId, { tenantId: verified.tenantId, chatId });
  return Response.json({ ok: true, chatId }, { status: 201, headers: headers(requestId) });
}
