import { describe, expect, it } from "vitest";
import { MEDIA_LIMITS, parseMediaPayload } from "./media";

const okMedia = (input: Record<string, unknown>) => {
  const r = parseMediaPayload(input);
  expect(r.ok).toBe(true);
  if (!r.ok) throw new Error("unreachable");
  return r.media;
};

describe("parseMediaPayload", () => {
  it("menerima mediaUrl http(s) tanpa field lain", () => {
    const m = okMedia({ mediaType: "image", mediaUrl: "https://cdn.example.com/a.jpg" });
    expect(m).toEqual({ mediaType: "image", url: "https://cdn.example.com/a.jpg" });
  });

  it("menerima mediaBase64 + mimetype + filename + caption (dari text)", () => {
    const m = okMedia({
      mediaType: "document",
      mediaBase64: "JVBERi0xLjQK",
      mimetype: "application/pdf",
      filename: "invoice.pdf",
      text: "Invoice terlampir",
    });
    expect(m).toEqual({
      mediaType: "document",
      base64: "JVBERi0xLjQK",
      mimetype: "application/pdf",
      filename: "invoice.pdf",
      caption: "Invoice terlampir",
    });
  });

  it("menormalkan mediaType ke huruf kecil", () => {
    const m = okMedia({ mediaType: "DOCUMENT", mediaUrl: "https://x.test/d.pdf" });
    expect(m.mediaType).toBe("document");
  });

  it("menerima base64 dengan newline (encoder umum tiap 76 karakter)", () => {
    const wrapped = "JVBERi0xLjQK\nJFBERi0xLjQK\nICAxIDAgb2Jq";
    const m = okMedia({
      mediaType: "document",
      mediaBase64: wrapped,
      mimetype: "application/pdf",
    });
    expect(m.base64).toBe("JVBERi0xLjQKJFBERi0xLjQKICAxIDAgb2Jq");
  });

  it("menolak prefix data: dengan pesan jelas", () => {
    const r = parseMediaPayload({
      mediaType: "image",
      mediaBase64: "data:image/png;base64,iVBORw0KGgo=",
      mimetype: "image/png",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("prefix");
  });

  it("menolak mediaType di luar whitelist", () => {
    const r = parseMediaPayload({ mediaType: "gif", mediaUrl: "https://x.test/a.gif" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("mediaType");
  });

  it("menolak tanpa sumber media", () => {
    const r = parseMediaPayload({ mediaType: "image" });
    expect(r.ok).toBe(false);
  });

  it("menolak url DAN base64 sekaligus", () => {
    const r = parseMediaPayload({
      mediaType: "image",
      mediaUrl: "https://x.test/a.jpg",
      mediaBase64: "abc=",
      mimetype: "image/jpeg",
    });
    expect(r.ok).toBe(false);
  });

  it("menolak base64 tanpa mimetype", () => {
    const r = parseMediaPayload({ mediaType: "image", mediaBase64: "abc=" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("mimetype");
  });

  it("menolak mediaUrl non-http(s)", () => {
    const r = parseMediaPayload({ mediaType: "image", mediaUrl: "file:///etc/passwd" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("http");
  });

  it("menolak mediaUrl terlalu panjang", () => {
    const r = parseMediaPayload({
      mediaType: "image",
      mediaUrl: `https://x.test/${"a".repeat(MEDIA_LIMITS.urlMax)}`,
    });
    expect(r.ok).toBe(false);
  });

  it("menolak base64 dengan karakter tidak valid", () => {
    const r = parseMediaPayload({ mediaType: "image", mediaBase64: "abc$%^", mimetype: "image/jpeg" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("base64");
  });

  it("menolak base64 dengan padding salah", () => {
    const r = parseMediaPayload({ mediaType: "image", mediaBase64: "abc=", mimetype: "image/jpeg" });
    expect(r.ok).toBe(true); // padding '=' valid utk panjang 4
    const r2 = parseMediaPayload({ mediaType: "image", mediaBase64: "abc", mimetype: "image/jpeg" });
    expect(r2.ok).toBe(false);
  });

  it("menolak base64 terlalu besar", () => {
    const r = parseMediaPayload({
      mediaType: "video",
      mediaBase64: "A".repeat(MEDIA_LIMITS.base64MaxChars + 4),
      mimetype: "video/mp4",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("terlalu besar");
  });

  it("menolak filename > 255 karakter", () => {
    const r = parseMediaPayload({
      mediaType: "document",
      mediaBase64: "abc=",
      mimetype: "application/pdf",
      filename: "f".repeat(256),
    });
    expect(r.ok).toBe(false);
  });

  it("menolak caption (text) > 1024 karakter", () => {
    const r = parseMediaPayload({
      mediaType: "image",
      mediaUrl: "https://x.test/a.jpg",
      text: "c".repeat(1025),
    });
    expect(r.ok).toBe(false);
  });
});
