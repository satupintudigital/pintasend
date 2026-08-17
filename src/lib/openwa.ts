// REST client OpenWA — semua panggilan memakai admin key via header X-API-Key.
// Endpoint diverifikasi dari OpenWA `docs/06-api-specification.md`.
// Import relatif (bukan @/) agar modul ini ikut ter-test di vitest (tidak
// me-resolve alias tsconfig); Next.js menangani keduanya dengan baik.
import { hashApiKey } from "./apiKeys";

export interface OpenwaSession {
  id: string;
  name: string;
  status: string;
  phone: string | null;
  pushName: string | null;
  connectedAt: string | null;
  lastActive: string | null;
  createdAt: string;
  updatedAt: string;
  lastError: string | null;
  engineLoaded: boolean;
}

export interface OpenwaQr {
  qrCode: string;
  status: string;
}

export interface OpenwaSendResult {
  messageId?: string;
  id?: string;
  status?: string;
  [key: string]: unknown;
}

export type OpenwaMediaType = "image" | "video" | "audio" | "document" | "sticker";

// Whitelist tipe media — SATU sumber kebenaran: dipakai juga oleh lib/media.ts
// (validasi API). Karena mediaType masuk ke PATH URL endpoint OpenWA
// (send-${mediaType}), whitelist ini dijaga di tempat endpoint-nya didefinisikan
// (defense-in-depth: pemanggil masa depan tidak bisa melewatinya).
export const OPENWA_MEDIA_TYPES: readonly OpenwaMediaType[] = [
  "image",
  "video",
  "audio",
  "document",
  "sticker",
];

export interface OpenwaWebhook {
  id: string;
  url: string;
  events: string[];
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export class OpenwaError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "OpenwaError";
    this.status = status;
  }
}

function config() {
  return {
    baseUrl: process.env.OPENWA_BASE_URL ?? "http://94.237.68.57:2785",
    apiKey: process.env.OPENWA_ADMIN_KEY ?? "",
  };
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const { baseUrl, apiKey } = config();
  const res = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      "X-API-Key": apiKey,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    let message = res.statusText;
    try {
      const body = await res.text();
      if (body) message = body.slice(0, 300);
    } catch {
      /* ignore */
    }
    throw new OpenwaError(res.status, message);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const openwa = {
  listSessions: () => request<OpenwaSession[]>("/api/sessions"),
  getSession: (sessionId: string) => request<OpenwaSession>(`/api/sessions/${sessionId}`),
  createSession: (name: string) =>
    request<OpenwaSession>("/api/sessions", { method: "POST", body: JSON.stringify({ name }) }),
  startSession: (sessionId: string) =>
    request<OpenwaSession>(`/api/sessions/${sessionId}/start`, { method: "POST" }),
  getQr: (sessionId: string) => request<OpenwaQr>(`/api/sessions/${sessionId}/qr`),
  logoutSession: (sessionId: string) =>
    request<unknown>(`/api/sessions/${sessionId}/logout`, { method: "POST" }),
  deleteSession: (sessionId: string) =>
    request<unknown>(`/api/sessions/${sessionId}`, { method: "DELETE" }),
  // Kirim pesan teks. chatId format "62812...@c.us".
  sendText: (sessionId: string, chatId: string, text: string) =>
    request<OpenwaSendResult>(`/api/sessions/${sessionId}/messages/send-text`, {
      method: "POST",
      body: JSON.stringify({ chatId, text }),
    }),
  // Kirim media (gambar/video/audio/dokumen/stiker). DTO flat SendMediaMessageDto:
  // { chatId, url | base64, mimetype?, filename?, caption? }. Guard whitelist di
  // sini (mediaType masuk path URL) — bukan hanya di lapisan validasi API.
  sendMedia: (
    sessionId: string,
    chatId: string,
    mediaType: OpenwaMediaType,
    body: { url?: string; base64?: string; mimetype?: string; filename?: string; caption?: string },
  ) => {
    if (!OPENWA_MEDIA_TYPES.includes(mediaType)) {
      throw new OpenwaError(400, `mediaType tidak didukung: ${mediaType}`);
    }
    return request<OpenwaSendResult>(`/api/sessions/${sessionId}/messages/send-${mediaType}`, {
      method: "POST",
      body: JSON.stringify({ chatId, ...body }),
    });
  },
  // Webhook per session: OpenWA mem-POST event ke URL yang didaftarkan dan
  // menandatangani raw body dgn HMAC-SHA256 (header `x-openwa-signature`).
  // Secret bersifat write-only — di OpenWA sekalipun tidak bisa dibaca balik,
  // jadi Wavio menderivasinya deterministik (lihat openwaWebhookSecret).
  registerWebhook: (sessionId: string, body: { url: string; events: string[]; secret: string; retryCount?: number }) =>
    request<OpenwaWebhook>(`/api/sessions/${sessionId}/webhooks`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  deleteWebhook: (sessionId: string, webhookId: string) =>
    request<unknown>(`/api/sessions/${sessionId}/webhooks/${webhookId}`, { method: "DELETE" }),
};

export const OPENWA_WEBHOOK_EVENTS = ["message.received", "session.status"] as const;

export type OpenwaWebhookEvent = (typeof OPENWA_WEBHOOK_EVENTS)[number];

// Secret webhook per session, diturunkan DETERMINISTIK dari secret global
// (OPENWA_WEBHOOK_SECRET, fallback OPENWA_ADMIN_KEY) + sessionId. Karena
// OpenWA tidak mengembalikan secret webhook setelah dibuat, Wavio tidak perlu
// menyimpan secret per device — cukup menghitung ulang saat verifikasi masuk.
// (hashApiKey = SHA-256 hex, cukup sebagai material HMAC.)
//
// ⚠ OPENWA_WEBHOOK_SECRET bersifat stable-for-life: merotasi secret ini akan
// membatalkan signature SEMUA device yang sudah terdaftar (ingest 401 → OpenWA
// retry 3× → dead-letter). Jika terpaksa rotasi, semua device harus di-unregister
// & di-register ulang webhook-nya.
export async function openwaWebhookSecret(sessionId: string): Promise<string> {
  const base =
    process.env.OPENWA_WEBHOOK_SECRET ?? process.env.OPENWA_ADMIN_KEY ?? "wavio-dev";
  return hashApiKey(`${base}:${sessionId}`);
}
