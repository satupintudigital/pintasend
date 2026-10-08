import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/audit", () => ({ listAuditLogs: vi.fn(), toAuditCsv: vi.fn() }));

import { auth } from "@/lib/auth";
import { listAuditLogs, toAuditCsv } from "@/lib/audit";
import { GET } from "./route";
import { GET as GET_EXPORT } from "./export/route";

const mockedAuth = vi.mocked(auth);
const mockedList = vi.mocked(listAuditLogs);
const mockedCsv = vi.mocked(toAuditCsv);

const platformSession = {
  user: { id: "u-p", email: "platform@pintasend.test", role: "platform_admin", tenantId: "t-platform" },
};
const ownerSession = {
  user: { id: "u1", email: "owner@x.y", role: "owner", tenantId: "t1" },
};

beforeEach(() => vi.clearAllMocks());

describe("GET /api/platform/audit", () => {
  it("401 tanpa session", async () => {
    mockedAuth.mockResolvedValue(null as never);
    const res = await GET(new Request("http://x/api/platform/audit"));
    expect(res.status).toBe(401);
  });

  it("403 role non-platform_admin (owner)", async () => {
    mockedAuth.mockResolvedValue(ownerSession as never);
    const res = await GET(new Request("http://x/api/platform/audit"));
    expect(res.status).toBe(403);
    expect(mockedList).not.toHaveBeenCalled();
  });

  it("200 & filter halaman diteruskan ke listAuditLogs", async () => {
    mockedAuth.mockResolvedValue(platformSession as never);
    mockedList.mockResolvedValue({ logs: [], total: 0 });
    const res = await GET(
      new Request(
        "http://x/api/platform/audit?action=tenant.suspend&tenantId=t1&actorEmail=a%40b.c&q=xyz&page=2&limit=50",
      ),
    );
    expect(res.status).toBe(200);
    expect(mockedList).toHaveBeenCalledWith({
      action: "tenant.suspend",
      tenantId: "t1",
      actorEmail: "a@b.c",
      q: "xyz",
      page: 2,
      limit: 50,
    });
    const body = await res.json();
    expect(body.total).toBe(0);
  });

  it("limit diluar 1..100 ditolak 400", async () => {
    mockedAuth.mockResolvedValue(platformSession as never);
    const res = await GET(new Request("http://x/api/platform/audit?limit=999"));
    expect(res.status).toBe(400);
  });
});

describe("GET /api/platform/audit/export (CSV)", () => {
  it("403 untuk owner; 200 menghasilkan file CSV dari toAuditCsv", async () => {
    mockedAuth.mockResolvedValue(ownerSession as never);
    expect((await GET_EXPORT(new Request("http://x/api/platform/audit/export"))).status).toBe(403);

    mockedAuth.mockResolvedValue(platformSession as never);
    mockedList.mockResolvedValue({ logs: [], total: 0 });
    mockedCsv.mockReturnValue("waktu,actorEmail\n");
    const res = await GET_EXPORT(new Request("http://x/api/platform/audit/export?action=tenant.suspend"));
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain("waktu,actorEmail");
  });
});
