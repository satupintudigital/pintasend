import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/db", () => ({
  query: vi.fn(async () => []),
  queryOne: vi.fn(async () => undefined),
}));
vi.mock("@/lib/platformSettings", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/platformSettings")>();
  return {
    ...actual,
    listPlatformSettings: vi.fn(),
    getPlatformSetting: vi.fn(),
    setPlatformSetting: vi.fn(),
  };
});
vi.mock("@/lib/watermark", () => ({ invalidateWatermarkFootnoteCache: vi.fn() }));

import { auth } from "@/lib/auth";
import { listPlatformSettings, setPlatformSetting } from "@/lib/platformSettings";
import { GET, PUT } from "./route";

const mockedAuth = vi.mocked(auth);
const mockedList = vi.mocked(listPlatformSettings);
const mockedSet = vi.mocked(setPlatformSetting);

const platformSession = {
  user: { id: "u-p", email: "platform@pintasend.test", role: "platform_admin", tenantId: "t-platform" },
};
const ownerSession = {
  user: { id: "u1", email: "owner@x.y", role: "owner", tenantId: "t1" },
};

function jsonReq(body: unknown, method = "PUT") {
  return new Request("http://x/api/platform/settings", {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => vi.clearAllMocks());

describe("GET /api/platform/settings", () => {
  it("401 tanpa session; 403 owner", async () => {
    mockedAuth.mockResolvedValue(null as never);
    expect((await GET()).status).toBe(401);
    mockedAuth.mockResolvedValue(ownerSession as never);
    expect((await GET()).status).toBe(403);
  });

  it("200 daftar setting", async () => {
    mockedAuth.mockResolvedValue(platformSession as never);
    mockedList.mockResolvedValue([{ key: "platform_name", value: '"PintaSend"', updatedBy: null, updatedAt: "x" }] as never);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.settings).toHaveLength(1);
  });
});

describe("PUT /api/platform/settings", () => {
  it("key tak dikenal → 400 (whitelist di route)", async () => {
    mockedAuth.mockResolvedValue(platformSession as never);
    const res = await PUT(jsonReq({ key: "hack_key", value: "x" }));
    expect(res.status).toBe(400);
  });

  it("tipe salah → 400", async () => {
    mockedAuth.mockResolvedValue(platformSession as never);
    const res = await PUT(jsonReq({ key: "allow_public_registration", value: "yes" }));
    expect(res.status).toBe(400);
  });

  it("200 upsert — setPlatformSetting dipanggil", async () => {
    mockedAuth.mockResolvedValue(platformSession as never);
    mockedSet.mockResolvedValue(true);
    const res = await PUT(jsonReq({ key: "platform_name", value: "PintaSend Pro" }));
    expect(res.status).toBe(200);
    expect(mockedSet).toHaveBeenCalledWith(expect.objectContaining({ key: "platform_name" }));
  });
});
