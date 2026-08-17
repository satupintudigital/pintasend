// Parser multipart/form-data minimal untuk Cloudflare Worker.
//
// Dibuat sendiri (tanpa dependensi busboy/parse-multipart) karena:
// - busboy bergantung pada Node streams yang berisik di runtime Worker;
// - kebutuhan sederhana: beberapa field teks + SATU file biner (upload /v1/messages);
// - murni Buffer/Uint8Array → mudah di-test di vitest.
//
// Batasan yang diterima secara sadar: body dipegang penuh di memori (cocok untuk
// cap 25 MB upload), tidak streaming.

export class MultipartError extends Error {}

export interface MultipartPart {
  name: string;
  filename?: string;
  contentType: string;
  data: Uint8Array;
}

export interface MultipartForm {
  fields: Record<string, string>;
  files: MultipartPart[];
}

const CRLF = "\r\n";
const te = new TextEncoder();
const td = new TextDecoder();

/** Cari urutan byte `needle` dalam `haystack` mulai dari `start`; -1 bila tak ada. */
function findSequence(haystack: Uint8Array, needle: Uint8Array, start: number): number {
  if (needle.length === 0) return start;
  outer: for (let i = start; i <= haystack.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) continue outer;
    }
    return i;
  }
  return -1;
}

function getBoundary(contentType: string | null): string | null {
  if (!contentType) return null;
  const m = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType);
  if (!m) return null;
  return (m[1] ?? m[2]).trim();
}

export interface MultipartOptions {
  /** Batas jumlah file yang diterima (default 1). */
  maxFiles?: number;
  /** Batas ukuran satu bagian file (bytes); default tak terbatas. */
  maxFileBytes?: number;
}

/** Nama file aman utk key penyimpanan: alfanumerik/titik/strip, tanpa path traversal. */
export function sanitizeFilename(name: string): string {
  const clean = name.replace(/[^\w.\-]+/g, "-").replace(/^\.+/, "").slice(0, 80);
  return clean || "file";
}

/**
 * Parse body multipart/form-data.
 * @throws MultipartError bila format tidak valid.
 */
export function parseMultipartForm(
  body: Uint8Array,
  contentType: string | null,
  opts?: MultipartOptions,
): MultipartForm {
  const boundary = getBoundary(contentType);
  if (!boundary) {
    throw new MultipartError("Content-Type multipart/form-data tanpa boundary");
  }
  const maxFiles = opts?.maxFiles ?? 1;
  const maxFileBytes = opts?.maxFileBytes ?? Number.POSITIVE_INFINITY;

  const delim = te.encode(`--${boundary}`);
  const headerEnd = te.encode(`${CRLF}${CRLF}`);

  const fields: Record<string, string> = {};
  const files: MultipartPart[] = [];

  let pos = findSequence(body, delim, 0);
  if (pos === -1) throw new MultipartError("multipart: pembatas (boundary) tidak ditemukan");

  while (pos !== -1) {
    let p = pos + delim.length;
    // Penutup akhir "--"
    if (body[p] === 0x2d && body[p + 1] === 0x2d) break;
    // Setiap bagian diawali CRLF
    if (body[p] !== 0x0d || body[p + 1] !== 0x0a) break;
    p += 2;

    // Akhir blok header
    const he = findSequence(body, headerEnd, p);
    if (he === -1) throw new MultipartError("multipart: header bagian tidak lengkap");
    const headerText = td.decode(body.subarray(p, he));
    const contentStart = he + headerEnd.length;

    // Bagian berikutnya / penutup
    const next = findSequence(body, delim, contentStart);
    if (next === -1) throw new MultipartError("multipart: penutup tidak ditemukan");

    // Isi: buang CRLF sebelum delimiter (bila ada)
    let contentEnd = next;
    if (contentEnd >= 2 && body[contentEnd - 2] === 0x0d && body[contentEnd - 1] === 0x0a) {
      contentEnd -= 2;
    }

    // name boleh ber-quote (baku) atau polos (name=to).
    const nameMatch = /name="([^"]*)"|name=([^;\s]+)/i.exec(headerText);
    const name = nameMatch ? (nameMatch[1] ?? nameMatch[2]) : "";
    const filenameMatch = /filename="([^"]*)"/i.exec(headerText);
    const filename = filenameMatch?.[1];
    const contentTypePart = /content-type:\s*([^\r\n]+)/i.exec(headerText)?.[1]?.trim() ?? "";

    if (filename !== undefined) {
      if (files.length >= maxFiles) {
        throw new MultipartError(`multipart: maksimal ${maxFiles} file per request`);
      }
      if (contentEnd - contentStart > maxFileBytes) {
        throw new MultipartError("multipart: file melebihi batas ukuran");
      }
      files.push({
        name,
        filename,
        contentType: contentTypePart,
        data: body.subarray(contentStart, contentEnd),
      });
    } else {
      fields[name] = td.decode(body.subarray(contentStart, contentEnd));
    }

    pos = next;
  }

  return { fields, files };
}
