import { describe, expect, it } from "vitest";
import { isSafeWebhookUrl } from "./ssrf";

describe("isSafeWebhookUrl", () => {
  it("terima URL publik biasa", () => {
    expect(isSafeWebhookUrl("https://api.tokoku.com/webhooks/wavio")).toBe(true);
    expect(isSafeWebhookUrl("http://webhook.example.id/wa")).toBe(true);
    expect(isSafeWebhookUrl("https://sub.domain.co.id/path?x=1")).toBe(true);
  });

  it("tolak protokol non-http(s)", () => {
    expect(isSafeWebhookUrl("ftp://example.com/x")).toBe(false);
    expect(isSafeWebhookUrl("file:///etc/passwd")).toBe(false);
    expect(isSafeWebhookUrl("javascript:alert(1)")).toBe(false);
  });

  it("tolak kredensial di URL", () => {
    expect(isSafeWebhookUrl("https://user:pass@example.com/x")).toBe(false);
  });

  it("tolak IP private / link-local / loopback / multicast", () => {
    expect(isSafeWebhookUrl("http://127.0.0.1:3000/wh")).toBe(false);
    expect(isSafeWebhookUrl("http://10.0.0.5/wh")).toBe(false);
    expect(isSafeWebhookUrl("http://172.16.0.1/wh")).toBe(false);
    expect(isSafeWebhookUrl("http://192.168.1.1/wh")).toBe(false);
    expect(isSafeWebhookUrl("http://169.254.169.254/latest/meta-data/")).toBe(false);
    expect(isSafeWebhookUrl("http://100.64.0.1/wh")).toBe(false);
    expect(isSafeWebhookUrl("http://224.0.0.1/wh")).toBe(false);
  });

  it("tolak hostname internal", () => {
    expect(isSafeWebhookUrl("http://localhost:3000/wh")).toBe(false);
    expect(isSafeWebhookUrl("http://api.local/wh")).toBe(false);
    expect(isSafeWebhookUrl("http://db.internal/wh")).toBe(false);
    expect(isSafeWebhookUrl("http://nas.lan/wh")).toBe(false);
  });

  it("tolak IPv6 private", () => {
    expect(isSafeWebhookUrl("http://[::1]:8080/wh")).toBe(false);
    expect(isSafeWebhookUrl("http://[fc00::1]/wh")).toBe(false);
    expect(isSafeWebhookUrl("http://[fe80::1]/wh")).toBe(false);
    expect(isSafeWebhookUrl("http://[::ffff:127.0.0.1]/wh")).toBe(false);
  });

  it("terima IP publik literal", () => {
    expect(isSafeWebhookUrl("https://8.8.8.8/wh")).toBe(true);
    expect(isSafeWebhookUrl("https://94.237.68.57:443/wh")).toBe(true);
  });
});
