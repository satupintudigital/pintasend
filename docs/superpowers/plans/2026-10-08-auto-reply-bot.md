# Auto-Reply & Keyword Bot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mengembangkan fitur Auto-Reply & Keyword Bot untuk tenant PintaSend.

**Architecture:** 
- Source of Truth: Tabel `TenantSetting` di Neon PostgreSQL (`key = 'bot_rules'`).
- Cache: Cloudflare KV `PINTSEND_CACHE` (`tenant:cfg:<tenantId>:bot_rules`) dengan write-through invalidation.
- Ingest: Handler `POST /api/webhooks/openwa` mengecek rules aktif via cache pada event `message.received` dan membalas via `sendMessage`.
- UI: Halaman `/dashboard/bot/page.tsx` + Komponen `BotRulePanel.tsx` + Navigasi di `SidebarNav.tsx`.

---

### Task 1: Bot Rules Service & Unit Tests
- Create `src/lib/botRules.ts` (CRUD rules + matcher logic: exact > starts_with > contains + KV cache get/invalidate).
- Create `src/lib/botRules.test.ts`.

### Task 2: API Endpoints
- Create `src/app/api/bot/rules/route.ts` (GET, POST).
- Create `src/app/api/bot/rules/[id]/route.ts` (PUT, DELETE).
- Create `src/lib/botRulesApi.test.ts`.

### Task 3: Ingest Integration
- Update `src/app/api/webhooks/openwa/route.ts` to trigger bot reply on incoming messages.

### Task 4: UI & Navigation
- Create `src/components/dashboard/BotRulePanel.tsx`.
- Create `src/app/dashboard/bot/page.tsx`.
- Update `src/components/dashboard/SidebarNav.tsx` with "Auto-Reply Bot".
