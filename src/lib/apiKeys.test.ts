import { describe, expect, it } from "vitest";
import { generateApiKeyRaw, hashApiKey } from "./apiKeys";

describe("generateApiKeyRaw", () => {
  it("format wavio_ + 48 hex (24 byte)", () => {
    const { raw, prefix } = generateApiKeyRaw();
    expect(raw).toMatch(/^wavio_[0-9a-f]{48}$/);
    expect(prefix).toBe(raw.slice(0, 12));
  });

  it("unik antar pemanggilan (random 128-bit)", () => {
    const a = generateApiKeyRaw().raw;
    const b = generateApiKeyRaw().raw;
    expect(a).not.toBe(b);
  });
});

describe("hashApiKey", () => {
  it("deterministik: hash yang sama utk key yang sama", async () => {
    const raw = "wavio_testkey123";
    const h1 = await hashApiKey(raw);
    const h2 = await hashApiKey(raw);
    expect(h1).toBe(h2);
  });

  it("output SHA-256 hex (64 karakter)", async () => {
    const h = await hashApiKey("wavio_testkey123");
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });

  it("key berbeda → hash berbeda", async () => {
    const h1 = await hashApiKey("wavio_key_a");
    const h2 = await hashApiKey("wavio_key_b");
    expect(h1).not.toBe(h2);
  });
});
