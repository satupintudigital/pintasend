// REST client OpenWA — semua panggilan memakai admin key via header X-API-Key.
// Endpoint diverifikasi dari OpenWA `docs/06-api-specification.md`.
// Import relatif (bukan @/) agar modul ini ikut ter-test di vitest (tidak
// me-resolve alias tsconfig); Next.js menangani keduanya dengan baik.
import { hashApiKey } from "./apiKeys";
import { jsonFetch, type JsonMethod } from "./http";

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
  /** Pembatasan akun oleh WhatsApp (null = tidak ada). */
  restriction?: { kind: string; code: string; expiresAt: string | null } | null;
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

// Template pesan dari GET/POST /api/sessions/:id/templates (TemplateResponseDto).
export interface OpenwaTemplate {
  id: string;
  name: string;
  header: string | null;
  body: string;
  footer: string | null;
  createdAt: string;
  updatedAt: string;
}

// Ringkasan grup dari GET /api/sessions/:id/groups (proyeksi narrow OpenWA).
// `id` = JID grup (120363…@g.us); `linkedParentJID` = parent community (null bila
// standalone). `participantsCount`/`isAdmin` opsional — hanya ada bila engine
// melaporkannya.
export interface OpenwaGroupSummary {
  id: string;
  name: string;
  participantsCount?: number;
  isAdmin?: boolean;
  linkedParentJID?: string | null;
}

export class OpenwaError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "OpenwaError";
    this.status = status;
  }
}

// Konversi error ke pesan PUBLIK yang aman — detail internal (status, message,
// host, session id, stack) TIDAK pernah bocor ke client; detail lengkap dicatat
// ke console.error untuk debugging internal. Dipakai semua route yang
// meneruskan kegagalan OpenWA (devices, v1/messages, dll.).
//
// Catatan: pemanggil tetap bisa membaca `e.status` (mis. 404 = session tidak
// ditemukan vs 502 = gateway error) untuk logika kontrol — yang di-mask hanya
// pesan yang ditampilkan ke publik.
export function publicOpenwaError(e: unknown, context: string): string {
  const detail = e instanceof OpenwaError ? `OpenWA ${e.status}: ${e.message}` : String(e);
  console.error(`[openwa] ${context} gagal:`, detail);
  return "Gateway WhatsApp sedang bermasalah. Coba lagi nanti.";
}

function config() {
  return {
    baseUrl: process.env.OPENWA_BASE_URL ?? "http://94.237.68.57:2785",
    apiKey: process.env.OPENWA_ADMIN_KEY ?? "",
  };
}

// init.body adalah objek TERSTRUKTUR — diserialisasi otomatis di sini via
// jsonFetch/postJson (single source of truth di src/lib/http.ts). Tidak ada
// lagi JSON.stringify manual di call site, jadi body tak mungkin salah kirim
// (regresi bug token Turnstile: raw string ke receiver yang parsing JSON).
interface OpenwaRequestInit extends Omit<RequestInit, "body"> {
  body?: unknown;
}

async function request<T>(path: string, init?: OpenwaRequestInit): Promise<T> {
  const { baseUrl, apiKey } = config();
  const url = `${baseUrl}${path}`;
  const authHeaders = { "X-API-Key": apiKey, ...(init?.headers ?? {}) };
  // Pisahkan body (objek terstruktur) dari init lain (method/header/signal...)
  // agar spread ke fetch tidak membawa tipe body: unknown.
  const { body, ...restInit } = init ?? {};
  let res: Response;
  if (body !== undefined) {
    // Hanya POST/PUT/PATCH yang membawa body di modul ini (GET/DELETE tanpa body).
    res = await jsonFetch((restInit.method ?? "POST") as JsonMethod, url, body, {
      headers: authHeaders,
    });
  } else {
    res = await fetch(url, {
      ...restInit,
      headers: { ...authHeaders, "Content-Type": "application/json" },
    });
  }
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
    request<OpenwaSession>("/api/sessions", { method: "POST", body: { name } }),
  startSession: (sessionId: string) =>
    request<OpenwaSession>(`/api/sessions/${sessionId}/start`, { method: "POST" }),
  getQr: (sessionId: string) => request<OpenwaQr>(`/api/sessions/${sessionId}/qr`),
  logoutSession: (sessionId: string) =>
    request<unknown>(`/api/sessions/${sessionId}/logout`, { method: "POST" }),
  deleteSession: (sessionId: string) =>
    request<unknown>(`/api/sessions/${sessionId}`, { method: "DELETE" }),
  // Cek apakah nomor terdaftar di WhatsApp (pra-validasi sebelum kirim).
  // `number` = digit internasional (6281234567890). Respons: { number, exists,
  // whatsappId } — whatsappId null bila nomor tidak terdaftar.
  checkContact: (sessionId: string, number: string) =>
    request<{ number: string; exists: boolean; whatsappId: string | null }>(
      `/api/sessions/${sessionId}/contacts/check/${encodeURIComponent(number)}`,
    ),
  // Blokir kontak (moderasi spam). contactId = JID (62812…@c.us / @g.us / @lid).
  blockContact: (sessionId: string, contactId: string) =>
    request<{ success?: boolean }>(`/api/sessions/${sessionId}/contacts/${encodeURIComponent(contactId)}/block`, {
      method: "POST",
    }),
  // Buka blokir kontak.
  unblockContact: (sessionId: string, contactId: string) =>
    request<{ success?: boolean }>(`/api/sessions/${sessionId}/contacts/${encodeURIComponent(contactId)}/block`, {
      method: "DELETE",
    }),
  // Tandai chat dibaca (read receipts). messageIds opsional — Baileys meng-ack
  // per pesan; tanpa ini hanya pesan terbaru yang ditandai (MarkChatReadDto).
  markChatRead: (sessionId: string, chatId: string, messageIds?: string[]) =>
    request<{ success?: boolean }>(`/api/sessions/${sessionId}/chats/read`, {
      method: "POST",
      body: {
        chatId,
        ...(messageIds?.length ? { messageIds } : {}),
      },
    }),
  // Daftar template terdaftar untuk satu session (dropdown form dashboard).
  // Respons: array TemplateResponseDto ({ id, name, header, body, footer, ... }).
  listTemplates: (sessionId: string) =>
    request<OpenwaTemplate[]>(`/api/sessions/${sessionId}/templates`),
  // Buat template baru untuk session (seed otomatis saat device dibuat).
  // name unik per session — konflik → 409 (OpenwaError).
  createTemplate: (
    sessionId: string,
    body: { name: string; header?: string | null; body: string; footer?: string | null },
  ) =>
    request<OpenwaTemplate>(`/api/sessions/${sessionId}/templates`, {
      method: "POST",
      body: {
        name: body.name,
        body: body.body,
        ...(body.header ? { header: body.header } : {}),
        ...(body.footer ? { footer: body.footer } : {}),
      },
    }),
  // Kirim pesan lokasi (SendLocationDto): { chatId, latitude, longitude,
  // description?, address?, quotedMessageId? }.
  sendLocation: (
    sessionId: string,
    chatId: string,
    body: {
      latitude: number;
      longitude: number;
      description?: string;
      address?: string;
      replyTo?: string;
    },
  ) =>
    request<OpenwaSendResult>(`/api/sessions/${sessionId}/messages/send-location`, {
      method: "POST",
      body: {
        chatId,
        latitude: body.latitude,
        longitude: body.longitude,
        ...(body.description ? { description: body.description } : {}),
        ...(body.address ? { address: body.address } : {}),
        ...(body.replyTo ? { quotedMessageId: body.replyTo } : {}),
      },
    }),
  // Kirim kartu kontak (SendContactDto): { chatId, contactName, contactNumber,
  // quotedMessageId? }.
  sendContact: (
    sessionId: string,
    chatId: string,
    body: { contactName: string; contactNumber: string; replyTo?: string },
  ) =>
    request<OpenwaSendResult>(`/api/sessions/${sessionId}/messages/send-contact`, {
      method: "POST",
      body: {
        chatId,
        contactName: body.contactName,
        contactNumber: body.contactNumber,
        ...(body.replyTo ? { quotedMessageId: body.replyTo } : {}),
      },
    }),
  // Kirim poll WhatsApp (SendPollDto): { chatId, name, options[2-12],
  // allowMultipleAnswers?, quotedMessageId? }.
  sendPoll: (
    sessionId: string,
    chatId: string,
    body: {
      name: string;
      options: string[];
      allowMultipleAnswers?: boolean;
      replyTo?: string;
    },
  ) =>
    request<OpenwaSendResult>(`/api/sessions/${sessionId}/messages/send-poll`, {
      method: "POST",
      body: {
        chatId,
        name: body.name,
        options: body.options,
        ...(body.allowMultipleAnswers !== undefined ? { allowMultipleAnswers: body.allowMultipleAnswers } : {}),
        ...(body.replyTo ? { quotedMessageId: body.replyTo } : {}),
      },
    }),
  // Tambah/hapus reaksi emoji ke pesan (ReactMessageDto). emoji kosong ("") =
  // hapus reaksi — kontrak endpoint OpenWA.
  react: (sessionId: string, chatId: string, messageId: string, emoji: string) =>
    request<{ success: boolean }>(`/api/sessions/${sessionId}/messages/react`, {
      method: "POST",
      body: { chatId, messageId, emoji },
    }),
  // Kirim broadcast async (SendBulkMessageDto). Respons 202: { batchId, status,
  // totalMessages, estimatedCompletionTime, statusUrl }. Pesan diproses bertahap
  // dengan delay; hasil per pesan dibaca via getBatchStatus.
  sendBulk: (
    sessionId: string,
    body: {
      messages: {
        chatId: string;
        type: "text" | "image" | "video" | "audio" | "document";
        content: Record<string, unknown>;
        variables?: Record<string, string>;
      }[];
      options?: {
        delayBetweenMessages?: number;
        randomizeDelay?: boolean;
        stopOnError?: boolean;
      };
    },
  ) =>
    request<{
      batchId: string;
      status: string;
      totalMessages: number;
      estimatedCompletionTime: string;
      statusUrl: string;
    }>(`/api/sessions/${sessionId}/messages/send-bulk`, {
      method: "POST",
      body: {
        messages: body.messages,
        ...(body.options && Object.keys(body.options).length ? { options: body.options } : {}),
      },
    }),
  // Status batch broadcast (BatchStatusResponseDto): { batchId, status,
  // progress, results, startedAt, completedAt }.
  getBatchStatus: (sessionId: string, batchId: string) =>
    request<{ batchId: string; status: string; progress?: unknown; results?: unknown; startedAt?: string; completedAt?: string }>(
      `/api/sessions/${sessionId}/messages/batch/${encodeURIComponent(batchId)}`,
    ),
  // Baca riwayat pesan dari DB lokal OpenWA (MessageListResponseDto: { messages })
  // — didukung SEMUA engine (tidak seperti GET .../history engine-based yang 501
  // di Baileys). Query: chatId (JID), limit, offset.
  // v0.23: `after` = keyset cursor (id pesan terakhir) — lebih stabil dari offset
  //         karena tidak melewatkan/gandakan pesan saat ada pesan baru.
  //         `inlineMedia` = false → omit media base64 (hemat bandwidth).
  listMessages: (
    sessionId: string,
    chatId: string,
    options?: { limit?: number; offset?: number; after?: string; inlineMedia?: boolean },
  ) => {
    const params = new URLSearchParams();
    params.set("chatId", chatId);
    if (options?.limit !== undefined) params.set("limit", String(options.limit));
    if (options?.offset !== undefined) params.set("offset", String(options.offset));
    if (options?.after !== undefined) params.set("after", options.after);
    if (options?.inlineMedia !== undefined) params.set("inlineMedia", String(options.inlineMedia));
    return request<{ messages?: unknown[] }>(
      `/api/sessions/${sessionId}/messages?${params.toString()}`,
    );
  },
  // Kirim template yang sudah disimpan di OpenWA (SendTemplateMessageDto).
  // templateName = nama template; vars disubstitusi ke token {{placeholder}}.
  sendTemplate: (
    sessionId: string,
    chatId: string,
    body: { templateName: string; vars?: Record<string, string> },
  ) =>
    request<OpenwaSendResult>(`/api/sessions/${sessionId}/messages/send-template`, {
      method: "POST",
      body: {
        chatId,
        templateName: body.templateName,
        ...(body.vars && Object.keys(body.vars).length ? { vars: body.vars } : {}),
      },
    }),
  // Daftar grup milik session (narrow projection: id, name, linkedParentJID;
  // bisa juga membawa participantsCount/isAdmin). Pagination limit (1-1000) &
  // offset — OpenWA men-clamp nilainya sendiri.
  listGroups: (sessionId: string, limit?: number, offset?: number) => {
    const params = new URLSearchParams();
    if (limit !== undefined) params.set("limit", String(limit));
    if (offset !== undefined) params.set("offset", String(offset));
    const qs = params.toString();
    return request<OpenwaGroupSummary[]>(`/api/sessions/${sessionId}/groups${qs ? `?${qs}` : ""}`);
  },
  // Kirim pesan teks. chatId format "62812...@c.us".
  // options.mentions = WID yang di-@ (contoh ["62811@c.us"]) — teks HARUS memuat
  // token @<number> yang sesuai (kontrak OpenWA SendTextMessageDto).
  // options.replyTo (quotedMessageId) = jadikan balasan ke pesan sebelumnya.
  sendText: (
    sessionId: string,
    chatId: string,
    text: string,
    options?: { mentions?: string[]; replyTo?: string },
  ) =>
    request<OpenwaSendResult>(`/api/sessions/${sessionId}/messages/send-text`, {
      method: "POST",
      body: {
        chatId,
        text,
        ...(options?.mentions?.length ? { mentions: options.mentions } : {}),
        ...(options?.replyTo ? { quotedMessageId: options.replyTo } : {}),
      },
    }),
  // Kirim media (gambar/video/audio/dokumen/stiker). DTO flat SendMediaMessageDto:
  // { chatId, url | base64, mimetype?, filename?, caption?, mentions?, quotedMessageId? }.
  // Guard whitelist di sini (mediaType masuk path URL) — bukan hanya di lapisan validasi API.
  sendMedia: (
    sessionId: string,
    chatId: string,
    mediaType: OpenwaMediaType,
    body: {
      url?: string;
      base64?: string;
      mimetype?: string;
      filename?: string;
      caption?: string;
      mentions?: string[];
      replyTo?: string;
    },
  ) => {
    if (!OPENWA_MEDIA_TYPES.includes(mediaType)) {
      throw new OpenwaError(400, `mediaType tidak didukung: ${mediaType}`);
    }
    const { replyTo, ...rest } = body;
    return request<OpenwaSendResult>(`/api/sessions/${sessionId}/messages/send-${mediaType}`, {
      method: "POST",
      body: {
        chatId,
        ...rest,
        ...(replyTo ? { quotedMessageId: replyTo } : {}),
      },
    });
  },
  // Webhook per session: OpenWA mem-POST event ke URL yang didaftarkan dan
  // menandatangani raw body dgn HMAC-SHA256 (header `x-openwa-signature`).
  // Secret bersifat write-only — di OpenWA sekalipun tidak bisa dibaca balik,
  // jadi Wavio menderivasinya deterministik (lihat openwaWebhookSecret).
  registerWebhook: (sessionId: string, body: { url: string; events: string[]; secret: string; retryCount?: number }) =>
    request<OpenwaWebhook>(`/api/sessions/${sessionId}/webhooks`, {
      method: "POST",
      body,
    }),
  // Daftar webhook terdaftar untuk satu session (untuk reconcile event).
  listWebhooks: (sessionId: string) =>
    request<OpenwaWebhook[]>(`/api/sessions/${sessionId}/webhooks`),
  // Update webhook (merge — hanya field yang dikirim berubah).
  updateWebhook: (
    sessionId: string,
    webhookId: string,
    body: { url?: string; events?: string[]; secret?: string; retryCount?: number },
  ) =>
    request<OpenwaWebhook>(`/api/sessions/${sessionId}/webhooks/${webhookId}`, {
      method: "PUT",
      body,
    }),
  deleteWebhook: (sessionId: string, webhookId: string) =>
    request<unknown>(`/api/sessions/${sessionId}/webhooks/${webhookId}`, { method: "DELETE" }),

  // ── v0.23: Message Operations ─────────────────────────────────────────────
  // Edit text of a sent message (keeps original id).
  editMessage: (
    sessionId: string,
    chatId: string,
    messageId: string,
    body: { text: string; mentions?: string[] },
  ) =>
    request<OpenwaSendResult>(`/api/sessions/${sessionId}/messages/edit`, {
      method: "POST",
      body: { chatId, messageId, ...body },
    }),
  // Delete/revoke a message (forEveryone = true = revoke for all).
  deleteMessage: (
    sessionId: string,
    chatId: string,
    messageId: string,
    forEveryone = true,
  ) =>
    request<{ success: boolean }>(`/api/sessions/${sessionId}/messages/delete`, {
      method: "POST",
      body: { chatId, messageId, forEveryone },
    }),
  // Forward a message from one chat to another.
  forwardMessage: (
    sessionId: string,
    fromChatId: string,
    toChatId: string,
    messageId: string,
  ) =>
    request<OpenwaSendResult>(`/api/sessions/${sessionId}/messages/forward`, {
      method: "POST",
      body: { fromChatId, toChatId, messageId },
    }),
  // Reply to a message (quoting a prior one).
  replyMessage: (
    sessionId: string,
    chatId: string,
    quotedMessageId: string,
    body: { text: string; mentions?: string[] },
  ) =>
    request<OpenwaSendResult>(`/api/sessions/${sessionId}/messages/reply`, {
      method: "POST",
      body: { chatId, quotedMessageId, ...body },
    }),
  // Pin a message (duration: 86400=24h, 604800=7d, 2592000=30d).
  pinMessage: (
    sessionId: string,
    chatId: string,
    messageId: string,
    durationSeconds = 86400,
  ) =>
    request<{ success: boolean }>(`/api/sessions/${sessionId}/messages/pin`, {
      method: "POST",
      body: { chatId, messageId, durationSeconds },
    }),
  // Unpin a message.
  unpinMessage: (sessionId: string, chatId: string, messageId: string) =>
    request<{ success: boolean }>(`/api/sessions/${sessionId}/messages/unpin`, {
      method: "POST",
      body: { chatId, messageId },
    }),
  // Star or unstar a message.
  starMessage: (sessionId: string, chatId: string, messageId: string, star: boolean) =>
    request<{ success: boolean }>(`/api/sessions/${sessionId}/messages/star`, {
      method: "POST",
      body: { chatId, messageId, star },
    }),
  // Get reactions for a message, grouped by emoji.
  getReactions: (sessionId: string, chatId: string, messageId: string) =>
    request<Record<string, string[]>>(
      `/api/sessions/${sessionId}/messages/${encodeURIComponent(chatId)}/${encodeURIComponent(messageId)}/reactions`,
    ),
  // Download a message's stored media (returns raw response for streaming).
  getMedia: (sessionId: string, chatId: string, messageId: string) =>
    fetch(
      `${config().baseUrl}/api/sessions/${sessionId}/messages/${encodeURIComponent(chatId)}/${encodeURIComponent(messageId)}/media`,
      { headers: { "X-API-Key": config().apiKey } },
    ),

  // ── v0.23: Chats Management ───────────────────────────────────────────────
  // List active chats (with kind, archived, pinned, muted).
  listChats: (
    sessionId: string,
    options?: { limit?: number; offset?: number },
  ) => {
    const params = new URLSearchParams();
    if (options?.limit !== undefined) params.set("limit", String(options.limit));
    if (options?.offset !== undefined) params.set("offset", String(options.offset));
    const qs = params.toString();
    return request<unknown[]>(`/api/sessions/${sessionId}/chats${qs ? `?${qs}` : ""}`);
  },
  // Archive or unarchive a chat.
  archiveChat: (sessionId: string, chatId: string, archive: boolean) =>
    request<{ success: boolean }>(`/api/sessions/${sessionId}/chats/archive`, {
      method: "POST",
      body: { chatId, archive },
    }),
  // Mute a chat until epoch-ms, or unmute (muteUntil = null).
  muteChat: (sessionId: string, chatId: string, muteUntil?: number | null) =>
    request<{ success: boolean }>(`/api/sessions/${sessionId}/chats/mute`, {
      method: "POST",
      body: { chatId, ...(muteUntil !== undefined ? { muteUntil } : {}) },
    }),
  // Pin or unpin a chat.
  pinChat: (sessionId: string, chatId: string, pin: boolean) =>
    request<{ success: boolean }>(`/api/sessions/${sessionId}/chats/pin`, {
      method: "POST",
      body: { chatId, pin },
    }),
  // Delete a chat from the chat list.
  deleteChat: (sessionId: string, chatId: string) =>
    request<{ success: boolean }>(`/api/sessions/${sessionId}/chats/delete`, {
      method: "POST",
      body: { chatId },
    }),
  // Send typing/recording/paused presence indicator.
  sendTyping: (sessionId: string, chatId: string, state: "typing" | "recording" | "paused") =>
    request<{ success: boolean }>(`/api/sessions/${sessionId}/chats/typing`, {
      method: "POST",
      body: { chatId, state },
    }),
  // Delete all messages in a chat.
  deleteChatMessages: (sessionId: string, chatId: string) =>
    request<{ success: boolean }>(`/api/sessions/${sessionId}/chats/${encodeURIComponent(chatId)}/messages`, {
      method: "DELETE",
    }),

  // ── v0.23: Labels ─────────────────────────────────────────────────────────
  // List all labels for a session.
  listLabels: (sessionId: string) =>
    request<{ id: string; name: string; color: string }[]>(
      `/api/sessions/${sessionId}/labels`,
    ),
  // Create a new label.
  createLabel: (sessionId: string, name: string, color?: string) =>
    request<{ id: string; name: string; color: string }>(
      `/api/sessions/${sessionId}/labels`,
      { method: "POST", body: { name, ...(color ? { color } : {}) } },
    ),
  // Update a label.
  updateLabel: (sessionId: string, labelId: string, body: { name?: string; color?: string }) =>
    request<{ id: string; name: string; color: string }>(
      `/api/sessions/${sessionId}/labels/${labelId}`,
      { method: "PUT", body },
    ),
  // Delete a label.
  deleteLabel: (sessionId: string, labelId: string) =>
    request<unknown>(`/api/sessions/${sessionId}/labels/${labelId}`, { method: "DELETE" }),
  // Add a chat to a label.
  addChatToLabel: (sessionId: string, labelId: string, chatId: string) =>
    request<{ success: boolean }>(`/api/sessions/${sessionId}/labels/${labelId}/chats`, {
      method: "POST",
      body: { chatId },
    }),
  // Remove a chat from a label.
  removeChatFromLabel: (sessionId: string, labelId: string, chatId: string) =>
    request<{ success: boolean }>(
      `/api/sessions/${sessionId}/labels/${labelId}/chats/${encodeURIComponent(chatId)}`,
      { method: "DELETE" },
    ),
  // List chats assigned to a label.
  listChatsByLabel: (sessionId: string, labelId: string) =>
    request<{ chatId: string }[]>(
      `/api/sessions/${sessionId}/labels/${labelId}/chats`,
    ),

  // ── v0.23: Session Config ─────────────────────────────────────────────────
  // Get session tunable config.
  getConfig: (sessionId: string) =>
    request<{ autoRejectCalls: boolean; maxReconnectAttempts: number | null; reconnectBaseDelay: number }>(
      `/api/sessions/${sessionId}/config`,
    ),
  // Patch session config (partial update).
  patchConfig: (
    sessionId: string,
    body: { autoRejectCalls?: boolean; maxReconnectAttempts?: number | null; reconnectBaseDelay?: number },
  ) =>
    request<{ autoRejectCalls: boolean; maxReconnectAttempts: number | null; reconnectBaseDelay: number }>(
      `/api/sessions/${sessionId}/config`,
      { method: "PATCH", body },
    ),
  // Request pairing code (alternative to QR).
  requestPairingCode: (sessionId: string, phoneNumber: string) =>
    request<{ pairingCode: string; status: string }>(
      `/api/sessions/${sessionId}/pairing-code`,
      { method: "POST", body: { phoneNumber } },
    ),

  // ── v0.23: Profile ────────────────────────────────────────────────────────
  // Get profile info (name, about, phone).
  getProfile: (sessionId: string) =>
    request<{ name: string; about: string; phone: string }>(
      `/api/sessions/${sessionId}/profile`,
    ),
  // Patch profile (name and/or about).
  patchProfile: (sessionId: string, body: { name?: string; about?: string }) =>
    request<{ name: string; about: string }>(
      `/api/sessions/${sessionId}/profile`,
      { method: "PATCH", body },
    ),
  // Get profile picture (returns raw Response for streaming).
  getProfilePicture: (sessionId: string) =>
    fetch(
      `${config().baseUrl}/api/sessions/${sessionId}/profile/picture`,
      { headers: { "X-API-Key": config().apiKey } },
    ),
  // Set profile picture (image as base64).
  setProfilePicture: (sessionId: string, imageBase64: string, mimetype: string) =>
    request<{ success: boolean }>(`/api/sessions/${sessionId}/profile/picture`, {
      method: "POST",
      body: { image: imageBase64, mimetype },
    }),
  // Delete profile picture.
  deleteProfilePicture: (sessionId: string) =>
    request<{ success: boolean }>(`/api/sessions/${sessionId}/profile/picture`, {
      method: "DELETE",
    }),

  // ── v0.23: Presence ───────────────────────────────────────────────────────
  // Set own global presence (online/offline).
  setOwnPresence: (sessionId: string, available: boolean) =>
    request<{ success: boolean }>(`/api/sessions/${sessionId}/presence`, {
      method: "PUT",
      body: { available },
    }),
  // Subscribe to presence updates for a chat (Baileys only).
  subscribePresence: (sessionId: string, chatId: string) =>
    request<{ success: boolean }>(`/api/sessions/${sessionId}/presence/subscribe`, {
      method: "POST",
      body: { chatId },
    }),
  // Get last presence report for a chat.
  getPresence: (sessionId: string, chatId: string) =>
    request<{ chatId: string; participants: { id: string; state: string; lastSeen?: number }[]; observedAt: string } | null>(
      `/api/sessions/${sessionId}/presence/${encodeURIComponent(chatId)}`,
    ),

  // ── v0.23: Channels ───────────────────────────────────────────────────────
  // List WhatsApp channels.
  listChannels: (sessionId: string) =>
    request<{ id: string; name: string; description?: string; subscriberCount?: number }[]>(
      `/api/sessions/${sessionId}/channels`,
    ),
  // Create a new channel.
  createChannel: (sessionId: string, body: { name: string; description?: string }) =>
    request<{ id: string; name: string }>(
      `/api/sessions/${sessionId}/channels`,
      { method: "POST", body },
    ),
};

export const OPENWA_WEBHOOK_EVENTS = [
  "message.received",
  "session.status",
  "message.ack",
  "message.failed",
  "message.edited",
  "message.reaction",
  "session.restriction",
  "message.sent",
  "message.revoked",
] as const;

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
