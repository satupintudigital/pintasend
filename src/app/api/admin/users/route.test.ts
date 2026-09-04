import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(async () => ({ allowed: true })),
  clientIp: () => "127.0.0.1",
  rateLimitResponse: () => Response.json({ error: "rate limited" }, { status: 429 }),
}));
vi.mock("@/lib/tenantMembers", () => ({
  listTenantMembers: vi.fn(async () => ({ users: [], total: 0 })),
  inviteTenantMember: vi.fn(async () => ({ ok: true, data: { id: "u-new" } })),
}));

import { auth } from "@/lib/auth";
import { listTenantMembers, inviteTenantMember } from "@/lib/tenantMembers";
import { GET, POST } from "./route";

const mockedAuth = vi.mocked(auth);
const mockedList = vi.mocked(listTenantMembers);
const mockedInvite = vi.mocked(inviteTenantMember);

const session = (role: string, tenantId = "tA") =>
  ({ user: { id: "u1", email: "x@y.z", name: "X", role, tenantId } }) as never;

beforeEach(() => vi.clearAllMocks());

describe("GET /api/admin/users", () => {
  it("401 tanpa session", async () => {
    mockedAuth.mockResolvedValue(null as never);
    const res = await GET(new Request("http://x/api/admin/users"));
    expect(res.status).toBe(401);
  });
  it("403 untuk role member", async () => {
    mockedAuth.mockResolvedValue(session("member"));
    const res = await GET(new Request("http://x/api/admin/users"));
    expect(res.status).toBe(403);
  });
  it("200 untuk tenant_admin — scope ke tenantId sesi", async () => {
    mockedAuth.mockResolvedValue(session("tenant_admin"));
    const res = await GET(new Request("http://x/api/admin/users?page=1&limit=10"));
    expect(res.status).toBe(200);
    expect(mockedList).toHaveBeenCalledWith("tA", { q: "", page: 1, limit: 10 });
    const body = await res.json();
    expect(body).toMatchObject({ users: [], total: 0 });
  });
});

describe("POST /api/admin/users", () => {
  it("401/403 tanpa akses kelola member", async () => {
    mockedAuth.mockResolvedValue(null as never);
    expect((await POST(body())).status).toBe(401);
    mockedAuth.mockResolvedValue(session("member"));
    expect((await POST(body())).status).toBe(403);
  });
  it("400 body tidak valid", async () => {
    mockedAuth.mockResolvedValue(session("owner"));
    const res = await POST(body({ name: "", email: "ok@x.id", password: "password123", role: "member" }));
    expect(res.status).toBe(400);
  });
  it("201 invite member sukses — service dipanggil dengan tenantId sesi", async () => {
    mockedAuth.mockResolvedValue(session("owner"));
    const res = await POST(body({ name: "M", email: "m@a.id", password: "password123", role: "member" }));
    expect(res.status).toBe(201);
    expect(mockedInvite).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: "tA", role: "member" }),
      expect.objectContaining({ role: "owner" }),
    );
    expect(await res.json()).toEqual({ id: "u-new" });
  });
  it("meneruskan error service (mis. 429 kuota / 400 role)", async () => {
    mockedAuth.mockResolvedValue(session("tenant_admin"));
    mockedInvite.mockResolvedValueOnce({ ok: false, status: 429, error: "Kuota penuh" } as never);
    const res = await POST(body({ name: "M", email: "m@a.id", password: "password123", role: "member" }));
    expect(res.status).toBe(429);
  });
});

function body(over: Record<string, unknown> = {}) {
  const b = { name: "M", email: "m@a.id", password: "password123", role: "member", ...over };
  return new Request("http://x/api/admin/users", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(b),
  });
}
