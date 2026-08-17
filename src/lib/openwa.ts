// REST client OpenWA — semua panggilan memakai admin key via header X-API-Key.
// Endpoint diverifikasi dari OpenWA `docs/06-api-specification.md`.

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
};
