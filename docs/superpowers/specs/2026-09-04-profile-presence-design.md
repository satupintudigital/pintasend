# Profile, Presence & Channels — Design Spec

**Date:** 2026-09-04
**Status:** Draft
**Depends on:** OpenWA v0.23.3 (already deployed)

## Overview

Expose profile management, presence control, and channel support through Wavio's API and dashboard. These are lower-priority features that round out the platform's capabilities.

## Part A: Profile Management

### 1. Get Profile Info

```
GET /v1/devices/:deviceId/profile
```

**Response:**
```json
{
  "ok": true,
  "deviceId": "dev_01j7...",
  "profile": {
    "name": "My Business",
    "about": "Open for orders",
    "phone": "6281234567890",
    "hasPicture": true,
    "pictureUrl": "/v1/devices/dev_01j7.../profile/picture"
  }
}
```

**Service file:** `src/lib/profile.ts` (getProfile)

### 2. Update Display Name

```
PATCH /v1/devices/:deviceId/profile
```

**Request body:**
```json
{
  "name": "New Business Name"
}
```

**Constraints:**
- `name`: max 25 characters

**Response:** `{ ok: true, profile: { name: "..." } }`

**Service file:** `src/lib/profile.ts` (updateProfile)

### 3. Update About Text

```
PATCH /v1/devices/:deviceId/profile
```

**Request body:**
```json
{
  "about": "Open 24/7 for customer support"
}
```

**Constraints:**
- `about`: max 139 characters

### 4. Get Profile Picture

```
GET /v1/devices/:deviceId/profile/picture
```

**Response:** Binary image with `Content-Type: image/jpeg` (or 404 if no picture)

**Service file:** `src/lib/profile.ts` (getProfilePicture)

### 5. Set Profile Picture

```
POST /v1/devices/:deviceId/profile/picture
```

**Request:** `multipart/form-data` with `file` field (JPEG/PNG, max 5MB)

**Response:** `{ ok: true, updated: true }`

**Service file:** `src/lib/profile.ts` (setProfilePicture)

### 6. Delete Profile Picture

```
DELETE /v1/devices/:deviceId/profile/picture
```

**Response:** `{ ok: true, deleted: true }`

**Service file:** `src/lib/profile.ts` (deleteProfilePicture)

## Part B: Presence

### 7. Set Own Presence

```
PUT /v1/devices/:deviceId/presence
```

**Request body:**
```json
{
  "available": false
}
```

**Constraints:**
- `available`: boolean — `true` = online, `false` = offline
- Setting does not survive reconnect (must re-issue)

**Response:** `{ ok: true }`

**Service file:** `src/lib/presence.ts` (setOwnPresence)

### 8. Subscribe to Chat Presence

```
POST /v1/devices/:deviceId/presence/subscribe
```

**Request body:**
```json
{
  "chatId": "6281234567890@c.us"
}
```

**Note:** Baileys only. whatsapp-web.js returns 501.

**Response:** `{ ok: true }`

**Service file:** `src/lib/presence.ts` (subscribePresence)

### 9. Get Chat Presence

```
GET /v1/devices/:deviceId/presence/:chatId
```

**Response:**
```json
{
  "ok": true,
  "presence": {
    "chatId": "6281234567890@c.us",
    "participants": [
      { "id": "6281234567890@c.us", "state": "composing", "lastSeen": 1786000000 }
    ],
    "observedAt": "2026-08-03T12:00:00.000Z"
  }
}
```

**Note:** Returns `200` with `null` presence body if nothing reported yet.

**Service file:** `src/lib/presence.ts` (getPresence)

## Part C: Channels

### 10. List Channels

```
GET /v1/devices/:deviceId/channels
```

**Response:**
```json
{
  "ok": true,
  "channels": [
    {
      "id": "120363...@newsletter",
      "name": "My Channel",
      "description": "Updates and news",
      "subscriberCount": 150
    }
  ]
}
```

**Service file:** `src/lib/channels.ts` (listChannels)

### 11. Create Channel

```
POST /v1/devices/:deviceId/channels
```

**Request body:**
```json
{
  "name": "New Channel",
  "description": "Channel description"
}
```

**Response:** `{ ok: true, channel: { id, name } }`

**Service file:** `src/lib/channels.ts` (createChannel)

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `src/lib/profile.ts` | CREATE | Service layer (get, update, picture CRUD) |
| `src/lib/presence.ts` | CREATE | Service layer (set own, subscribe, get) |
| `src/lib/channels.ts` | CREATE | Service layer (list, create) |
| `src/app/v1/devices/[deviceId]/profile/route.ts` | CREATE | GET + PATCH profile |
| `src/app/v1/devices/[deviceId]/profile/picture/route.ts` | CREATE | GET + POST + DELETE picture |
| `src/app/v1/devices/[deviceId]/presence/route.ts` | CREATE | PUT own presence |
| `src/app/v1/devices/[deviceId]/presence/subscribe/route.ts` | CREATE | POST subscribe |
| `src/app/v1/devices/[deviceId]/presence/[chatId]/route.ts` | CREATE | GET chat presence |
| `src/app/v1/devices/[deviceId]/channels/route.ts` | CREATE | GET + POST channels |
| `src/lib/openwa.ts` | MODIFY | Add: getProfile, patchProfile, getProfilePicture, setProfilePicture, deleteProfilePicture, setOwnPresence, subscribePresence, getPresence, listChannels, createChannel |

## Testing

- `src/lib/profile.test.ts` — name/about length validation, picture size limits
- `src/lib/presence.test.ts` — engine compatibility check (Baileys vs wwebjs)
- `src/lib/channels.test.ts` — basic CRUD
- Route-level tests for all endpoints

## Dashboard UI

### Profile Settings
- Display name edit
- About text edit
- Profile picture upload/remove
- Current phone number display

### Presence Controls
- Online/offline toggle per device
- Presence status display (typing indicators in chat view)

### Channels
- Channel list view
- Create channel form
- Channel detail with subscriber count

## Error Handling

- `400` — validation (name length, picture size)
- `401` — invalid API key
- `404` — device not found
- `501` — presence subscribe on whatsapp-web.js engine
- `502` — OpenWA gateway error
