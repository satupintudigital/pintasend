# Chats Management — Design Spec

**Date:** 2026-09-04
**Status:** Draft
**Depends on:** OpenWA v0.23.3 (already deployed)

## Overview

Add chat listing and management capabilities to Wavio's public v1 API and dashboard. Enables tenants to view, organize, and manage WhatsApp chats programmatically.

## New API Endpoints

### 1. List Active Chats

```
GET /v1/chats?deviceId=optional&limit=50&offset=0
```

**Response:**
```json
{
  "ok": true,
  "chats": [
    {
      "id": "6281234567890@c.us",
      "name": "Alice",
      "isGroup": false,
      "kind": "individual",
      "unreadCount": 2,
      "timestamp": 1719306115,
      "lastMessage": "See you tomorrow",
      "archived": false,
      "pinned": false,
      "muted": false
    }
  ]
}
```

**Query params:**
- `kind` — filter by kind: `individual`, `group`, `channel`, `status`, `broadcast`, `unknown`
- `limit` — max 1000, default 100
- `offset` — skip N chats
- `deviceId` — specific device (optional, auto-selects if omitted)

**Service file:** `src/lib/listChats.ts`

### 2. Archive / Unarchive Chat

```
POST /v1/chats/archive
```

**Request body:**
```json
{
  "chatId": "6281234567890@c.us",
  "archive": true,
  "deviceId": "optional"
}
```

**Response:** `{ ok: true, archived: true }`

**Service file:** `src/lib/archiveChat.ts`

### 3. Mute / Unmute Chat

```
POST /v1/chats/mute
```

**Request body:**
```json
{
  "chatId": "6281234567890@c.us",
  "muteUntil": 1800000000000,
  "deviceId": "optional"
}
```

**Constraints:**
- `muteUntil` = epoch milliseconds. `null` or omitted = unmute.
- Convenience: `muteForHours: 8` can be used instead of computing epoch

**Response:** `{ ok: true, muted: true, muteUntil: 1800000000000 }`

**Service file:** `src/lib/muteChat.ts`

### 4. Pin / Unpin Chat

```
POST /v1/chats/pin
```

**Request body:**
```json
{
  "chatId": "6281234567890@c.us",
  "pin": true,
  "deviceId": "optional"
}
```

**Response:** `{ ok: true, pinned: true }`

**Service file:** `src/lib/pinChat.ts`

### 5. Delete Chat

```
POST /v1/chats/delete
```

**Request body:**
```json
{
  "chatId": "6281234567890@c.us",
  "deviceId": "optional"
}
```

**Response:** `{ ok: true, deleted: true }`

**Service file:** `src/lib/deleteChat.ts`

### 6. Send Typing Indicator

```
POST /v1/chats/typing
```

**Request body:**
```json
{
  "chatId": "6281234567890@c.us",
  "state": "typing",
  "deviceId": "optional"
}
```

**Constraints:**
- `state`: `"typing"` | `"recording"` | `"paused"` (paused clears indicator)

**Response:** `{ ok: true }`

**Service file:** `src/lib/sendTyping.ts`

### 7. Delete All Messages in Chat

```
DELETE /v1/chats/:chatId/messages?deviceId=optional
```

**Response:** `{ ok: true, cleared: true }`

**Service file:** `src/lib/clearChatMessages.ts`

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `src/lib/listChats.ts` | CREATE | Service layer |
| `src/lib/archiveChat.ts` | CREATE | Service layer |
| `src/lib/muteChat.ts` | CREATE | Service layer |
| `src/lib/pinChat.ts` | CREATE | Service layer |
| `src/lib/deleteChat.ts` | CREATE | Service layer |
| `src/lib/sendTyping.ts` | CREATE | Service layer |
| `src/lib/clearChatMessages.ts` | CREATE | Service layer |
| `src/app/v1/chats/route.ts` | CREATE | List chats (GET) |
| `src/app/v1/chats/archive/route.ts` | CREATE | Archive/unarchive |
| `src/app/v1/chats/mute/route.ts` | CREATE | Mute/unmute |
| `src/app/v1/chats/pin/route.ts` | CREATE | Pin/unpin |
| `src/app/v1/chats/delete/route.ts` | CREATE | Delete chat |
| `src/app/v1/chats/typing/route.ts` | CREATE | Typing indicator |
| `src/app/v1/chats/[chatId]/messages/route.ts` | CREATE | Delete all messages |
| `src/lib/openwa.ts` | MODIFY | Add: listChats, archiveChat, unarchiveChat, muteChat, unmuteChat, pinChat, unpinChat, deleteChat, sendTyping, deleteChatMessages |

## Error Handling

Same pattern as messages operations. Additional:
- `409` — session not connected (wait for `ready` status)
- `503` — WhatsApp did not answer within budget

## Testing

Co-located `.test.ts` files for each service:
- Mock OpenWA client
- Test validation (chatId format, state values, duration ranges)
- Test device selection
- Test archive/pin/mute idempotency

## Dashboard UI

New "Chats" tab in dashboard:
- Chat list with kind badges (individual/group/channel)
- Archive/Mute/Pin/Typing action buttons per chat
- Delete confirmation modal
- Filter by kind
- Search by name/number
