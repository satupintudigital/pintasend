import { describe, expect, it } from "vitest";
import { MultipartError, parseMultipartForm, sanitizeFilename } from "./multipart";

function buildBody(boundary: string, parts: { headers: string; content: Uint8Array }[]): Uint8Array {
  const enc = new TextEncoder();
  const chunks: Uint8Array[] = [];
  for (const part of parts) {
    chunks.push(enc.encode(`--${boundary}\r\n${part.headers}\r\n\r\n`));
    chunks.push(part.content);
    chunks.push(enc.encode("\r\n"));
  }
  chunks.push(enc.encode(`--${boundary}--\r\n`));
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.length;
  }
  return out;
}

const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a]); // %PDF-1.4\n

describe("parseMultipartForm", () => {
  it("parses fields + satu file biner", () => {
    const boundary = "----WavioBoundary7MA4YWxkTrZu0gW";
    const body = buildBody(boundary, [
      { headers: `Content-Disposition: form-data; name="to"`, content: new TextEncoder().encode("6281234567890") },
      { headers: `Content-Disposition: form-data; name="mediaType"`, content: new TextEncoder().encode("document") },
      {
        headers: `Content-Disposition: form-data; name="file"; filename="invoice.pdf"\r\nContent-Type: application/pdf`,
        content: pdfBytes,
      },
    ]);
    const form = parseMultipartForm(body, `multipart/form-data; boundary=${boundary}`);
    expect(form.fields.to).toBe("6281234567890");
    expect(form.fields.mediaType).toBe("document");
    expect(form.files).toHaveLength(1);
    expect(form.files[0].filename).toBe("invoice.pdf");
    expect(form.files[0].contentType).toBe("application/pdf");
    expect(Array.from(form.files[0].data)).toEqual(Array.from(pdfBytes));
  });

  it("mendukung boundary ber-quote dengan parameter lain di content-type", () => {
    const boundary = "abc123";
    const body = buildBody(boundary, [
      { headers: `Content-Disposition: form-data; name="to"`, content: new TextEncoder().encode("08x") },
    ]);
    const form = parseMultipartForm(
      body,
      `multipart/form-data; charset=utf-8; boundary="${boundary}"`,
    );
    expect(form.fields.to).toBe("08x");
    expect(form.files).toHaveLength(0);
  });

  it("menangani nama field tanpa quotes", () => {
    const boundary = "b1";
    const body = buildBody(boundary, [
      { headers: `Content-Disposition: form-data; name=to`, content: new TextEncoder().encode("6281") },
    ]);
    const form = parseMultipartForm(body, `multipart/form-data; boundary=${boundary}`);
    expect(form.fields.to).toBe("6281");
  });

  it("teks field berisi CRLF tetap utuh (bukan terpotong)", () => {
    const boundary = "b2";
    const caption = new TextEncoder().encode("Baris 1\r\nBaris 2");
    const body = buildBody(boundary, [
      { headers: `Content-Disposition: form-data; name="text"`, content: caption },
    ]);
    const form = parseMultipartForm(body, `multipart/form-data; boundary=${boundary}`);
    expect(form.fields.text).toBe("Baris 1\r\nBaris 2");
  });

  it("file dengan content 0 byte diterima (filename kosong diabaikan)", () => {
    const boundary = "b3";
    const body = buildBody(boundary, [
      { headers: `Content-Disposition: form-data; name="file"; filename="empty.txt"`, content: new Uint8Array(0) },
    ]);
    const form = parseMultipartForm(body, `multipart/form-data; boundary=${boundary}`);
    expect(form.files[0].data.byteLength).toBe(0);
  });

  it("menolak tanpa boundary", () => {
    expect(() => parseMultipartForm(new Uint8Array(0), "multipart/form-data")).toThrow(MultipartError);
  });

  it("menolak body yang tidak memuat boundary dari content-type", () => {
    const boundary = "b4";
    const body = buildBody(boundary, [
      { headers: `Content-Disposition: form-data; name="to"`, content: new TextEncoder().encode("x") },
    ]);
    expect(() => parseMultipartForm(body, `multipart/form-data; boundary=lain`)).toThrow(
      MultipartError,
    );
  });

  it("maxFiles membatasi jumlah file", () => {
    const boundary = "b5";
    const mk = (i: number) => ({
      headers: `Content-Disposition: form-data; name="f${i}"; filename="a.txt"`,
      content: new TextEncoder().encode("x"),
    });
    const body = buildBody(boundary, [mk(1), mk(2)]);
    expect(() =>
      parseMultipartForm(body, `multipart/form-data; boundary=${boundary}`, { maxFiles: 1 }),
    ).toThrow(/maksimal/);
  });

  it("maxFileBytes membatasi ukuran file", () => {
    const boundary = "b6";
    const body = buildBody(boundary, [
      { headers: `Content-Disposition: form-data; name="f"; filename="big.bin"`, content: new Uint8Array(5) },
    ]);
    expect(() =>
      parseMultipartForm(body, `multipart/form-data; boundary=${boundary}`, { maxFileBytes: 4 }),
    ).toThrow(/batas ukuran/);
  });

  it("file lalu field (urutan campuran) tetap ter-parse", () => {
    const boundary = "b7";
    const body = buildBody(boundary, [
      {
        headers: `Content-Disposition: form-data; name="file"; filename="a.pdf"\r\nContent-Type: application/pdf`,
        content: pdfBytes,
      },
      { headers: `Content-Disposition: form-data; name="text"`, content: new TextEncoder().encode("caption") },
    ]);
    const form = parseMultipartForm(body, `multipart/form-data; boundary=${boundary}`);
    expect(form.files).toHaveLength(1);
    expect(form.files[0].filename).toBe("a.pdf");
    expect(form.fields.text).toBe("caption");
  });
});

describe("sanitizeFilename", () => {
  it("membersihkan path traversal & karakter aneh", () => {
    expect(sanitizeFilename("../../etc/passwd")).not.toContain("/");
    expect(sanitizeFilename("invoice 1234.pdf")).toBe("invoice-1234.pdf");
    expect(sanitizeFilename("a\\b:c*?.txt")).toBe("a-b-c-.txt");
    expect(sanitizeFilename("...")).toBe("file");
    expect(sanitizeFilename("")).toBe("file");
  });

  it("memotong nama terlalu panjang (max 80)", () => {
    expect(sanitizeFilename("x".repeat(200))).toHaveLength(80);
  });
});
