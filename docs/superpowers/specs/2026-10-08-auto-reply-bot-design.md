# Design Spec: Auto-Reply & Keyword Bot (`/dashboard/bot`)

## 1. Overview & Objectives
Memberikan kemampuan bagi tenant untuk mengatur balasan otomatis (*auto-responder*) berbasis kata kunci (*keyword matching*) dan pesan sambutan (*welcome message*), sehingga WhatsApp bisnis tenant dapat merespons pelanggan 24/7 tanpa perlu server webhook pihak ketiga.

---

## 2. Architecture & Data Flow

### 2.1 Storage & Schema
- Disimpan di Neon PostgreSQL pada tabel baru `BotRule` atau key-value JSON di `TenantSetting` / `bot_rules`.
- Struktur Rule:
  ```ts
  export interface BotRule {
    id: string;
    tenantId: string;
    name: string;
    keyword: string; // contoh: "halo", "#menu", "harga"
    matchType: "exact" | "contains" | "starts_with";
    response: string; // pesan balasan teks/template
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
  }
  ```

### 2.2 Trigger & OpenWA Webhook Integration
- Saat event `message.received` masuk di `src/app/api/webhooks/openwa/route.ts`:
  1. Pastikan pesan bukan dari diri sendiri (`!fromMe`) dan bukan event broadcast/status.
  2. Ambil bot rules aktif milik tenant dari cache KV / D1 / DB.
  3. Evaluasi teks pesan masuk terhadap `keyword` & `matchType`:
     - `exact`: `body.trim().toLowerCase() === keyword.toLowerCase()`
     - `contains`: `body.toLowerCase().includes(keyword.toLowerCase())`
     - `starts_with`: `body.toLowerCase().startsWith(keyword.toLowerCase())`
  4. Jika cocok (rule pertama yang prioritas), trigger pengiriman pesan balasan otomatis via `sendMessage` internal API ke `chatId` pengirim.
  5. Catat log di `MessageLog` (`direction: 'outgoing'`, status dikirim).

---

## 3. Endpoints & API

- `GET /api/bot/rules`: Mengembalikan daftar bot rules milik tenant sesi.
- `POST /api/bot/rules`: Membuat rule baru `{ name, keyword, matchType, response, isActive }`.
- `PUT /api/bot/rules/[id]`: Memperbarui rule (ubah keyword, teks balasan, atau toggle aktif/nonaktif).
- `DELETE /api/bot/rules/[id]`: Menghapus rule.

---

## 4. UI/UX Interface (`/dashboard/bot`)
- Menu baru di `SidebarNav.tsx`: **"Auto-Reply Bot"** (icon `Robot` / `ChatCenteredDots`).
- Halaman `/dashboard/bot/page.tsx` + `BotRulePanel.tsx`:
  - Daftar bot rule dengan badge status (*Aktif / Nonaktif*), tipe pencocokan (*Exact, Contains, Starts With*), dan preview balasan.
  - Modal "Tambah Rule Baru" dan "Edit Rule".
  - Toggle cepat aktifkan / matikan rule tanpa masuk modal edit.

---

## 5. Verification & Testing
1. **Unit Test (`src/lib/botRules.test.ts`)**:
   - Test matching logic (`exact`, `contains`, `starts_with`).
   - Test CRUD & validation (keyword tidak boleh kosong).
2. **Integration Test (`openwaWebhookBot.test.ts`)**:
   - Mensimulasikan payload `message.received` dan memastikan balasan terkirim ke `chatId` yang sesuai.
