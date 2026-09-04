# OpenWA v0.23 Features — Implementation Plan

**Date:** 2026-09-04
**Specs:** 5 design spec files in `docs/superpowers/specs/`
**OpenWA:** v0.23.3 (deployed)

## Execution Order

Features are grouped into 3 phases. Within each phase, dependencies are respected.

---

## Phase 2A — High Value (do first)

### Sprint 1: Foundation (openwa.ts + schema)

| # | Task | Depends | Est |
|---|------|---------|-----|
| 1.1 | Add all new OpenWA client methods to `src/lib/openwa.ts` | — | S |
| 1.2 | Add Label + LabelContact models to `prisma/schema.prisma` | — | S |
| 1.3 | Generate Prisma client + create migration | 1.2 | S |

**Methods to add to `openwa.ts`:**

```
// Messages operations
editMessage(sessionId, chatId, messageId, body)
deleteMessage(sessionId, chatId, messageId, forEveryone)
forwardMessage(sessionId, fromChatId, toChatId, messageId)
replyMessage(sessionId, chatId, quotedMessageId, body)
pinMessage(sessionId, chatId, messageId, durationSeconds)
unpinMessage(sessionId, chatId, messageId)
starMessage(sessionId, chatId, messageId, star)
getReactions(sessionId, chatId, messageId)
getMedia(sessionId, chatId, messageId)

// Chats management
listChats(sessionId, options?)
archiveChat(sessionId, chatId, archive)
muteChat(sessionId, chatId, muteUntil?)
pinChat(sessionId, chatId, pin)
deleteChat(sessionId, chatId)
sendTyping(sessionId, chatId, state)
deleteChatMessages(sessionId, chatId)

// Labels
listLabels(sessionId)
createLabel(sessionId, name, color?)
updateLabel(sessionId, labelId, body)
deleteLabel(sessionId, labelId)
addChatToLabel(sessionId, labelId, chatId)
removeChatFromLabel(sessionId, labelId, chatId)
listChatsByLabel(sessionId, labelId)

// Session config
getSessionConfig(sessionId)
patchSessionConfig(sessionId, config)
requestPairingCode(sessionId, phoneNumber)

// Profile
getProfile(sessionId)
patchProfile(sessionId, body)
getProfilePicture(sessionId)
setProfilePicture(sessionId, imageBase64, mimetype)
deleteProfilePicture(sessionId)

// Presence
setOwnPresence(sessionId, available)
subscribePresence(sessionId, chatId)
getPresence(sessionId, chatId)

// Channels
listChannels(sessionId)
createChannel(sessionId, body)
```

### Sprint 2: Message Operations

| # | Task | Depends | Est |
|---|------|---------|-----|
| 2.1 | `src/lib/editMessage.ts` + test | 1.1 | S |
| 2.2 | `src/app/v1/messages/edit/route.ts` + test | 2.1 | S |
| 2.3 | `src/lib/deleteMessage.ts` + test | 1.1 | S |
| 2.4 | `src/app/v1/messages/delete/route.ts` + test | 2.3 | S |
| 2.5 | `src/lib/forwardMessage.ts` + test | 1.1 | S |
| 2.6 | `src/app/v1/messages/forward/route.ts` + test | 2.5 | S |
| 2.7 | `src/lib/replyMessage.ts` + test | 1.1 | S |
| 2.8 | `src/app/v1/messages/reply/route.ts` + test | 2.7 | S |
| 2.9 | `src/lib/pinMessage.ts` + test (pin + unpin) | 1.1 | S |
| 2.10 | `src/app/v1/messages/pin/route.ts` + test | 2.9 | S |
| 2.11 | `src/app/v1/messages/unpin/route.ts` + test | 2.9 | S |
| 2.12 | `src/lib/starMessage.ts` + test | 1.1 | S |
| 2.13 | `src/app/v1/messages/star/route.ts` + test | 2.12 | S |
| 2.14 | `src/lib/getReactions.ts` + test | 1.1 | S |
| 2.15 | `src/app/v1/messages/[chatId]/[messageId]/reactions/route.ts` | 2.14 | S |
| 2.16 | `src/lib/downloadMedia.ts` + test | 1.1 | S |
| 2.17 | `src/app/v1/messages/[chatId]/[messageId]/media/route.ts` | 2.16 | S |

### Sprint 3: Chats Management

| # | Task | Depends | Est |
|---|------|---------|-----|
| 3.1 | `src/lib/listChats.ts` + test | 1.1 | S |
| 3.2 | `src/app/v1/chats/route.ts` (GET) + test | 3.1 | S |
| 3.3 | `src/lib/archiveChat.ts` + test | 1.1 | S |
| 3.4 | `src/app/v1/chats/archive/route.ts` + test | 3.3 | S |
| 3.5 | `src/lib/muteChat.ts` + test | 1.1 | S |
| 3.6 | `src/app/v1/chats/mute/route.ts` + test | 3.5 | S |
| 3.7 | `src/lib/pinChat.ts` + test | 1.1 | S |
| 3.8 | `src/app/v1/chats/pin/route.ts` + test | 3.7 | S |
| 3.9 | `src/lib/deleteChat.ts` + test | 1.1 | S |
| 3.10 | `src/app/v1/chats/delete/route.ts` + test | 3.9 | S |
| 3.11 | `src/lib/sendTyping.ts` + test | 1.1 | S |
| 3.12 | `src/app/v1/chats/typing/route.ts` + test | 3.11 | S |
| 3.13 | `src/lib/clearChatMessages.ts` + test | 1.1 | S |
| 3.14 | `src/app/v1/chats/[chatId]/messages/route.ts` + test | 3.13 | S |

### Sprint 4: Labels

| # | Task | Depends | Est |
|---|------|---------|-----|
| 4.1 | `src/lib/labels.ts` + test (all CRUD) | 1.1, 1.2 | M |
| 4.2 | `src/lib/labelSync.ts` + test | 4.1 | M |
| 4.3 | `src/app/v1/labels/route.ts` (GET + POST) + test | 4.1 | S |
| 4.4 | `src/app/v1/labels/[labelId]/route.ts` (PUT + DELETE) + test | 4.1 | S |
| 4.5 | `src/app/v1/labels/[labelId]/chats/route.ts` (GET + POST) + test | 4.1 | S |
| 4.6 | `src/app/v1/labels/[labelId]/chats/[chatId]/route.ts` + test | 4.1 | S |
| 4.7 | `src/app/v1/labels/[labelId]/chats/bulk/route.ts` + test | 4.1 | S |
| 4.8 | Handle `label.chat.added/removed` in webhook ingest | 4.2 | S |

---

## Phase 2B — Session Config

### Sprint 5: Session Config + Pairing Code

| # | Task | Depends | Est |
|---|------|---------|-----|
| 5.1 | `src/lib/deviceConfig.ts` + test (get + patch) | 1.1 | S |
| 5.2 | `src/app/v1/devices/[deviceId]/config/route.ts` + test | 5.1 | S |
| 5.3 | `src/lib/pairingCode.ts` + test | 1.1 | S |
| 5.4 | `src/app/v1/devices/[deviceId]/pairing-code/route.ts` + test | 5.3 | S |

---

## Phase 3 — Profile, Presence, Channels

### Sprint 6: Profile + Presence

| # | Task | Depends | Est |
|---|------|---------|-----|
| 6.1 | `src/lib/profile.ts` + test (get, update, picture CRUD) | 1.1 | M |
| 6.2 | `src/app/v1/devices/[deviceId]/profile/route.ts` + test | 6.1 | S |
| 6.3 | `src/app/v1/devices/[deviceId]/profile/picture/route.ts` + test | 6.1 | S |
| 6.4 | `src/lib/presence.ts` + test (set, subscribe, get) | 1.1 | S |
| 6.5 | `src/app/v1/devices/[deviceId]/presence/route.ts` + test | 6.4 | S |
| 6.6 | `src/app/v1/devices/[deviceId]/presence/subscribe/route.ts` + test | 6.4 | S |
| 6.7 | `src/app/v1/devices/[deviceId]/presence/[chatId]/route.ts` + test | 6.4 | S |

### Sprint 7: Channels

| # | Task | Depends | Est |
|---|------|---------|-----|
| 7.1 | `src/lib/channels.ts` + test (list, create) | 1.1 | S |
| 7.2 | `src/app/v1/devices/[deviceId]/channels/route.ts` + test | 7.1 | S |

---

## Summary

| Phase | Sprints | Tasks | Est Total |
|-------|---------|-------|-----------|
| 2A | 4 | ~40 | ~25 hours |
| 2B | 1 | 4 | ~3 hours |
| 3 | 2 | ~12 | ~8 hours |
| **Total** | **7** | **~56** | **~36 hours** |

## Conventions (follow existing Wavio patterns)

- **Thin routes:** Auth → delegate to service → return response
- **Service layer:** validate → rate limit → select device → call OpenWA → log
- **Error handling:** `OpenwaError` → `publicOpenwaError()` for generic messages
- **Testing:** Co-located `.test.ts` with vitest, mock OpenWA client
- **Types:** Define interfaces in service file, export for route consumption
