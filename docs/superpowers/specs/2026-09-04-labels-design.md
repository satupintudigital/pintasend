# Labels — Design Spec

**Date:** 2026-09-04
**Status:** Draft
**Depends on:** OpenWA v0.23.3 (already deployed)

## Overview

Dual-layer label system:
1. **Wavio-local labels** — stored in Neon, used for CRM segmentation, campaign audience filtering, dashboard organization
2. **OpenWA label sync** — bidirectional sync with WhatsApp's native label system (visible in WhatsApp dashboard)

Wavio-local labels are the primary source of truth. OpenWA sync is optional per-label.

## Data Model

### New Table: `Label` (Neon)

```prisma
model Label {
  id              String   @id @default(uuid(7))
  tenantId        String
  tenant          Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  name            String   // "VIP Customer", "New Lead", etc.
  color           String   @default("#6366f1") // hex color for dashboard
  openwaLabelId   String?  // synced OpenWA label ID (null = local-only)
  openwaSyncedAt  DateTime? // last sync timestamp
  isActive        Boolean  @default(true)
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt @default(now())

  contacts        LabelContact[]

  @@unique([tenantId, name])
  @@index([tenantId, isActive])
}
```

### New Table: `LabelContact` (Neon)

```prisma
model LabelContact {
  id          String   @id @default(uuid(7))
  tenantId    String
  labelId     String
  label       Label    @relation(fields: [labelId], references: [id], onDelete: Cascade)
  chatId      String   // JID: "62812...@c.us"
  createdAt   DateTime @default(now())

  @@unique([labelId, chatId])
  @@index([tenantId, chatId])
  @@index([labelId])
}
```

## API Endpoints

### 1. List Labels

```
GET /v1/labels
```

**Response:**
```json
{
  "ok": true,
  "labels": [
    {
      "id": "lbl_01j7...",
      "name": "VIP Customer",
      "color": "#6366f1",
      "contactCount": 42,
      "openwaSynced": true,
      "isActive": true
    }
  ]
}
```

**Service file:** `src/lib/labels.ts` (listLabels)

### 2. Create Label

```
POST /v1/labels
```

**Request body:**
```json
{
  "name": "New Lead",
  "color": "#10b981",
  "syncToOpenwa": true,
  "deviceId": "optional (for OpenWA sync)"
}
```

**Flow:**
1. Validate name uniqueness per tenant
2. INSERT into Neon `Label`
3. If `syncToOpenwa` + deviceId: `POST /api/sessions/:id/labels` on OpenWA
4. Store returned `openwaLabelId`

**Response:** `{ ok: true, label: { id, name, color, openwaSynced } }`

**Service file:** `src/lib/labels.ts` (createLabel)

### 3. Update Label

```
PUT /v1/labels/:labelId
```

**Request body:** Same as create (partial update)

**Flow:**
1. Update Neon row
2. If synced: `PUT /api/sessions/:id/labels/:openwaLabelId` on OpenWA
3. Update `openwaSyncedAt`

**Service file:** `src/lib/labels.ts` (updateLabel)

### 4. Delete Label

```
DELETE /v1/labels/:labelId
```

**Flow:**
1. DELETE from Neon (cascade removes LabelContact rows)
2. If synced: `DELETE /api/sessions/:id/labels/:openwaLabelId` on OpenWA

**Service file:** `src/lib/labels.ts` (deleteLabel)

### 5. Add Chat to Label

```
POST /v1/labels/:labelId/chats
```

**Request body:**
```json
{
  "chatId": "6281234567890@c.us",
  "deviceId": "optional"
}
```

**Flow:**
1. INSERT into `LabelContact`
2. If label is OpenWA-synced: `POST /api/sessions/:id/labels/:openwaLabelId/chats/:chatId` on OpenWA

**Response:** `{ ok: true, added: true }`

**Service file:** `src/lib/labels.ts` (addChatToLabel)

### 6. Remove Chat from Label

```
DELETE /v1/labels/:labelId/chats/:chatId?deviceId=optional
```

**Flow:** Mirror of add (DELETE from Neon + OpenWA)

**Service file:** `src/lib/labels.ts` (removeChatFromLabel)

### 7. List Chats by Label

```
GET /v1/labels/:labelId/chats?limit=50&offset=0
```

**Response:**
```json
{
  "ok": true,
  "label": { "id": "...", "name": "VIP Customer" },
  "chats": [
    { "chatId": "62812...@c.us", "name": "Alice", "addedAt": "..." }
  ]
}
```

**Service file:** `src/lib/labels.ts` (listChatsByLabel)

### 8. Bulk Add Chats to Label

```
POST /v1/labels/:labelId/chats/bulk
```

**Request body:**
```json
{
  "chatIds": ["62812...@c.us", "62813...@c.us"],
  "deviceId": "optional"
}
```

**Response:** `{ ok: true, added: 2, skipped: 0 }`

**Service file:** `src/lib/labels.ts` (bulkAddChatsToLabel)

## OpenWA Sync Strategy

### Initial Sync (on label creation)
1. Create label on OpenWA via `POST /api/sessions/:id/labels`
2. Store returned `openwaLabelId` in Neon
3. If existing chats are already assigned to this label locally, add them to OpenWA

### Bidirectional Sync (webhook-driven)
- Listen to `label.chat.added` and `label.chat.removed` webhook events from OpenWA
- When OpenWA reports a label-chat change → sync to Neon `LabelContact`
- When Wavio adds/removes a chat from a label → sync to OpenWA (if synced)

### Sync Conflict Resolution
- **Wavio is source of truth** for label name/color
- **OpenWA is source of truth** for label-chat associations (since WhatsApp users can also manage labels from their phone)
- Neon `LabelContact` is the canonical record; OpenWA is the operational store

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `src/lib/labels.ts` | CREATE | Service layer (all label operations) |
| `src/lib/labelSync.ts` | CREATE | OpenWA sync logic |
| `src/app/v1/labels/route.ts` | CREATE | List + Create labels |
| `src/app/v1/labels/[labelId]/route.ts` | CREATE | Update + Delete label |
| `src/app/v1/labels/[labelId]/chats/route.ts` | CREATE | List chats by label + Add chat |
| `src/app/v1/labels/[labelId]/chats/[chatId]/route.ts` | CREATE | Remove chat from label |
| `src/app/v1/labels/[labelId]/chats/bulk/route.ts` | CREATE | Bulk add chats |
| `src/app/api/webhooks/openwa/route.ts` | MODIFY | Handle label.chat.added/removed events |
| `src/lib/openwa.ts` | MODIFY | Add: listLabels, createLabel, updateLabel, deleteLabel, addChatToLabel, removeChatFromLabel |
| `prisma/schema.prisma` | MODIFY | Add Label + LabelContact models |

## Testing

- `src/lib/labels.test.ts` — unit tests for all label CRUD + sync logic
- `src/lib/labelSync.test.ts` — unit tests for OpenWA sync strategy
- `src/app/v1/labels/route.test.ts` — integration tests for API routes
- Webhook label event handling tests in `src/app/api/webhooks/openwa/route.test.ts`

## Dashboard UI

New "Labels" page in dashboard:
- Label list with color chips and contact counts
- Create/edit label modal (name + color picker + sync toggle)
- Label detail view: list of chats assigned to this label
- Add/remove chats via multi-select or search
- Bulk operations
- Label chips on chat cards (clickable filter)
