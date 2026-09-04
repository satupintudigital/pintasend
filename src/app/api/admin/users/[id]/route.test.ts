import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(async () => ({ allowed: true })),
  clientIp: () => "127.0.0.1",
  rateLimitResponse: () => Response.json({ error: "rate limited" }, { status: 429 }),
}));
vi.mock("@/lib/tenantMembers", () => ({
  updateTenantMemberRole: vi.fn(async () => ({ ok: true, data: { d1Ok: true } })),
  removeTenantMember: vi.fn(async () => ({ ok: true, data: { d1Ok: true } })),
  resetTenantMemberPassword: vi.fn(async () => ({ ok: true, data: { d1Ok: true } })),
}));

import { auth } from "@/lib/auth";
import {
  updateTenantMemberRole,
  removeTenantMember,
  resetTenantMemberPassword,
} from "@/lib/tenantMembers";
import { PATCH, DELETE } from "./route";
import { PATCH as PATCH_PASSWORD } from "./password/route";

const mockedAuth = vi.mocked(auth);
const mockedUpdate = vi.mocked(updateTenantMemberRole);
const mockedRemove = vi.mocked(removeTenantMember);
const mockedReset = vi.mocked(resetTenantMemberPassword);

const session = (role: string) =>
  ({ user: { id: "u1", email: "x@y.z", name: "X", role, tenantId: "tA" } }) as never;

const params = { params: Promise.resolve({ id: "u2" }) };

function jsonReq(body: unknown) {
  return new Request("http://x/api/admin/users/u2", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => vi.clearAllMocks());

describe("PATCH /api/admin/users/[id] (ganti role)", () => {
  it("401 tanpa session; 403 member", async () => {
    mockedAuth.mockResolvedValue(null as never);
    expect((await PATCH(jsonReq({ role: "tenant_admin" }), params)).status).toBe(401);
    mockedAuth.mockResolvedValue(session("member"));
    expect((await PATCH(jsonReq({ role: "tenant_admin" }), params)).status).toBe(403);
  });
  it("200 role valid — service dipanggil dengan tenantId sesi", async () => {
    mockedAuth.mockResolvedValue(session("owner"));
    const res = await PATCH(jsonReq({ role: "tenant_admin" }), params);
    expect(res.status).toBe(200);
    expect(mockedUpdate).toHaveBeenCalledWith("u2", "tA", "tenant_admin");
  });
  it("meneruskan error service (mis. role owner → 400)", async () => {
    mockedAuth.mockResolvedValue(session("owner"));
    mockedUpdate.mockResolvedValueOnce({ ok: false, status: 400, error: "Role tidak valid" } as never);
    const res = await PATCH(jsonReq({ role: "owner" }), params);
    expect(res.status).toBe(400);
  });
});

describe("DELETE /api/admin/users/[id] (hapus member)", () => {
  it("401/403; 400 hapus diri sendiri diteruskan dari service", async () => {
    mockedAuth.mockResolvedValue(session("owner"));
    mockedRemove.mockResolvedValueOnce({ ok: false, status: 400, error: "Tidak bisa menghapus akun sendiri." } as never);
    const res = await DELETE(new Request("http://x/api/admin/users/u2", { method: "DELETE" }), params);
    expect(res.status).toBe(400);
    expect(mockedRemove).toHaveBeenCalledWith("u2", "tA", expect.objectContaining({ id: "u1" }));
  });
  it("200 hapus sukses", async () => {
    mockedAuth.mockResolvedValue(session("tenant_admin"));
    const res = await DELETE(new Request("http://x/api/admin/users/u2", { method: "DELETE" }), params);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, d1Ok: true });
  });
});

describe("PATCH /api/admin/users/[id]/password (reset password)", () => {
  it("403 member; owner boleh", async () => {
    mockedAuth.mockResolvedValue(session("member"));
    expect((await PATCH_PASSWORD(jsonReq({ password: "newpass1234" }), params)).status).toBe(403);
    mockedAuth.mockResolvedValue(session("owner"));
    const res = await PATCH_PASSWORD(jsonReq({ password: "newpass1234" }), params);
    expect(res.status).toBe(200);
    expect(mockedReset).toHaveBeenCalledWith("u2", "tA", "newpass1234");
  });
  it("404 user lintas-tenant diteruskan (scope-check service)", async () => {
    mockedAuth.mockResolvedValue(session("owner"));
    mockedReset.mockResolvedValueOnce({ ok: false, status: 404, error: "User tidak ditemukan di tenant ini." } as never);
    const res = await PATCH_PASSWORD(jsonReq({ password: "newpass1234" }), params);
    expect(res.status).toBe(404);
  });
});
