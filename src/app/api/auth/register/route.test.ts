import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { POST } from "./route";
import { registerTenantOwner, EmailAlreadyTakenError } from "@/lib/register";
import { signIn } from "@/lib/auth";

vi.mock("@/lib/register", () => ({
  registerTenantOwner: vi.fn(),
  validateRegisterInput: vi.fn(() => null),
  EmailAlreadyTakenError: class EmailAlreadyTakenError extends Error {
    constructor(msg: string) {
      super(msg);
      this.name = "EmailAlreadyTakenError";
    }
  },
}));
vi.mock("@/lib/auth", () => ({
  signIn: vi.fn(async () => ({ ok: true })),
}));
vi.mock("@/lib/catalog", () => ({
  getPublicCatalog: vi.fn(async () => ({
    plans: [{ id: "plan1", name: "Latte" }],
    addons: [{ key: "random_delay", name: "Random delay" }],
    settings: {},
  })),
}));

const registerMock = registerTenantOwner as unknown as ReturnType<typeof vi.fn>;
const signInMock = signIn as unknown as ReturnType<typeof vi.fn>;

function jsonReq(body: unknown, env?: Record<string, string>): Request {
  const prev = { ...process.env };
  if (env) Object.assign(process.env, env);
  // restore di afterEach
  (jsonReq as unknown as { env?: NodeJS.ProcessEnv }).env = prev;
  return new Request("http://pintasend.test/api/auth/register", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => vi.clearAllMocks());
afterEach(() => {
  const prev = (jsonReq as unknown as { env?: NodeJS.ProcessEnv }).env;
  if (prev) {
    process.env = prev;
  }
});

describe("POST /api/auth/register", () => {
  it("valid (tanpa env turnstile) → 200, redirect /checkout dengan plan/addon whitelist", async () => {
    registerMock.mockResolvedValueOnce({ tenantId: "t1", userId: "u1" });
    const res = await POST(
      jsonReq({ name: "Alice", email: "alice@b.id", password: "password123", tenantName: "PT Alice", plan: "plan1", addon: "random_delay" }),
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as { ok: boolean; redirectTo: string };
    expect(data.ok).toBe(true);
    expect(data.redirectTo).toBe("/checkout?plan=plan1&addon=random_delay");
    expect(registerMock).toHaveBeenCalledWith({ name: "Alice", email: "alice@b.id", password: "password123", tenantName: "PT Alice" });
    expect(signInMock).toHaveBeenCalled();
  });

  it("validasi gagal → 400 tanpa signIn", async () => {
    const { validateRegisterInput } = await import("@/lib/register");
    (validateRegisterInput as unknown as ReturnType<typeof vi.fn>).mockReturnValueOnce("Password minimal 8 karakter");
    const res = await POST(jsonReq({ name: "Alice", email: "a@b.id", password: "123", tenantName: "PT X" }));
    expect(res.status).toBe(400);
    expect(registerMock).not.toHaveBeenCalled();
  });

  it("duplikat → 409", async () => {
    registerMock.mockRejectedValueOnce(new EmailAlreadyTakenError("Email sudah terdaftar"));
    const res = await POST(jsonReq({ name: "Alice", email: "dup@b.id", password: "password123", tenantName: "PT X" }));
    expect(res.status).toBe(409);
  });

  it("turnstile diset tapi token gagal → 400", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ success: false }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const res = await POST(
      jsonReq(
        { name: "Alice", email: "a@b.id", password: "password123", tenantName: "PT X", turnstileToken: "bad" },
        { NEXT_PUBLIC_TURNSTILE_SITEVERIFY_URL: "https://turnstile-siteverify.test" },
      ),
    );
    expect(res.status).toBe(400);
    expect(registerMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("turnstile sukses → mengirim JSON { token } ke siteverify worker → 200", async () => {
    // Kontrak worker siteverify = JSON { token }, bukan raw string — regresi
    // bug: body polos membuat request.json() di worker gagal (login selalu error).
    let sentBody = "";
    let sentHeaders: HeadersInit | undefined;
    const fetchMock = vi.fn(async (_u: string, init?: RequestInit) => {
      sentBody = String(init?.body ?? "");
      sentHeaders = init?.headers;
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    registerMock.mockResolvedValueOnce({ tenantId: "t1", userId: "u1" });

    const res = await POST(
      jsonReq(
        { name: "Alice", email: "alice@b.id", password: "password123", tenantName: "PT Alice", turnstileToken: "tok-abc" },
        { NEXT_PUBLIC_TURNSTILE_SITEVERIFY_URL: "https://turnstile-siteverify.test" },
      ),
    );
    expect(res.status).toBe(200);
    expect(registerMock).toHaveBeenCalled();
    // Body harus JSON { token } dengan Content-Type application/json.
    expect(sentBody).toBe(JSON.stringify({ token: "tok-abc" }));
    const h = new Headers(sentHeaders);
    expect(h.get("content-type")).toContain("application/json");
    vi.unstubAllGlobals();
  });
});