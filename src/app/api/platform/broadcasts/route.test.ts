import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/platformBroadcast", () => ({
  listPlatformBroadcasts: vi.fn(),
  createPlatformBroadcast: vi.fn(),
  getPlatformBroadcast: vi.fn(),
  startPlatformBroadcast: vi.fn(),
  cancelPlatformBroadcast: vi.fn(),
}));

import { auth } from "@/lib/auth";
import {
  listPlatformBroadcasts,
  createPlatformBroadcast,
  getPlatformBroadcast,
  startPlatformBroadcast,
  cancelPlatformBroadcast,
} from "@/lib/platformBroadcast";
import { GET as LIST, POST as CREATE } from "./route";
import { GET as DETAIL, POST as ACT } from "./[id]/route";

const mockedAuth = vi.mocked(auth);
const mockedList = vi.mocked(listPlatformBroadcasts);
const mockedCreate = vi.mocked(createPlatformBroadcast);
const mockedDetail = vi.mocked(getPlatformBroadcast);
const mockedStart = vi.mocked(startPlatformBroadcast);
const mockedCancel = vi.mocked(cancelPlatformBroadcast);

const platformSession = {
  user: { id: "u-p", email: "platform@wavio.test", role: "platform_admin", tenantId: "t-platform" },
};
const ownerSession = {
  user: { id: "u1", email: "owner@x.y", role: "owner", tenantId: "t1" },
};
const params = { params: Promise.resolve({ id: "b1" }) };

function jsonReq(body: unknown, url = "http://x/api/platform/broadcasts") {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => vi.clearAllMocks());

describe("guard", () => {
  it("401 tanpa session; 403 owner", async () => {
    const req = new Request("http://x/api/platform/broadcasts");
    mockedAuth.mockResolvedValue(null as never);
    expect((await LIST(req)).status).toBe(401);
    mockedAuth.mockResolvedValue(ownerSession as never);
    expect((await LIST(req)).status).toBe(403);
  });
});

describe("POST /api/platform/broadcasts", () => {
  it("200 create — delegasi service", async () => {
    mockedAuth.mockResolvedValue(platformSession as never);
    mockedCreate.mockResolvedValue({ id: "b1" });
    const res = await CREATE(
      jsonReq({ name: "Pengumuman", messageBody: "Halo", targetMode: "ready_devices" }),
    );
    expect(res.status).toBe(201);
    expect(mockedCreate).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Pengumuman" }),
      { email: "platform@wavio.test" },
    );
  });

  it("400 tanpa messageBody", async () => {
    mockedAuth.mockResolvedValue(platformSession as never);
    const res = await CREATE(jsonReq({ name: "X" }));
    expect(res.status).toBe(400);
    expect(mockedCreate).not.toHaveBeenCalled();
  });
});

describe("POST /api/platform/broadcasts/[id] (start/cancel)", () => {
  it("start → delegasi + status 200", async () => {
    mockedAuth.mockResolvedValue(platformSession as never);
    mockedStart.mockResolvedValue({ ok: true, jobs: 3 });
    const res = await ACT(jsonReq({ action: "start" }), params);
    expect(res.status).toBe(200);
    expect(mockedStart).toHaveBeenCalledWith("b1");
    const body = await res.json();
    expect(body.jobs).toBe(3);
  });

  it("start gagal (bukan draft) → 400 reason", async () => {
    mockedAuth.mockResolvedValue(platformSession as never);
    mockedStart.mockResolvedValue({ ok: false, reason: "sudah running" });
    const res = await ACT(jsonReq({ action: "start" }), params);
    expect(res.status).toBe(400);
  });

  it("cancel → delegasi", async () => {
    mockedAuth.mockResolvedValue(platformSession as never);
    mockedCancel.mockResolvedValue({ ok: true });
    const res = await ACT(jsonReq({ action: "cancel" }), params);
    expect(res.status).toBe(200);
    expect(mockedCancel).toHaveBeenCalledWith("b1");
  });

  it("action tak dikenal → 400", async () => {
    mockedAuth.mockResolvedValue(platformSession as never);
    const res = await ACT(jsonReq({ action: "hapus" }), params);
    expect(res.status).toBe(400);
  });
});

describe("GET /api/platform/broadcasts/[id]", () => {
  it("200 detail; 404 bila tidak ada", async () => {
    mockedAuth.mockResolvedValue(platformSession as never);
    mockedDetail.mockResolvedValue(null);
    expect((await DETAIL(new Request("http://x/b1"), params)).status).toBe(404);
    mockedDetail.mockResolvedValue({ id: "b1" } as never);
    const res = await DETAIL(new Request("http://x/b1"), params);
    expect(res.status).toBe(200);
  });
});
