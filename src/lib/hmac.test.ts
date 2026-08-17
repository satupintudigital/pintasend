import { describe, expect, it } from "vitest";
import { hmacSha256Hex, verifySignature } from "./hmac";

describe("hmacSha256Hex", () => {
  it("deterministik utk secret+data sama", async () => {
    const h1 = await hmacSha256Hex("secret", "hello");
    const h2 = await hmacSha256Hex("secret", "hello");
    expect(h1).toBe(h2);
  });

  it("hex 64 karakter", async () => {
    const h = await hmacSha256Hex("secret", "hello");
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });

  it("secret beda → hasil beda", async () => {
    const h1 = await hmacSha256Hex("secret-a", "hello");
    const h2 = await hmacSha256Hex("secret-b", "hello");
    expect(h1).not.toBe(h2);
  });
});

describe("verifySignature", () => {
  it("terima signature yang benar (format sha256=hex)", async () => {
    const raw = JSON.stringify({ event: "message.received" });
    const sig = `sha256=${await hmacSha256Hex("rahasia", raw)}`;
    expect(await verifySignature("rahasia", raw, sig)).toBe(true);
  });

  it("tolak signature salah", async () => {
    const raw = JSON.stringify({ event: "message.received" });
    const sig = `sha256=${await hmacSha256Hex("rahasia", raw)}`;
    expect(await verifySignature("rahasia", raw, `${sig}x`)).toBe(false);
    expect(await verifySignature("rahasia-lain", raw, sig)).toBe(false);
  });

  it("tolak header kosong / format salah", async () => {
    const raw = "{}";
    expect(await verifySignature("s", raw, null)).toBe(false);
    expect(await verifySignature("s", raw, "")).toBe(false);
    expect(await verifySignature("s", raw, "md5=abc")).toBe(false);
  });

  it("body yang dimodifikasi → gagal (raw body penting, bukan JSON re-parse)", async () => {
    const raw = '{"event":"message.received","data":{"body":"halo"}}';
    const sig = `sha256=${await hmacSha256Hex("rahasia", raw)}`;
    const tampered = '{"event":"message.received","data":{"body":"HALO"}}';
    expect(await verifySignature("rahasia", tampered, sig)).toBe(false);
  });
});
