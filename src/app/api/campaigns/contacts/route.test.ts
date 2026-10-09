import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET, POST } from "./route";
import { auth } from "@/lib/auth";
import { listContacts, upsertContact, importContacts, parseContactsCsv } from "@/lib/contacts";

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/contacts", () => ({
  listContacts: vi.fn(),
  upsertContact: vi.fn(),
  importContacts: vi.fn(),
  parseContactsCsv: vi.fn(),
  MAX_IMPORT_ROWS: 10_000,
}));

const mockedAuth = vi.mocked(auth);
const mockedListContacts = vi.mocked(listContacts);
const mockedUpsertContact = vi.mocked(upsertContact);
const mockedImportContacts = vi.mocked(importContacts);
const mockedParseContactsCsv = vi.mocked(parseContactsCsv);

const mockSession = {
  user: { id: "u1", tenantId: "t1", role: "member" },
  expires: new Date(Date.now() + 3600_000).toISOString(),
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Dashboard Contacts API routes", () => {
  it("GET returns 401 when unauthenticated", async () => {
    mockedAuth.mockResolvedValue(null as never);
    const res = await GET(new Request("http://localhost/api/campaigns/contacts"));
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Unauthorized");
  });

  it("GET returns contact list for member role", async () => {
    mockedAuth.mockResolvedValue(mockSession as never);
    mockedListContacts.mockResolvedValue({
      contacts: [
        {
          id: "c1",
          chatId: "628123456789@c.us",
          name: "Budi",
          tags: '["vip"]',
          optedOut: false,
          notes: "Pelanggan setia",
          createdAt: "2026-10-09T00:00:00.000Z",
        },
      ],
      total: 1,
    });

    const res = await GET(new Request("http://localhost/api/campaigns/contacts?q=Budi"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; contacts: Array<{ name: string }>; total: number };
    expect(body.ok).toBe(true);
    expect(body.contacts).toHaveLength(1);
    expect(body.contacts[0].name).toBe("Budi");
    expect(mockedListContacts).toHaveBeenCalledWith("t1", {
      q: "Budi",
      tag: undefined,
      page: 1,
      limit: 20,
    });
  });

  it("POST creates/upserts single contact", async () => {
    mockedAuth.mockResolvedValue(mockSession as never);
    mockedUpsertContact.mockResolvedValue("c2");

    const req = new Request("http://localhost/api/campaigns/contacts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nomor: "081234567890",
        name: "Siti",
        tags: ["lead"],
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(201);
    const body = (await res.json()) as { ok: boolean; chatId: string };
    expect(body.ok).toBe(true);
    expect(body.chatId).toBe("6281234567890@c.us");
    expect(mockedUpsertContact).toHaveBeenCalledWith("t1", {
      chatId: "6281234567890@c.us",
      name: "Siti",
      tags: ["lead"],
      notes: null,
    });
  });

  it("POST handles CSV mass import", async () => {
    mockedAuth.mockResolvedValue(mockSession as never);
    mockedParseContactsCsv.mockReturnValue({
      ok: true,
      rows: [
        { chatId: "62811111111@c.us", name: "User 1", tags: ["promo"] },
        { chatId: "62822222222@c.us", name: "User 2", tags: ["promo"] },
      ],
      skipped: 0,
    });
    mockedImportContacts.mockResolvedValue({
      inserted: 2,
      updated: 0,
      skipped: 0,
    });

    const req = new Request("http://localhost/api/campaigns/contacts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        csv: "nomor,nama,tag\n62811111111,User 1,promo\n62822222222,User 2,promo",
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; inserted: number; updated: number };
    expect(body.ok).toBe(true);
    expect(body.inserted).toBe(2);
  });
});
