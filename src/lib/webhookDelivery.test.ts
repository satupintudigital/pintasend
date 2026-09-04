import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  enqueueWebhookDelivery,
  deliverWebhookOnce,
  markWebhookDelivery,
  claimPendingDeliveries,
  cancelPendingDeliveriesForTenant,
  nextRetryDelayMs,
  DELIVERY_MAX_ATTEMPTS,
} from "./webhookDelivery";

// Mock DB (Neon) — pola authStore.test.
const queryMock = vi.fn();
vi.mock("@/lib/db", () => ({
  query: (...args: unknown[]) => queryMock(...args),
  queryOne: vi.fn(async () => undefined),
}));

type QueryCall = [string, unknown[]];

const delivery = {
  tenantId: "t1",
  webhookId: "wh1",
  event: "message.received",
  url: "https://client.example.com/webhooks/wavio",
  payload: '{"event":"message.received","data":{"body":"halo"}}',
  signature: "sha256=abc123",
};

beforeEach(() => {
  queryMock.mockReset();
  queryMock.mockResolvedValue([]);
});

describe("nextRetryDelayMs — backoff (pola akuntansi NalaNiaga)", () => {
  it("attempt 1 (immediate) → 0 ms", () => {
    expect(nextRetryDelayMs(0)).toBe(0);
  });

  it("setelah 1 gagal → +30 dtk", () => {
    expect(nextRetryDelayMs(1)).toBe(30_000);
  });

  it("setelah 2 gagal → +5 menit", () => {
    expect(nextRetryDelayMs(2)).toBe(300_000);
  });

  it("setelah >= 3 gagal → null (habis, dead-letter)", () => {
    expect(nextRetryDelayMs(3)).toBeNull();
    expect(nextRetryDelayMs(4)).toBeNull();
  });
});

describe("enqueueWebhookDelivery — INSERT outbox (pending)", () => {
  it("insert baris pending dengan payload, signature & snapshot url", async () => {
    await enqueueWebhookDelivery(delivery);

    expect(queryMock).toHaveBeenCalledTimes(1);
    const [sql, args] = queryMock.mock.calls[0] as QueryCall;
    expect(sql).toContain('INSERT INTO "WebhookDelivery"');
    expect(sql).toContain("pending");
    const argObj = args as unknown[];
    expect(argObj).toContain("t1");
    expect(argObj).toContain("wh1");
    expect(argObj).toContain("message.received");
    expect(argObj).toContain("https://client.example.com/webhooks/wavio");
    expect(argObj).toContain(delivery.payload);
    expect(argObj).toContain("sha256=abc123");
  });
});

describe("deliverWebhookOnce — fetch sinkron ke client", () => {
  it("HTTP 200 → ok true", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response("ok", { status: 200 }));
    const result = await deliverWebhookOnce(delivery.url, delivery.payload, delivery.signature, delivery.event, fetchImpl);

    expect(result.ok).toBe(true);
    expect(result.status).toBe(200);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(delivery.url);
    const headers = init.headers as Record<string, string>;
    expect(headers["x-wavio-signature"]).toBe("sha256=abc123");
    expect(headers["x-wavio-event"]).toBe("message.received");
    expect(init.body).toBe(delivery.payload);
  });

  it("HTTP 500 → ok false + status", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response("err", { status: 500 }));
    const result = await deliverWebhookOnce(delivery.url, delivery.payload, delivery.signature, delivery.event, fetchImpl);
    expect(result).toMatchObject({ ok: false, status: 500 });
  });

  it("fetch throw (jaringan down) → ok false, status null", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => {
      throw new Error("ECONNREFUSED");
    });
    const result = await deliverWebhookOnce(delivery.url, delivery.payload, delivery.signature, delivery.event, fetchImpl);
    expect(result).toMatchObject({ ok: false, status: null });
    expect(result.error).toContain("ECONNREFUSED");
  });
});

describe("markWebhookDelivery — update status outbox", () => {
  it("update status/attempts/nextAttemptAt/lastError by id", async () => {
    await markWebhookDelivery("d1", {
      status: "pending",
      attempts: 2,
      nextAttemptAt: new Date("2026-08-18T12:00:00.000Z"),
      lastError: "HTTP 500",
    });

    const [sql, args] = queryMock.mock.calls[0] as QueryCall;
    expect(sql).toContain('UPDATE "WebhookDelivery"');
    expect(args).toContain("d1");
  });
});

describe("claimPendingDeliveries — batch utk worker on-demand", () => {
  it("select pending yang sudah waktunya (nextAttemptAt <= now)", async () => {
    queryMock.mockResolvedValue([{ id: "d1", attempts: 1 }]);
    const rows = await claimPendingDeliveries(10);

    expect(rows).toEqual([{ id: "d1", attempts: 1 }]);
    const [sql] = queryMock.mock.calls[0] as QueryCall;
    expect(sql).toContain('status = \'pending\'');
    expect(sql).toContain('"nextAttemptAt" <= now()');
    expect(sql).toContain("LIMIT");
  });
});

describe("cancelPendingDeliveriesForTenant — webhook dihapus", () => {
  it("pending tenant di-set failed (tidak dikirim ke URL yg sudah dihapus)", async () => {
    await cancelPendingDeliveriesForTenant("t1");

    const [sql, args] = queryMock.mock.calls[0] as QueryCall;
    expect(sql).toContain('UPDATE "WebhookDelivery"');
    expect(sql).toContain("status = 'failed'");
    expect(args).toContain("t1");
  });
});

describe("DELIVERY_MAX_ATTEMPTS", () => {
  it("3 percobaan (immediate + 30s + 5min) lalu dead-letter", () => {
    expect(DELIVERY_MAX_ATTEMPTS).toBe(3);
  });
});
