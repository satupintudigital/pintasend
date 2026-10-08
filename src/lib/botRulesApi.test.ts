import { describe, it, expect, vi, beforeEach } from "vitest";

const mockQuery = vi.fn();
const mockQueryOne = vi.fn();

vi.mock("@/lib/db", () => ({
  query: (sql: string, params?: unknown[]) => mockQuery(sql, params),
  queryOne: (sql: string, params?: unknown[]) => mockQueryOne(sql, params),
}));

vi.mock("@/lib/cf", () => ({
  getBinding: vi.fn(async () => null),
}));

import { listBotRules, createBotRule, updateBotRule, deleteBotRule } from "./botRules";

describe("botRules DB service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lists bot rules for tenant", async () => {
    mockQuery.mockResolvedValueOnce([
      {
        id: "1",
        tenantId: "t1",
        name: "Test",
        keyword: "test",
        matchType: "exact",
        response: "resp",
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ]);

    const rules = await listBotRules("t1");
    expect(rules).toHaveLength(1);
    expect(rules[0].isActive).toBe(true);
    expect(mockQuery).toHaveBeenCalledTimes(1);
    const sql = mockQuery.mock.calls[0][0];
    expect(sql).toContain('FROM "BotRule"');
    expect(sql).toContain('$1');
  });

  it("creates a bot rule", async () => {
    mockQuery.mockResolvedValueOnce([
      {
        id: "new-1",
        tenantId: "t1",
        name: "Test",
        keyword: "hai",
        matchType: "exact",
        response: "halo",
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ]);

    const rule = await createBotRule("t1", {
      name: "Test",
      keyword: "hai",
      response: "halo",
    });

    expect(rule.id).toBe("new-1");
    expect(rule.keyword).toBe("hai");
    expect(mockQuery).toHaveBeenCalled();
    const sql = mockQuery.mock.calls[0][0];
    expect(sql).toContain('INSERT INTO "BotRule"');
  });

  it("updates a bot rule", async () => {
    mockQueryOne.mockResolvedValueOnce({ id: "1" }); // existing check
    mockQuery.mockResolvedValueOnce([]); // UPDATE
    mockQueryOne.mockResolvedValueOnce({
      id: "1",
      tenantId: "t1",
      name: "Updated",
      keyword: "hai",
      matchType: "exact",
      response: "halo",
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const updated = await updateBotRule("t1", "1", { name: "Updated" });
    expect(updated?.name).toBe("Updated");
  });

  it("deletes a bot rule", async () => {
    mockQueryOne.mockResolvedValueOnce({ id: "1" }); // existing check
    mockQuery.mockResolvedValueOnce([]); // DELETE

    const ok = await deleteBotRule("t1", "1");
    expect(ok).toBe(true);
  });
});
