import { describe, expect, it, vi, beforeEach } from "vitest";
import { GET } from "./route";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/db", () => ({ query: vi.fn(), queryOne: vi.fn() }));
vi.mock("@/lib/openwa", () => ({ openwa: { listTemplates: vi.fn() } }));

import { auth } from "@/lib/auth";
import { query, queryOne } from "@/lib/db";
import { openwa } from "@/lib/openwa";

const mockedAuth = vi.mocked(auth);
const mockedQuery = vi.mocked(query);
const mockedQueryOne = vi.mocked(queryOne);
const mockedListTemplates = vi.mocked(openwa.listTemplates);

const SESSION = { user: { id: "u1", tenantId: "t1", role: "owner" } } as never;

const TPL = [
  {
    id: "tpl-1",
    name: "pesanan_baru",
    header: "🛍️ PESANAN BARU",
    body: "Halo {recipientName}, pesanan #{orderNumber}",
    footer: "NalaNiaga",
    createdAt: "2026-08-20T00:00:00Z",
    updatedAt: "2026-08-20T00:00:00Z",
  },
];

beforeEach(() => {
  mockedAuth.mockReset();
  mockedQuery.mockReset();
  mockedQueryOne.mockReset();
  mockedListTemplates.mockReset();
  mockedAuth.mockResolvedValue(SESSION);
  mockedQuery.mockResolvedValue([]);
  mockedQueryOne.mockResolvedValue({ id: "dev1", openwaSessionId: "sess-abc" });
  mockedListTemplates.mockResolvedValue(TPL);
});

function get(deviceId: string): Promise<Response> {
  return GET(new Request(`http://x/api/templates?deviceId=${deviceId}`));
}

describe("GET /api/templates", () => {
  it("401 saat tidak terautentikasi", async () => {
    mockedAuth.mockResolvedValueOnce(null as never);
    const res = await get("dev1");
    expect(res.status).toBe(401);
  });

  it("400 saat deviceId tidak dikirim", async () => {
    const res = await GET(new Request("http://x/api/templates"));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "deviceId wajib diisi" });
    expect(mockedListTemplates).not.toHaveBeenCalled();
  });

  it("404 saat device bukan milik tenant", async () => {
    mockedQueryOne.mockResolvedValueOnce(undefined);
    const res = await get("dev-asing");
    expect(res.status).toBe(404);
    expect(mockedListTemplates).not.toHaveBeenCalled();
  });

  it("200 — mengembalikan canonical catalog tanpa mengekspos nama physical OpenWA", async () => {
    mockedQuery.mockResolvedValueOnce([{
      id: "catalog-1",
      name: "pesanan_baru",
      header: "🛍️ PESANAN BARU",
      body: "Halo {{recipientName}}",
      footer: "Terima kasih",
      version: 4,
      syncStatus: "synced",
      syncedAt: "2026-08-22T00:00:00.000Z",
    }] as never);

    const res = await get("dev1");
    expect(res.status).toBe(200);
    expect(mockedQuery).toHaveBeenCalledWith(
      expect.stringContaining("TenantWhatsAppTemplate"),
      ["t1", "dev1"],
    );
    expect(mockedListTemplates).not.toHaveBeenCalled();
    expect(await res.json()).toEqual({ templates: [{
      id: "catalog-1",
      name: "pesanan_baru",
      header: "🛍️ PESANAN BARU",
      body: "Halo {{recipientName}}",
      footer: "Terima kasih",
      version: 4,
      syncStatus: "synced",
      syncedAt: "2026-08-22T00:00:00.000Z",
    }] });
  });

  it("200 — mengembalikan daftar template dari OpenWA sebagai fallback legacy", async () => {
    const res = await get("dev1");
    expect(res.status).toBe(200);
    expect(mockedQueryOne).toHaveBeenCalledWith(
      expect.stringContaining("Device"),
      ["dev1", "t1"],
    );
    expect(mockedListTemplates).toHaveBeenCalledWith("sess-abc");
    expect(await res.json()).toEqual({ templates: TPL });
  });

  it("502 saat OpenWA gagal (listTemplates throw)", async () => {
    mockedListTemplates.mockRejectedValueOnce(new Error("gateway down"));
    const res = await get("dev1");
    expect(res.status).toBe(502);
  });
});
