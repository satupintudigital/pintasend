import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  recordAudit,
  listAuditLogs,
  csvEscape,
  auditRowToCsv,
  toAuditCsv,
  AUDIT_CSV_HEADER,
} from "./audit";
import { query } from "@/lib/db";

vi.mock("@/lib/db", () => ({
  query: vi.fn(async () => []),
  queryOne: vi.fn(async () => undefined),
}));

const q = query as unknown as ReturnType<typeof vi.fn>;

const row = (over: Partial<Record<string, unknown>> = {}) => ({
  id: "a1",
  tenantId: "t1",
  actorUserId: "u1",
  actorEmail: "admin@pintasend.test",
  actorRole: "platform_admin",
  action: "tenant.suspend",
  targetType: "tenant",
  targetId: "t2",
  meta: "{\"before\":\"active\"}",
  ip: "1.2.3.4",
  createdAt: "2026-09-04T00:00:00.000Z",
  ...over,
});

beforeEach(() => vi.clearAllMocks());

describe("recordAudit", () => {
  it("insert dengan meta terserialisasi & tenant null diizinkan", async () => {
    q.mockImplementationOnce(async () => [{ id: "a1" }]);
    await recordAudit({
      actor: { id: "u1", email: "admin@pintasend.test", role: "platform_admin" },
      action: "tenant.activate",
      tenantId: null,
      targetType: "tenant",
      targetId: "t2",
      meta: { before: false, after: true },
    });
    const sql = q.mock.calls[0][0] as string;
    expect(sql).toContain('INSERT INTO "AuditLog"');
    expect(q.mock.calls[0][1]).toContain("admin@pintasend.test");
    expect(q.mock.calls[0][1]).toContain(JSON.stringify({ before: false, after: true }));
    expect(q.mock.calls[0][1]).toContain(null); // tenantId null → kolom NULL
  });

  it("never-throw: query gagal tidak melempar", async () => {
    q.mockImplementationOnce(async () => {
      throw new Error("db down");
    });
    await expect(
      recordAudit({ actor: { email: "x@y.z", role: "owner" }, action: "x.test" }),
    ).resolves.toBeUndefined();
  });
});

describe("listAuditLogs", () => {
  it("query filter tunggal + pagination, argumen berurut", async () => {
    q.mockResolvedValueOnce([{ count: 1 }]);
    q.mockResolvedValueOnce([row()]);
    const res = await listAuditLogs({ action: "tenant.suspend", page: 2, limit: 10 });
    expect(res.total).toBe(1);
    expect(res.logs[0].action).toBe("tenant.suspend");
    const countSql = q.mock.calls[0][0] as string;
    expect(countSql).toContain("action = $1");
    const listSql = q.mock.calls[1][0] as string;
    expect(listSql).toContain("LIMIT $2 OFFSET $3");
    expect(q.mock.calls[1][1]).toEqual(["tenant.suspend", 10, 10]);
  });

  it("filter q meng-escape wildcard LIKE", async () => {
    q.mockResolvedValueOnce([{ count: 0 }]);
    q.mockResolvedValueOnce([]);
    await listAuditLogs({ q: "100%_a" });
    const likeArg = (q.mock.calls[0][1] as unknown[])[0] as string;
    // escapeLike: wildcard % _ di-escape dgn backslash tunggal (escape char default Postgres ILIKE)
    expect(likeArg).toBe("%100\\%\\_a%");
  });
});

describe("CSV helper", () => {
  it("csvEscape menangani koma, quote, newline", () => {
    expect(csvEscape("plain")).toBe("plain");
    expect(csvEscape('a,b"c')).toBe('"a,b""c"');
    expect(csvEscape("line1\nline2")).toBe("line1 line2");
    expect(csvEscape(null)).toBe("");
  });
  it("auditRowToCsv menghasilkan 9 kolom dengan header yang sama", () => {
    const line = auditRowToCsv(row());
    expect(line.split(",").length).toBe(9);
    expect(AUDIT_CSV_HEADER.split(",").length).toBe(9);
    expect(line).toContain("tenant.suspend");
  });
  it("toAuditCsv menyusun header + baris per entri", () => {
    const csv = toAuditCsv([row(), row({ action: "tenant.activate" })]);
    const lines = csv.trim().split("\n");
    expect(lines[0]).toBe(AUDIT_CSV_HEADER);
    expect(lines.length).toBe(3); // header + 2 baris
    expect(lines[1]).toContain("tenant.suspend");
    expect(lines[2]).toContain("tenant.activate");
  });
});
