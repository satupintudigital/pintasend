import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createPlatformBroadcast,
  startPlatformBroadcast,
  cancelPlatformBroadcast,
  claimPendingBroadcastJobs,
  markBroadcastJobSent,
  markBroadcastJobFailed,
} from "./platformBroadcast";
import { query } from "@/lib/db";

vi.mock("@/lib/db", () => ({
  query: vi.fn(async () => []),
  queryOne: vi.fn(async () => undefined),
}));

const q = query as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => vi.clearAllMocks());

describe("createPlatformBroadcast", () => {
  it("menyisipkan draft dan mengembalikan id", async () => {
    q.mockResolvedValueOnce([{ id: "b1" }]);
    const res = await createPlatformBroadcast(
      { name: "Pengumuman", messageBody: "Halo semua", targetMode: "ready_devices", tenantIds: [], scheduledAt: null },
      { email: "platform@pintasend.test" },
    );
    expect(res.id).toBe("b1");
    const sql = q.mock.calls[0][0] as string;
    expect(sql).toContain('INSERT INTO "PlatformBroadcast"');
    expect(sql).toContain("draft");
  });
});

describe("startPlatformBroadcast", () => {
  it("bukan draft → ditolak tanpa snapshot", async () => {
    q.mockResolvedValueOnce([{ status: "running" }]); // baca status
    const res = await startPlatformBroadcast("b1");
    expect(res.ok).toBe(false);
    expect(res.reason).toBeTruthy();
    expect(q).toHaveBeenCalledTimes(1);
  });

  it("draft → snapshot device ready (tenant aktif, phone terisi) & status running", async () => {
    q.mockResolvedValueOnce([{ status: "draft" }]); // cek status broadcast
    q.mockResolvedValueOnce([{ targetMode: "ready_devices", tenantIds: "[]" }]); // baca mode
    q.mockResolvedValueOnce([
      // device sasaran
      { id: "d1", tenantId: "t1", label: "Kasir A", openwaSessionId: "s1", phone: "6281111111111" },
      { id: "d2", tenantId: "t2", label: "Kasir B", openwaSessionId: "s2", phone: "6282222222222" },
    ]);
    q.mockResolvedValueOnce([{ id: "j1" }, { id: "j2" }]); // insert jobs (multi-row)
    q.mockResolvedValueOnce([{ id: "b1" }]); // update status running

    const res = await startPlatformBroadcast("b1");
    expect(res.ok).toBe(true);
    expect(res.jobs).toBe(2);

    const insertJobSql = q.mock.calls.find((c) => (c[0] as string).includes('INSERT INTO "PlatformBroadcastJob"'));
    expect(insertJobSql).toBeTruthy();
    const updateSql = q.mock.calls.find((c) => (c[0] as string).includes('UPDATE "PlatformBroadcast"'));
    expect(updateSql).toBeTruthy();
  });
});

describe("cancelPlatformBroadcast", () => {
  it("running → cancel ok", async () => {
    q.mockResolvedValueOnce([{ id: "b1" }]);
    const res = await cancelPlatformBroadcast("b1");
    expect(res.ok).toBe(true);
    const sql = q.mock.calls[0][0] as string;
    expect(sql).toContain('UPDATE "PlatformBroadcast"');
    expect(sql).toContain("cancelled");
  });
});

describe("claimPendingBroadcastJobs", () => {
  it("mengembalikan job pending dengan chatId (chatId fallback ke phone device)", async () => {
    q.mockResolvedValueOnce([
      {
        id: "j1",
        tenantId: "t1",
        deviceId: "d1",
        deviceLabel: "Kasir A",
        openwaSessionId: "s1",
        phone: "6281111111111",
        chatId: "6281111111111@c.us",
      },
    ]);
    const jobs = await claimPendingBroadcastJobs(10);
    expect(jobs).toHaveLength(1);
    expect(jobs[0].chatId).toBe("6281111111111@c.us");
  });
});

describe("markBroadcastJobSent / markBroadcastJobFailed", () => {
  it("sent → status sent + broadcast sentCount naik", async () => {
    q.mockResolvedValueOnce([{ id: "j1" }]); // update job
    q.mockResolvedValueOnce([{ id: "b1" }]); // update broadcast counter
    await markBroadcastJobSent("j1", "m-1");
    const jobSql = q.mock.calls[0][0] as string;
    expect(jobSql).toContain('UPDATE "PlatformBroadcastJob"');
    expect(jobSql).toContain("sent");
    const bcSql = q.mock.calls[1][0] as string;
    expect(bcSql).toContain('UPDATE "PlatformBroadcast"');
  });

  it("gagal attempt 1-2 → kembali pending (backoff), attempt 3 → status failed", async () => {
    // Attempt 1: masih < 3 → pending + backoff.
    q.mockResolvedValueOnce([{ attempts: 1 }]);
    await markBroadcastJobFailed("j1", "timeout", 30_000);
    expect((q.mock.calls[0][0] as string)).toContain('UPDATE "PlatformBroadcastJob"');
    const retrySql = q.mock.calls[1][0] as string;
    expect(retrySql).toContain("'pending'");
    expect(retrySql).toContain("nextAttemptAt");

    // Attempt 3 (menyerah) → failed + counter broadcast.
    q.mockResolvedValueOnce([{ attempts: 3 }]);
    q.mockResolvedValueOnce([{ id: "b1" }]);
    await markBroadcastJobFailed("j1", "timeout", 30_000);
    const failSql = q.mock.calls.find((c) => (c[0] as string).includes("'failed'"));
    expect(failSql?.[0]).toContain("'failed'");
  });
});
