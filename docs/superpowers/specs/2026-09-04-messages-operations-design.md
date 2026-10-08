# Messages Operations — Design Spec

**Date:** 2026-09-04
**Status:** Draft
**Depends on:** OpenWA v0.23.3 (already deployed)

## Overview

Add message manipulation capabilities to PintaSend's public v1 API and dashboard. These map directly to OpenWA v0.23 REST endpoints.

## New API Endpoints

All endpoints follow the existing v1 pattern: thin route → service layer → OpenWA call.

### 1. Edit Message

```
POST /v1/messages/edit
```

**Request body:**
```json
{
  "chatId": "6281234567890@c.us",
  "messageId": "true_6281234567890@c.us_3EB0ABCD",
  "text": "Corrected text",
  "mentions": ["62811@c.us"],
  "deviceId": "optional-device-id"
}
```

**Constraints:**
- `text` max 4096 chars
- Only messages sent by this account can be edited
- `mentions` optional — re-applied on edit (not preserved from original)

**Response:** `{ ok: true, messageId, edited: true }`

**Service file:** `src/lib/editMessage.ts`

### 2. Delete Message

```
POST /v1/messages/delete
```

**Request body:**
```json
{
  "chatId": "6281234567890@c.us",
  "messageId": "true_6281234567890@c.us_3EB0ABCD",
  "forEveryone": true,
  "deviceId": "optional"
}
```

**Constraints:**
- `forEveryone` defaults to `true` (revoke for all). `false` = delete for self only.

**Response:** `{ ok: true, deleted: true }`

**Service file:** `src/lib/deleteMessage.ts`

### 3. Forward Message

```
POST /v1/messages/forward
```

**Request body:**
```json
{
  "fromChatId": "628111111111@c.us",
  "toChatId": "628222222222@c.us",
  "messageId": "true_628111111111@c.us_3EB0XYZ",
  "deviceId": "optional"
}
```

**Response:** `{ ok: true, messageId, forwarded: true }`

**Service file:** `src/lib/forwardMessage.ts`

### 4. Reply to Message

```
POST /v1/messages/reply
```

**Request body:**
```json
{
  "chatId": "6281234567890@c.us",
  "quotedMessageId": "true_6281234567890@c.us_3EB0ABCD",
  "text": "Reply text",
  "mentions": [],
  "mediaType": "optional",
  "mediaUrl": "optional",
  "deviceId": "optional"
}
```

**Constraints:**
- Supports text or media reply (same media fields as send)
- `quotedMessageId` required

**Response:** `{ ok: true, messageId }`

**Service file:** `src/lib/replyMessage.ts`

### 5. Pin / Unpin Message

```
POST /v1/messages/pin
POST /v1/messages/unpin
```

**Pin request body:**
```json
{
  "chatId": "6281234567890@c.us",
  "messageId": "true_6281234567890@c.us_3EB0ABCD",
  "durationSeconds": 604800,
  "deviceId": "optional"
}
```

**Constraints:**
- `durationSeconds`: 86400 (24h), 604800 (7d), or 2592000 (30d). Default 86400.
- Unpin only needs `chatId` + `messageId`

**Response:** `{ ok: true, pinned/unpinned: true }`

**Service file:** `src/lib/pinMessage.ts`

### 6. Star / Unstar Message

```
POST /v1/messages/star
```

**Request body:**
```json
{
  "chatId": "6281234567890@c.us",
  "messageId": "true_6281234567890@c.us_3EB0ABCD",
  "star": true,
  "deviceId": "optional"
}
```

**Response:** `{ ok: true, starred: true }`

**Service file:** `src/lib/starMessage.ts`

### 7. Get Message Reactions

```
GET /v1/messages/:chatId/:messageId/reactions?deviceId=optional
```

**Response:**
```json
{
  "ok": true,
  "reactions": {
    "👍": ["628111111111@c.us"],
    "❤️": ["628222222222@c.us", "628333333333@c.us"]
  }
}
```

**Service file:** `src/lib/getReactions.ts`

### 8. Download Message Media

```
GET /v1/messages/:chatId/:messageId/media?deviceId=optional
```

**Response:** Binary file download with appropriate `Content-Type` and `Content-Disposition` headers. Returns 404 if no media stored.

**Service file:** `src/lib/downloadMedia.ts`

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `src/lib/editMessage.ts` | CREATE | Service layer |
| `src/lib/deleteMessage.ts` | CREATE | Service layer |
| `src/lib/forwardMessage.ts` | CREATE | Service layer |
| `src/lib/replyMessage.ts` | CREATE | Service layer |
| `src/lib/pinMessage.ts` | CREATE | Service layer (pin + unpin) |
| `src/lib/starMessage.ts` | CREATE | Service layer |
| `src/lib/getReactions.ts` | CREATE | Service layer |
| `src/lib/downloadMedia.ts` | CREATE | Service layer |
| `src/app/v1/messages/edit/route.ts` | CREATE | Thin route |
| `src/app/v1/messages/delete/route.ts` | CREATE | Thin route |
| `src/app/v1/messages/forward/route.ts` | CREATE | Thin route |
| `src/app/v1/messages/reply/route.ts` | CREATE | Thin route |
| `src/app/v1/messages/pin/route.ts` | CREATE | Thin route |
| `src/app/v1/messages/unpin/route.ts` | CREATE | Thin route |
| `src/app/v1/messages/star/route.ts` | CREATE | Thin route |
| `src/app/v1/messages/[chatId]/[messageId]/reactions/route.ts` | CREATE | Thin route |
| `src/app/v1/messages/[chatId]/[messageId]/media/route.ts` | CREATE | Thin route |
| `src/lib/openwa.ts` | MODIFY | Add: editMessage, deleteMessage, forwardMessage, replyMessage, pinMessage, unpinMessage, starMessage, getReactions, getMedia |

## Error Handling

All endpoints follow the same pattern:
- `400` — validation error (missing fields, invalid values)
- `401` — invalid/revoked API key
- `404` — device or session not found
- `409` — device not ready
- `429` — rate limited (with `Retry-After` header)
- `502` — OpenWA gateway error (generic public message)

## Testing

Each service file gets a co-located `.test.ts`:
- Mock OpenWA client
- Test validation logic (required fields, max lengths, format checks)
- Test rate limiting
- Test device selection (explicit vs auto)
- Test error mapping (OpenwaError → public message)

## Dashboard UI

Add to existing message detail/context menu in dashboard:
- Edit button (for own messages)
- Delete button (with "for everyone" toggle)
- Forward button (select target chat)
- Pin/Star toggle
- Reactions display

**Dashboard file:** `src/app/dashboard/messages/page.tsx` — extend existing components.
