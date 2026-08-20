// Unit test validasi route POST /api/email — tanpa menyentuh Resend, NextAuth,
// atau rate-limiter sungguhan (semua di-mock). Fokus: guard auth, rate limit,
// validasi body, dan kontrak respons.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/email", () => ({ sendEmail: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(),
  clientIp: () => "127.0.0.1",
  rateLimitResponse: (retryAfterSec?: number) =>
    Response.json(
      {
        error: retryAfterSec
          ? `Terlalu banyak percobaan. Coba lagi dalam ${retryAfterSec} detik.`
          : "Terlalu banyak permintaan. Coba lagi nanti.",
      },
      { status: 429, headers: retryAfterSec ? { "Retry-After": String(retryAfterSec) } : undefined },
    ),
}));

import { auth } from "@/lib/auth";
import { sendEmail } from "@/lib/email";
import { checkRateLimit } from "@/lib/rate-limit";
import { POST } from "@/app/api/email/route";

const mockedAuth = vi.mocked(auth);
const mockedSendEmail = vi.mocked(sendEmail);
const mockedCheckRateLimit = vi.mocked(checkRateLimit);

const SESSION = { user: { id: "u1", tenantId: "t1", role: "owner" } } as never;

function post(body: unknown): Promise<Response> {
  return POST(
    new Request("http://localhost/api/email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
}

const validBody = {
  from: "Wavio <noreply@wavio.satupintudigital.co.id>",
  to: "user@example.com",
  subject: "Halo",
  html: "<p>Hai</p>",
};

beforeEach(() => {
  mockedAuth.mockReset();
  mockedSendEmail.mockReset();
  mockedCheckRateLimit.mockReset();
  mockedAuth.mockResolvedValue(SESSION);
  mockedCheckRateLimit.mockResolvedValue({ allowed: true });
  mockedSendEmail.mockResolvedValue({ id: "em_123" });
});

afterEach(() => {
  delete process.env.EMAIL_FROM;
});

describe("POST /api/email", () => {
  it("401 saat tidak terautentikasi", async () => {
    mockedAuth.mockResolvedValueOnce(null as never);
    const res = await post(validBody);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
  });

  it("401 saat session tanpa tenantId", async () => {
    mockedAuth.mockResolvedValueOnce({ user: { id: "u1", role: "owner" } } as never);
    const res = await post(validBody);
    expect(res.status).toBe(401);
  });

  it("429 saat rate limit tercapai, dengan header Retry-After", async () => {
    mockedCheckRateLimit.mockResolvedValueOnce({ allowed: false, retryAfterSec: 12 });
    const res = await post(validBody);
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("12");
  });

  it("400 saat body bukan JSON valid", async () => {
    const res = await post("{ini bukan json");
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Body JSON tidak valid" });
  });

  it("400 saat from bukan email", async () => {
    const res = await post({ ...validBody, from: "bukan-email" });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "From tidak valid" });
  });

  it("400 saat from melebihi 200 karakter", async () => {
    // 196 karakter 'a' + "@x.co" (5) = 201 karakter → melewati batas 200.
    const longFrom = "a".repeat(196) + "@x.co";
    const res = await post({ ...validBody, from: longFrom });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "From tidak valid" });
  });

  it("400 saat to bukan email", async () => {
    const res = await post({ ...validBody, to: "bukan-email" });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "To tidak valid" });
  });

  it("400 saat to kosong", async () => {
    const res = await post({ ...validBody, to: "" });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "To tidak valid" });
  });

  it("400 saat to berisi elemen non-string", async () => {
    const res = await post({ ...validBody, to: ["a@b.co", 123] });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "To tidak valid" });
  });

  it("400 saat to lebih dari 50 penerima", async () => {
    const to = Array.from({ length: 51 }, (_, i) => `u${i}@example.com`);
    const res = await post({ ...validBody, to });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "To wajib diisi, maksimal 50 penerima" });
  });

  it("400 saat subject kosong (spasi saja)", async () => {
    const res = await post({ ...validBody, subject: "   " });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Subject wajib diisi, maksimal 200 karakter" });
  });

  it("400 saat subject lebih dari 200 karakter", async () => {
    const res = await post({ ...validBody, subject: "a".repeat(201) });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Subject wajib diisi, maksimal 200 karakter" });
  });

  it("400 saat html kosong", async () => {
    const res = await post({ ...validBody, html: "" });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Html wajib diisi, maksimal 100000 karakter" });
  });

  it("200 — from default wavio saat from tidak dikirim", async () => {
    const res = await post({
      to: validBody.to,
      subject: validBody.subject,
      html: validBody.html,
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ email: { id: "em_123" } });
    expect(mockedSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        from: "Wavio <noreply@wavio.satupintudigital.co.id>",
        to: ["user@example.com"],
      }),
    );
  });

  it("200 — fallback EMAIL_FROM saat from tidak dikirim", async () => {
    process.env.EMAIL_FROM = "Wavio <noreply@env.co>";
    const res = await post({
      to: validBody.to,
      subject: validBody.subject,
      html: validBody.html,
    });
    expect(res.status).toBe(200);
    expect(mockedSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ from: "Wavio <noreply@env.co>" }),
    );
  });

  it("200 — to array diteruskan, subject & html di-trim", async () => {
    const res = await post({
      ...validBody,
      to: ["a@x.co", "b@x.co"],
      subject: "  Halo  ",
      html: "  <p>Hai</p>  ",
    });
    expect(res.status).toBe(200);
    expect(mockedSendEmail).toHaveBeenCalledWith({
      from: "Wavio <noreply@wavio.satupintudigital.co.id>",
      to: ["a@x.co", "b@x.co"],
      subject: "Halo",
      html: "<p>Hai</p>",
    });
  });

  it("502 saat Resend menolak (sendEmail throw)", async () => {
    mockedSendEmail.mockRejectedValueOnce(new Error("invalid api key"));
    const res = await post(validBody);
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "invalid api key" });
  });
});
