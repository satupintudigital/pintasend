import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET, POST } from "./route";
import { auth } from "@/lib/auth";
import { listMessagesPaginated, insertMessageLog } from "@/lib/messageStore";
import { resolveReadyDeviceForTenant } from "@/lib/devices";
import { openwa } from "@/lib/openwa";

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/messageStore", () => ({
  listMessagesPaginated: vi.fn(),
  insertMessageLog: vi.fn(),
}));

vi.mock("@/lib/devices", () => ({
  resolveReadyDeviceForTenant: vi.fn(),
}));

vi.mock("@/lib/openwa", () => ({
  openwa: {
    sendText: vi.fn(),
  },
}));

const mockedAuth = vi.mocked(auth);
const mockedListMessages = vi.mocked(listMessagesPaginated);
const mockedResolveDevice = vi.mocked(resolveReadyDeviceForTenant);
const mockedOpenwaSendText = vi.mocked(openwa.sendText);
const mockedInsertLog = vi.mocked(insertMessageLog);

const mockSession = {
  user: { id: "u1", tenantId: "t1", role: "owner" },
  expires: new Date(Date.now() + 3600_000).toISOString(),
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Dashboard Messages API route", () => {
  it("GET returns 401 when unauthenticated", async () => {
    mockedAuth.mockResolvedValue(null as never);
    const res = await GET(new Request("http://localhost/api/messages"));
    expect(res.status).toBe(401);
  });

  it("GET returns paginated messages", async () => {
    mockedAuth.mockResolvedValue(mockSession as never);
    mockedListMessages.mockResolvedValue({
      messages: [
        {
          id: "m1",
          tenantId: "t1",
          deviceId: "d1",
          deviceLabel: "Kasir",
          direction: "outgoing",
          chatId: "628123456789@c.us",
          body: "Halo",
          type: "text",
          status: "sent",
          messageId: "msg_1",
          mediaUrl: null,
          mimetype: null,
          mediaKey: null,
          triggeredAt: new Date().toISOString(),
          sentAt: new Date().toISOString(),
          watermark: false,
          reaction: null,
          createdAt: new Date().toISOString(),
        },
      ],
      total: 1,
    });

    const res = await GET(new Request("http://localhost/api/messages?page=1&limit=20"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { messages: unknown[]; total: number };
    expect(body.messages).toHaveLength(1);
    expect(body.total).toBe(1);
  });

  it("POST sends message successfully", async () => {
    mockedAuth.mockResolvedValue(mockSession as never);
    mockedResolveDevice.mockResolvedValue({
      id: "d1",
      label: "Kasir",
      openwaSessionId: "owa_sess_1",
      status: "ready",
    });
    mockedOpenwaSendText.mockResolvedValue({
      messageId: "owa_msg_123",
    });
    mockedInsertLog.mockResolvedValue();

    const req = new Request("http://localhost/api/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        deviceId: "d1",
        phone: "082243543715",
        message: "test",
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; messageId: string; to: string };
    expect(body.ok).toBe(true);
    expect(body.to).toBe("6282243543715@c.us");
    expect(body.messageId).toBe("owa_msg_123");
    expect(mockedOpenwaSendText).toHaveBeenCalledWith(
      "owa_sess_1",
      "6282243543715@c.us",
      "test"
    );
  });

  it("POST returns 400 when no ready device found", async () => {
    mockedAuth.mockResolvedValue(mockSession as never);
    mockedResolveDevice.mockResolvedValue(undefined);

    const req = new Request("http://localhost/api/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        phone: "082243543715",
        message: "test",
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("perangkat WhatsApp");
  });
});
