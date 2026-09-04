import { getBinding } from "@/lib/cf";
import { createTemplateSyncDb, ingestTemplateSync } from "@/lib/templateSync";
import { verifyTemplateSyncAuth } from "@/lib/templateSyncAuth";

const NONCE_TTL_SECONDS = 600;
const NONCE_RE = /^[A-Za-z0-9._-]{8,128}$/;

interface NonceStore {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
}

export async function POST(req: Request) {
  const raw = await req.text().catch(() => "");
  if (!raw) return Response.json({ error: "Body kosong" }, { status: 400 });

  const timestamp = req.headers.get("x-template-sync-timestamp")?.trim() ?? "";
  const signature = req.headers.get("x-template-sync-signature")?.trim() ?? "";
  const nonce = req.headers.get("x-template-sync-nonce")?.trim() ?? "";
  if (!timestamp || !signature || !NONCE_RE.test(nonce)) {
    return Response.json({ error: "Header sinkronisasi tidak lengkap" }, { status: 401 });
  }

  const secret = process.env.WAVIO_TEMPLATE_SYNC_SECRET ?? process.env.WAVIO_SSO_SECRET ?? "";
  if (!(await verifyTemplateSyncAuth(secret, timestamp, signature, raw))) {
    return Response.json({ error: "Signature tidak valid" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return Response.json({ error: "Body harus berupa JSON" }, { status: 400 });
  }

  const kv = await getBinding<NonceStore>("WAVIO_CACHE");
  const nonceKey = `template-sync:${nonce}`;
  if (await kv.get(nonceKey)) {
    return Response.json({ error: "Request sudah pernah diproses" }, { status: 409 });
  }
  await kv.put(nonceKey, "1", { expirationTtl: NONCE_TTL_SECONDS });

  const result = await ingestTemplateSync(createTemplateSyncDb(), body as Parameters<typeof ingestTemplateSync>[1]);
  if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
  return Response.json(result, { status: 202 });
}
