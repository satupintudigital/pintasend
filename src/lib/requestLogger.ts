// X-Request-Id + structured logging untuk endpoint Wavio.
//
// Tujuan:
//   1. Setiap request punya id korelasi — dipakai di header respons `X-Request-Id`
//      (client bisa tracing) dan disertakan di SEMUA baris log event request tsb.
//   2. Log terstruktur: satu baris JSON per event (level, event, requestId,
//      timestamp, fields) — mudah di-parse agregator seperti Cloudflare Workers
//      Logs / Grafana, tanpa parsing teks bebas.
//
// Id masuk (X-Request-Id dari client) dipakai bila valid agar tracing lintas
// layanan tetap sinkron; jika tidak ada / invalid → generate uuidv7 baru.
// Charset dibatasi untuk mencegah log/header injection.

import { uuidv7 } from "./uuidv7";

const MAX_REQUEST_ID_LEN = 128;
// Hanya karakter aman: huruf, angka, dan . _ : - (uuid, W3C traceparent, dsb.).
const REQUEST_ID_RE = /^[A-Za-z0-9._:-]+$/;

export type LogLevel = "info" | "warn" | "error";

export interface LogFields {
  [key: string]: unknown;
}

/** Validasi X-Request-Id masuk. Invalid (kosong/terlalu panjang/charset aneh) → null (generate baru). */
export function sanitizeRequestId(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_REQUEST_ID_LEN) return null;
  if (!REQUEST_ID_RE.test(trimmed)) return null;
  return trimmed;
}

/**
 * Ambil request id untuk request ini: X-Request-Id masuk (jika valid), selain
 * itu uuidv7 baru. Id ini diecho di header respons dan dipakai sebagai
 * korelasi di semua log event request.
 */
export function getRequestId(req: Request): string {
  return sanitizeRequestId(req.headers.get("x-request-id")) ?? uuidv7();
}

/**
 * Structured logging — SATU baris JSON per event. Selalu sertakan level, event,
 * requestId, dan timestamp ISO; field tambahan (tenantId, status, dsb.) bebas.
 */
export function logEvent(
  level: LogLevel,
  event: string,
  requestId: string,
  fields?: LogFields,
): void {
  // Key reserved (level/event/requestId/timestamp) diletakkan SETELAH fields
  // agar tidak bisa tertimpa — mis. route webhook mengirim field data `event`
  // yang namanya bertabrakan dengan nama event log.
  const line = JSON.stringify({
    ...fields,
    level,
    event,
    requestId,
    timestamp: new Date().toISOString(),
  });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}
