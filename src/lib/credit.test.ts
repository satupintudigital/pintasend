import { describe, it, expect, vi, beforeEach } from "vitest";
import { getBalance, addCredit, spendCredit, prepaidSendGate } from "./credit";
import { query, queryOne } from "@/lib/db";

vi.mock("@/lib/db", () => ({
  query: vi.fn(async () => []),
  queryOne: vi.fn(async () => undefined),
}));

const q = query as unknown as ReturnType<typeof vi.fn>;
const q1 = queryOne as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => vi.clearAllMocks());

describe("credit (saldo prepaid)", () => {
  it("getBalance: default 0 bila belum ada baris; nilai dari DB bila ada", async () => {
    q1.mockResolvedValueOnce(undefined);
    expect(await getBalance("t1")).toBe(0);
    q1.mockResolvedValueOnce({ balance: 150 });
    expect(await getBalance("t1")).toBe(150);
    expect(q1.mock.calls[0][1]).toEqual(["t1"]);
  });

  it("addCredit: upsert saldo + tulis CreditLedger (+delta, refId=orderId)", async () => {
    q.mockResolvedValueOnce([{ balance: 250 }]); // RETURNING balance
    const balance = await addCredit({ tenantId: "t1", messages: 250, orderId: "ord-1" });
    expect(balance).toBe(250);
    const upsert = q.mock.calls[0][0] as string;
    expect(upsert).toContain('INSERT INTO "TenantBalance"');
    expect(upsert).toContain("ON CONFLICT (\"tenantId\") DO UPDATE");
    expect(q.mock.calls[0][1]).toEqual(["t1", 250]);
    const ledger = q.mock.calls[1][0] as string;
    expect(ledger).toContain('INSERT INTO "CreditLedger"');
    expect(ledger).toContain("DO NOTHING");
    expect(q.mock.calls[1][1]).toEqual([expect.any(String), "t1", "ord-1", 250, "topup", "ord-1"]);
  });

  it("spendCredit: cukup → ok true, balance baru, ledger -delta dengan refId unik", async () => {
    q.mockResolvedValueOnce([{ balance: 50 }]); // RETURNING balance
    const res = await spendCredit({ tenantId: "t1", messages: 1, refId: "msg-1" });
    expect(res).toEqual({ ok: true, balance: 50 });
    const upd = q.mock.calls[0][0] as string;
    expect(upd).toContain("UPDATE \"TenantBalance\"");
    expect(upd).toContain("balance >= $2");
    expect(upd).toContain("RETURNING balance");
    const ledger = q.mock.calls[1][0] as string;
    expect(ledger).toContain('INSERT INTO "CreditLedger"');
    expect(ledger).toContain('ON CONFLICT ("refId")');
    expect(q.mock.calls[1][1]).toEqual([expect.any(String), "t1", -1, "send", "msg-1"]);
  });

  it("spendCredit: saldo kurang → ok false tanpa ledger", async () => {
    q.mockResolvedValueOnce([]); // 0 baris RETURNING
    const res = await spendCredit({ tenantId: "t1", messages: 5, refId: "msg-2" });
    expect(res.ok).toBe(false);
    expect(q).toHaveBeenCalledTimes(1); // tidak ada insert ledger
  });

  it("prepaidSendGate: plan subscription → selalu lolos tanpa sentuh DB", async () => {
    const res = await prepaidSendGate("subscription", "t1");
    expect(res).toEqual({ ok: true });
    expect(q1).not.toHaveBeenCalled();
  });

  it("prepaidSendGate: plan prepaid saldo cukup (≥ needed) → lolos", async () => {
    q1.mockResolvedValueOnce({ balance: 5 });
    expect(await prepaidSendGate("prepaid", "t1", 1)).toEqual({ ok: true });
    q1.mockResolvedValueOnce({ balance: 100 });
    expect(await prepaidSendGate("prepaid", "t1", 100)).toEqual({ ok: true });
    expect(q1.mock.calls[0][1]).toEqual(["t1"]);
  });

  it("prepaidSendGate: plan prepaid saldo kurang → INSUFFICIENT_CREDIT + balance", async () => {
    q1.mockResolvedValueOnce({ balance: 0 });
    expect(await prepaidSendGate("prepaid", "t1", 1)).toEqual({
      ok: false,
      code: "INSUFFICIENT_CREDIT",
      balance: 0,
    });
    q1.mockResolvedValueOnce({ balance: 2 });
    const res = await prepaidSendGate("prepaid", "t1", 5);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("INSUFFICIENT_CREDIT");
  });

  it("prepaidSendGate: tanpa plan (kind null) → lolos", async () => {
    expect(await prepaidSendGate(null, "t1", 1)).toEqual({ ok: true });
    expect(q1).not.toHaveBeenCalled();
  });
});