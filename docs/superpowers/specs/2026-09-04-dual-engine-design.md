# Dual-Engine OpenWA Setup — Design Spec

**Date:** 2026-09-04
**Status:** Draft
**Problem:** OpenWA only supports one engine at a time (`ENGINE_TYPE=baileys` or `whatsapp-web.js`). Some features (Labels, Channels, Profile, Edit Message) require whatsapp-web.js, but Baileys is lighter and faster for messaging.

---

## Executive Summary

Run **two OpenWA instances** side-by-side — one Baileys, one whatsapp-web.js — behind a **single Wavio gateway**. Tenants choose the engine per device. The gateway routes API calls to the correct instance based on the device's engine assignment.

### Benefits

| Benefit | Description |
|---------|-------------|
| **Full feature access** | Labels, Channels, Profile, Edit Message available on whatsapp-web.js |
| **Lightweight messaging** | Baileys for high-throughput messaging (50MB/session vs 400-500MB) |
| **Tenant choice** | Each device can use the engine that fits its use case |
| **Graceful degradation** | Features return clear errors when engine doesn't support them |

---

## Architecture

```
                    ┌─────────────────────────────────────────┐
                    │              Wavio Gateway              │
                    │  (Next.js + Cloudflare Workers)         │
                    │                                         │
                    │  ┌─────────────────────────────────┐   │
                    │  │     Engine Router (NEW)          │   │
                    │  │                                  │   │
                    │  │  device.engine === "baileys"     │   │
                    │  │    → http://openwa-baileys:2785  │   │
                    │  │                                  │   │
                    │  │  device.engine === "webjs"       │   │
                    │  │    → http://openwa-webjs:2786    │   │
                    │  └─────────────────────────────────┘   │
                    └──────────┬──────────────┬───────────────┘
                               │              │
              ┌────────────────┘              └────────────────┐
              │                                                │
              ▼                                                ▼
┌─────────────────────────┐                ┌─────────────────────────┐
│   OpenWA Baileys        │                │   OpenWA whatsapp-web.js │
│   (Instance 1)          │                │   (Instance 2)           │
│                         │                │                          │
│  ENGINE_TYPE=baileys    │                │  ENGINE_TYPE=whatsapp-web.js │
│  Port: 2785             │                │  Port: 2786              │
│  DB: openwa_baileys     │                │  DB: openwa_webjs        │
│                         │                │                          │
│  ✅ Text/Media Send     │                │  ✅ All Baileys features │
│  ✅ Chat Management     │                │  ✅ Labels               │
│  ✅ Presence            │                │  ✅ Channels             │
│  ✅ Config              │                │  ✅ Profile              │
│  ❌ Labels              │                │  ✅ Edit Message         │
│  ❌ Channels            │                │  ✅ Reactions            │
│  ❌ Profile             │                │  ✅ Media Download       │
│  ❌ Edit Message        │                │                          │
└─────────────────────────┘                └─────────────────────────┘
```

---

## Data Model Changes

### Device Table — Add Engine Field

```sql
-- Add engine column to Device table
ALTER TABLE "Device" ADD COLUMN "engine" TEXT NOT NULL DEFAULT 'baileys';

-- Values: 'baileys' | 'webjs'
-- Default: 'baileys' (current behavior)
```

### Prisma Schema Update

```prisma
model Device {
  id              String   @id @default(uuid(7))
  tenantId        String
  tenant          Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  label           String
  openwaSessionId String   @unique
  openwaWebhookId String?
  phone           String?
  restriction     String?
  status          String   @default("created")
  engine          String   @default("baileys")  // NEW: 'baileys' | 'webjs'
  // ... existing fields
}
```

---

## Configuration Changes

### Environment Variables

```bash
# .env additions for dual-engine setup

# Baileys instance
OPENWA_BAILEYS_URL=http://openwa-baileys:2785
OPENWA_BAILEYS_API_KEY=owa_k1_baileys_key_here

# whatsapp-web.js instance
OPENWA_WEBJS_URL=http://openwa-webjs:2786
OPENWA_WEBJS_API_KEY=owa_k1_webjs_key_here

# Default engine for new devices
DEFAULT_ENGINE=baileys
```

### Docker Compose Addition

```yaml
# docker-compose.override.yml — add second OpenWA instance

services:
  openwa-webjs:
    image: rmyndharis/openwa:latest
    container_name: openwa-webjs
    restart: unless-stopped
    networks:
      - openwa-network
    ports:
      - '127.0.0.1:2786:2785'
    environment:
      - ENGINE_TYPE=whatsapp-web.js
      - NODE_ENV=production
      - DATABASE_TYPE=sqlite
      - SESSION_DATA_PATH=/app/data/sessions
      - PUPPETEER_HEADLESS=true
      - PUPPETEER_ARGS=--no-sandbox,--disable-setuid-sandbox,--disable-dev-shm-usage,--disable-gpu
    volumes:
      - openwa-webjs-data:/app/data
    mem_limit: 4g  # whatsapp-web.js needs more memory
    pids_limit: 4096

volumes:
  openwa-webjs-data:
```

---

## Wavio Code Changes

### 1. Engine Router (`src/lib/engineRouter.ts`) — NEW

```typescript
// Routes API calls to the correct OpenWA instance based on device engine

import { config } from "./config";

export interface EngineEndpoint {
  baseUrl: string;
  apiKey: string;
}

const engines: Record<string, EngineEndpoint> = {
  baileys: {
    baseUrl: config.openwaBaileysUrl || config.openwaBaseUrl,
    apiKey: config.openwaBaileysApiKey || config.openwaApiKey,
  },
  webjs: {
    baseUrl: config.openwaWebjsUrl || config.openwaBaseUrl,
    apiKey: config.openwaWebjsApiKey || config.openwaApiKey,
  },
};

export function getEngineEndpoint(engine: string): EngineEndpoint {
  return engines[engine] || engines.baileys;
}

export function isFeatureSupported(
  engine: string,
  feature: string
): boolean {
  const webjsOnlyFeatures = ["labels", "channels", "profile", "editMessage", "reactions", "mediaDownload"];
  if (webjsOnlyFeatures.includes(feature)) {
    return engine === "webjs";
  }
  return true; // All engines support basic features
}
```

### 2. Update OpenWA Client (`src/lib/openwa.ts`) — MODIFY

```typescript
// Add engine-aware methods

import { getEngineEndpoint, isFeatureSupported } from "./engineRouter";

export function getOpenWAForDevice(engine: string) {
  const endpoint = getEngineEndpoint(engine);
  return createOpenWAClient(endpoint.baseUrl, endpoint.apiKey);
}

export function checkFeatureSupport(engine: string, feature: string): void {
  if (!isFeatureSupported(engine, feature)) {
    throw new FeatureNotSupportedError(
      `Fitur ${feature} tidak tersedia pada engine ${engine}`
    );
  }
}
```

### 3. Device Service (`src/lib/devices.ts`) — MODIFY

```typescript
// Add engine selection during device creation

export async function createDeviceAndStart(
  label: string,
  tenantId: string,
  engine: string = "baileys"  // NEW parameter
) {
  // ... existing logic

  // Use the correct OpenWA instance based on engine
  const openwa = getOpenWAForDevice(engine);
  const session = await openwa.createSession({ name: label });

  // Store engine in device record
  await queryD1One(
    'INSERT INTO Device (id, tenantId, label, openwaSessionId, status, engine) VALUES (?, ?, ?, ?, ?, ?)',
    [id, tenantId, label, session.id, 'created', engine]
  );

  return { id, openwaSessionId: session.id, engine };
}
```

### 4. Route Handlers — MODIFY

Update all v1 routes to use engine-aware client:

```typescript
// Example: src/app/v1/labels/route.ts

import { getDeviceBySessionId } from "@/lib/devices";
import { getOpenWAForDevice, checkFeatureSupport } from "@/lib/engineRouter";

export async function GET(req: Request) {
  // ... auth logic

  const device = await getDeviceBySessionId(sessionId);
  checkFeatureSupport(device.engine, "labels");  // Throws if not supported

  const openwa = getOpenWAForDevice(device.engine);
  const labels = await openwa.listLabels(sessionId);

  return Response.json({ labels });
}
```

---

## Dashboard UI Changes

### Device Creation — Engine Selector

```tsx
// src/app/dashboard/devices/page.tsx — add engine selector

<select
  value={selectedEngine}
  onChange={(e) => setSelectedEngine(e.target.value)}
  className="..."
>
  <option value="baileys">
    Baileys (Ringan, ~50MB/session)
  </option>
  <option value="webjs">
    whatsapp-web.js (Fitur lengkap, ~400MB/session)
  </option>
</select>
```

### Device Card — Engine Badge

```tsx
// Show engine type on device card

<span className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2 py-0.5 text-xs">
  {device.engine === "baileys" ? "⚡ Baileys" : "🌐 Web.js"}
</span>
```

### Feature Availability Indicator

```tsx
// Show which features are available based on engine

{device.engine === "baileys" && (
  <p className="text-xs text-amber-400">
    ⚠️ Labels, Channels, Profile tidak tersedia
  </p>
)}
```

---

## Migration Plan

### Phase 1: Database Migration

```sql
-- Add engine column with default value
ALTER TABLE "Device" ADD COLUMN "engine" TEXT NOT NULL DEFAULT 'baileys';

-- Existing devices stay on Baileys (no disruption)
```

### Phase 2: Deploy Second Instance

```bash
# Deploy whatsapp-web.js instance
docker compose -f docker-compose.yml -f docker-compose.webjs.yml up -d openwa-webjs

# Verify both instances are running
curl http://localhost:2785/api/health  # Baileys
curl http://localhost:2786/api/health  # whatsapp-web.js
```

### Phase 3: Update Wavio Gateway

```bash
# Update environment variables
OPENWA_BAILEYS_URL=http://openwa-baileys:2785
OPENWA_WEBJS_URL=http://openwa-webjs:2786

# Deploy updated Wavio
npm run deploy
```

### Phase 4: User Migration

- Existing devices stay on Baileys (no action needed)
- New devices can choose engine during creation
- Users can migrate devices via dashboard (requires QR re-scan)

---

## Cost Analysis

### Resource Usage

| Instance | Memory/Session | 10 Sessions | 50 Sessions |
|----------|---------------|-------------|-------------|
| Baileys | ~50 MB | ~500 MB | ~2.5 GB |
| whatsapp-web.js | ~400 MB | ~4 GB | ~20 GB |
| **Combined** | — | ~4.5 GB | ~22.5 GB |

### Recommended Server Specs

| Sessions | CPU | RAM | Storage |
|----------|-----|-----|---------|
| 1-10 | 2 vCPU | 4 GB | 20 GB |
| 10-50 | 4 vCPU | 8 GB | 50 GB |
| 50-100 | 8 vCPU | 16 GB | 100 GB |

---

## Feature Support Matrix

| Feature | Baileys | whatsapp-web.js | Notes |
|---------|---------|-----------------|-------|
| Send Text | ✅ | ✅ | |
| Send Media | ✅ | ✅ | |
| Chat List | ✅ | ✅ | |
| Archive/Mute/Pin | ✅ | ✅ | |
| Pin/Unpin/Star Message | ✅ | ✅ | |
| Presence (online/offline) | ✅ | ✅ | |
| Config (autoReject, reconnect) | ✅ | ✅ | |
| Pairing Code | ✅ | ✅ | |
| **Labels** | ❌ | ✅ | Engine limitation |
| **Channels** | ❌ | ✅ | Engine limitation |
| **Profile** | ❌ | ✅ | Engine limitation |
| **Edit Message** | ❌ | ✅ | Engine limitation |
| **Reactions** | ❌ | ✅ | Engine limitation |
| **Media Download** | ❌ | ✅ | Engine limitation |

---

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| whatsapp-web.js memory usage | High | Set mem_limit, monitor usage |
| Chromium crashes | Medium | Auto-restart, health checks |
| Session migration complexity | Medium | Provide clear UI, document process |
| Two databases to maintain | Low | Use SQLite for both, backup regularly |
| API key management | Low | Separate keys per instance |

---

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `src/lib/engineRouter.ts` | CREATE | Route to correct OpenWA instance |
| `src/lib/openwa.ts` | MODIFY | Add engine-aware client creation |
| `src/lib/devices.ts` | MODIFY | Add engine parameter to device creation |
| `src/lib/config.ts` | MODIFY | Add engine endpoint configs |
| `prisma/schema.prisma` | MODIFY | Add engine field to Device model |
| `src/app/dashboard/devices/page.tsx` | MODIFY | Add engine selector UI |
| `src/components/dashboard/SidebarNav.tsx` | NO CHANGE | — |
| `docker-compose.webjs.yml` | CREATE | Second OpenWA instance |
| `.env.example` | MODIFY | Add engine endpoint vars |

---

## Testing Plan

1. **Unit Tests:** Engine router, feature support checks
2. **Integration Tests:** Device creation with both engines
3. **E2E Tests:** Send message via Baileys, create label via webjs
4. **Load Tests:** Memory usage with multiple sessions per engine
5. **Migration Tests:** Existing devices continue working after update

---

## Success Criteria

- [ ] Both OpenWA instances running simultaneously
- [ ] Devices can be created with either engine
- [ ] Features work correctly on their respective engines
- [ ] Clear error messages when feature unavailable
- [ ] Dashboard shows engine type and feature availability
- [ ] Memory usage stays within server limits
- [ ] No disruption to existing Baileys sessions
