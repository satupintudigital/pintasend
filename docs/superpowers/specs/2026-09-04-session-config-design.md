# Session Configuration — Design Spec

**Date:** 2026-09-04
**Status:** Draft
**Depends on:** OpenWA v0.23.3 (already deployed)

## Overview

Expose OpenWA's per-session tunable configuration to PintaSend's API and dashboard. Enables tenants to configure call rejection, reconnect behavior, proxy settings, and alternative pairing methods without direct OpenWA access.

## API Endpoints

### 1. Get Session Config

```
GET /v1/devices/:deviceId/config
```

**Response:**
```json
{
  "ok": true,
  "deviceId": "dev_01j7...",
  "config": {
    "autoRejectCalls": false,
    "maxReconnectAttempts": null,
    "reconnectBaseDelay": 5000
  }
}
```

**Service file:** `src/lib/deviceConfig.ts` (getConfig)

### 2. Update Session Config

```
PATCH /v1/devices/:deviceId/config
```

**Request body (partial update):**
```json
{
  "autoRejectCalls": true,
  "maxReconnectAttempts": 5
}
```

**Constraints:**
- `autoRejectCalls`: boolean
- `maxReconnectAttempts`: integer 0–20, or `null` for unlimited
- `reconnectBaseDelay`: integer 1000–300000 (ms)

**Response:** `{ ok: true, config: { ... } }`

**Flow:**
1. Validate device ownership
2. PATCH to OpenWA `PATCH /api/sessions/:id/config`
3. Return updated config

**Service file:** `src/lib/deviceConfig.ts` (updateConfig)

### 3. Request Pairing Code

```
POST /v1/devices/:deviceId/pairing-code
```

**Request body:**
```json
{
  "phoneNumber": "628123456789"
}
```

**Constraints:**
- `phoneNumber`: 6–15 digits, no +/spaces/dashes
- Session must be in `qr_ready` status (not already authenticated)

**Response:**
```json
{
  "ok": true,
  "pairingCode": "ABCD1234",
  "status": "qr_ready"
}
```

**Flow:**
1. Validate device ownership + status
2. `POST /api/sessions/:id/pairing-code` on OpenWA
3. Return pairing code

**Service file:** `src/lib/pairingCode.ts`

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `src/lib/deviceConfig.ts` | CREATE | Service layer (get + update config) |
| `src/lib/pairingCode.ts` | CREATE | Service layer (request pairing code) |
| `src/app/v1/devices/[deviceId]/config/route.ts` | CREATE | GET + PATCH config |
| `src/app/v1/devices/[deviceId]/pairing-code/route.ts` | CREATE | POST pairing code |
| `src/lib/openwa.ts` | MODIFY | Add: getConfig, patchConfig, requestPairingCode |

## Testing

- `src/lib/deviceConfig.test.ts` — validate ranges, device ownership
- `src/lib/pairingCode.test.ts` — validate phone format, status check
- Route-level tests for both endpoints

## Dashboard UI

Add to device settings page:
- Auto-reject calls toggle
- Reconnect settings (max attempts slider, base delay input)
- "Link by Phone Number" button → shows pairing code input + result

## Error Handling

- `400` — invalid config values, phone format
- `404` — device not found
- `409` — device not in `qr_ready` status (for pairing code)
- `502` — OpenWA gateway error
