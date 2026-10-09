import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET as getLabels, POST as createLabel } from "./route";
import { auth } from "@/lib/auth";
import { query, queryOne } from "@/lib/db";

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  query: vi.fn(),
  queryOne: vi.fn(),
}));

const mockedAuth = vi.mocked(auth);
const mockedQuery = vi.mocked(query);
const mockedQueryOne = vi.mocked(queryOne);

const mockSession = {
  user: { id: "u1", tenantId: "t1", role: "owner" },
  expires: new Date(Date.now() + 3600_000).toISOString(),
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Labels API routes", () => {
  it("GET returns 401 when unauthenticated", async () => {
    mockedAuth.mockResolvedValue(null as never);
    const res = await getLabels();
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: string };
    expect(body).toEqual({ error: "Unauthorized" });
  });

  it("GET returns labels list for authenticated user", async () => {
    mockedAuth.mockResolvedValue(mockSession as never);
    mockedQuery.mockResolvedValue([
      {
        id: "lbl_1",
        name: "VIP",
        color: "#6366f1",
        openwaLabelId: null,
        isActive: true,
        createdAt: "2026-10-09T00:00:00.000Z",
        contactCount: 3,
      },
    ]);

    const res = await getLabels();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { labels: Array<{ id: string; name: string; contactCount: number }> };
    expect(body.labels).toHaveLength(1);
    expect(body.labels[0].name).toBe("VIP");
    expect(body.labels[0].contactCount).toBe(3);
  });

  it("POST creates label", async () => {
    mockedAuth.mockResolvedValue(mockSession as never);
    mockedQueryOne.mockResolvedValue(undefined);
    mockedQuery.mockResolvedValue([]);

    const req = new Request("http://localhost/api/labels", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Pelanggan Baru", color: "#14b8a6" }),
    });

    const res = await createLabel(req);
    expect(res.status).toBe(201);
    const body = (await res.json()) as { label: { name: string; color: string } };
    expect(body.label.name).toBe("Pelanggan Baru");
    expect(body.label.color).toBe("#14b8a6");
  });
});
