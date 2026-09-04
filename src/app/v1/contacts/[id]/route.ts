import { verifyApiKey } from "@/lib/authStore";
import { deleteContact, patchContact } from "@/lib/contacts";
import { getRequestId, logEvent } from "@/lib/requestLogger";

// Sunting/hapus kontak audiens by id.
//
//   PATCH  /v1/contacts/:id → body { name?, tags?, optedOut?, notes? }
//   DELETE /v1/contacts/:id

function headers(requestId: string): Record<string, string> {
  return { "x-request-id": requestId };
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
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

  const { id } = await params;
  if (!id?.trim()) {
    return Response.json({ error: "id wajib diisi" }, { status: 400, headers: headers(requestId) });
  }

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object") {
    return Response.json({ error: "Body harus berupa JSON" }, { status: 400, headers: headers(requestId) });
  }
  if (body.tags !== undefined && !Array.isArray(body.tags)) {
    return Response.json({ error: '"tags" harus array of string' }, { status: 400, headers: headers(requestId) });
  }

  const ok = await patchContact(verified.tenantId, id.trim(), {
    ...(body.name !== undefined ? { name: typeof body.name === "string" ? body.name : null } : {}),
    ...(body.tags !== undefined
      ? { tags: (body.tags as unknown[]).filter((t): t is string => typeof t === "string") }
      : {}),
    ...(typeof body.optedOut === "boolean" ? { optedOut: body.optedOut } : {}),
    ...(body.notes !== undefined ? { notes: typeof body.notes === "string" ? body.notes : null } : {}),
  });
  if (!ok) {
    return Response.json({ error: "Kontak tidak ditemukan" }, { status: 404, headers: headers(requestId) });
  }
  logEvent("info", "contact_patched", requestId, { tenantId: verified.tenantId, contactId: id });
  return Response.json({ ok: true }, { headers: headers(requestId) });
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
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

  const { id } = await params;
  const ok = await deleteContact(verified.tenantId, id?.trim() ?? "");
  if (!ok) {
    return Response.json({ error: "Kontak tidak ditemukan" }, { status: 404, headers: headers(requestId) });
  }
  logEvent("info", "contact_deleted", requestId, { tenantId: verified.tenantId, contactId: id });
  return Response.json({ ok: true }, { headers: headers(requestId) });
}
