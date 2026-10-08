import { query, queryOne } from "@/lib/db";
import { uuidv7 } from "@/lib/uuidv7";
import { getBinding } from "@/lib/cf";

export interface BotRule {
  id: string;
  tenantId: string;
  name: string;
  keyword: string;
  matchType: "exact" | "contains" | "starts_with";
  response: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface KvLike {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, opts?: { expirationTtl?: number }): Promise<void>;
  delete(key: string): Promise<void>;
}

const KV_TTL_S = 300; // 5 menit

function cacheKey(tenantId: string): string {
  return `tenant:cfg:${tenantId}:bot_rules`;
}

export async function invalidateBotRulesCache(tenantId: string): Promise<void> {
  try {
    const kv = await getBinding<KvLike>("PINTSEND_CACHE");
    if (kv) {
      await kv.delete(cacheKey(tenantId));
    }
  } catch (err) {
    console.error("[botRules] invalidate cache failed:", err);
  }
}

export async function getBotRulesCached(tenantId: string): Promise<BotRule[]> {
  try {
    const kv = await getBinding<KvLike>("PINTSEND_CACHE");
    if (kv) {
      const cached = await kv.get(cacheKey(tenantId));
      if (cached) {
        return JSON.parse(cached) as BotRule[];
      }
    }
  } catch (err) {
    console.error("[botRules] read cache failed:", err);
  }

  const rules = await listBotRules(tenantId);

  try {
    const kv = await getBinding<KvLike>("PINTSEND_CACHE");
    if (kv && rules.length > 0) {
      await kv.put(cacheKey(tenantId), JSON.stringify(rules), { expirationTtl: KV_TTL_S });
    }
  } catch (err) {
    console.error("[botRules] populate cache failed:", err);
  }

  return rules;
}

export async function listBotRules(tenantId: string): Promise<BotRule[]> {
  const rows = await query<{
    id: string;
    tenantId: string;
    name: string;
    keyword: string;
    matchType: "exact" | "contains" | "starts_with";
    response: string;
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
  }>(
    `SELECT id, "tenantId", name, keyword, "matchType", response, "isActive", "createdAt", "updatedAt"
     FROM "BotRule" WHERE "tenantId" = $1 ORDER BY "createdAt" DESC`,
    [tenantId]
  );
  return rows.map((r) => ({
    ...r,
    isActive: Boolean(r.isActive),
    createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : new Date().toISOString(),
    updatedAt: r.updatedAt ? new Date(r.updatedAt).toISOString() : new Date().toISOString(),
  }));
}

export async function createBotRule(
  tenantId: string,
  data: {
    name: string;
    keyword: string;
    matchType?: "exact" | "contains" | "starts_with";
    response: string;
    isActive?: boolean;
  }
): Promise<BotRule> {
  const id = uuidv7();
  const matchType = data.matchType || "exact";
  const isActive = data.isActive !== undefined ? data.isActive : true;

  const rows = await query<{
    id: string;
    tenantId: string;
    name: string;
    keyword: string;
    matchType: "exact" | "contains" | "starts_with";
    response: string;
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
  }>(
    `INSERT INTO "BotRule" (id, "tenantId", name, keyword, "matchType", response, "isActive", "createdAt", "updatedAt")
     VALUES ($1, $2, $3, $4, $5, $6, $7, now(), now())
     RETURNING id, "tenantId", name, keyword, "matchType", response, "isActive", "createdAt", "updatedAt"`,
    [id, tenantId, data.name.trim(), data.keyword.trim(), matchType, data.response, isActive]
  );

  await invalidateBotRulesCache(tenantId);
  const created = rows[0];

  return {
    ...created,
    isActive: Boolean(created.isActive),
    createdAt: created.createdAt ? new Date(created.createdAt).toISOString() : new Date().toISOString(),
    updatedAt: created.updatedAt ? new Date(created.updatedAt).toISOString() : new Date().toISOString(),
  };
}

export async function updateBotRule(
  tenantId: string,
  id: string,
  patch: {
    name?: string;
    keyword?: string;
    matchType?: "exact" | "contains" | "starts_with";
    response?: string;
    isActive?: boolean;
  }
): Promise<BotRule | null> {
  const existing = await queryOne<{ id: string }>(
    `SELECT id FROM "BotRule" WHERE id = $1 AND "tenantId" = $2`,
    [id, tenantId]
  );
  if (!existing) return null;

  const sets: string[] = [];
  const args: unknown[] = [];

  if (patch.name !== undefined) {
    args.push(patch.name.trim());
    sets.push(`name = $${args.length}`);
  }
  if (patch.keyword !== undefined) {
    args.push(patch.keyword.trim());
    sets.push(`keyword = $${args.length}`);
  }
  if (patch.matchType !== undefined) {
    args.push(patch.matchType);
    sets.push(`"matchType" = $${args.length}`);
  }
  if (patch.response !== undefined) {
    args.push(patch.response);
    sets.push(`response = $${args.length}`);
  }
  if (patch.isActive !== undefined) {
    args.push(patch.isActive);
    sets.push(`"isActive" = $${args.length}`);
  }

  if (sets.length > 0) {
    sets.push(`"updatedAt" = now()`);
    args.push(id, tenantId);
    const idParam = `$${args.length - 1}`;
    const tenantParam = `$${args.length}`;
    await query(
      `UPDATE "BotRule" SET ${sets.join(", ")} WHERE id = ${idParam} AND "tenantId" = ${tenantParam}`,
      args
    );
  }

  await invalidateBotRulesCache(tenantId);

  const updated = await queryOne<{
    id: string;
    tenantId: string;
    name: string;
    keyword: string;
    matchType: "exact" | "contains" | "starts_with";
    response: string;
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
  }>(
    `SELECT id, "tenantId", name, keyword, "matchType", response, "isActive", "createdAt", "updatedAt"
     FROM "BotRule" WHERE id = $1 AND "tenantId" = $2`,
    [id, tenantId]
  );

  if (!updated) return null;
  return {
    ...updated,
    isActive: Boolean(updated.isActive),
    createdAt: updated.createdAt ? new Date(updated.createdAt).toISOString() : new Date().toISOString(),
    updatedAt: updated.updatedAt ? new Date(updated.updatedAt).toISOString() : new Date().toISOString(),
  };
}

export async function deleteBotRule(tenantId: string, id: string): Promise<boolean> {
  const existing = await queryOne<{ id: string }>(
    `SELECT id FROM "BotRule" WHERE id = $1 AND "tenantId" = $2`,
    [id, tenantId]
  );
  if (!existing) return false;

  await query(`DELETE FROM "BotRule" WHERE id = $1 AND "tenantId" = $2`, [id, tenantId]);
  await invalidateBotRulesCache(tenantId);
  return true;
}

export function matchBotRule(rules: BotRule[], incomingText: string): BotRule | null {
  if (!incomingText || typeof incomingText !== "string") return null;
  const text = incomingText.trim().toLowerCase();
  const activeRules = rules.filter((r) => r.isActive);

  // 1. Exact match
  for (const r of activeRules) {
    if (r.matchType === "exact" && text === r.keyword.trim().toLowerCase()) {
      return r;
    }
  }

  // 2. Starts with match
  for (const r of activeRules) {
    if (r.matchType === "starts_with" && text.startsWith(r.keyword.trim().toLowerCase())) {
      return r;
    }
  }

  // 3. Contains match
  for (const r of activeRules) {
    if (r.matchType === "contains" && text.includes(r.keyword.trim().toLowerCase())) {
      return r;
    }
  }

  return null;
}
