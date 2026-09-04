# Dual-Engine Implementation Plan

**Date:** 2026-09-04
**Spec:** `2026-09-04-dual-engine-design.md`

## Overview

Add support for running two OpenWA engines simultaneously (Baileys + whatsapp-web.js), allowing tenants to choose the engine per device.

---

## Sprint 1: Foundation (Engine Router + Config)

| # | Task | Est |
|---|------|-----|
| 1.1 | Add `engine` field to Device model (Prisma + migration) | S |
| 1.2 | Create `src/lib/engineRouter.ts` (route to correct instance) | M |
| 1.3 | Update `src/lib/config.ts` (add engine endpoint configs) | S |
| 1.4 | Update `src/lib/openwa.ts` (engine-aware client creation) | M |
| 1.5 | Add environment variables to `.env.example` | S |
| 1.6 | Write tests for engine router | S |

**Dependencies:** None
**Estimated:** ~4 hours

---

## Sprint 2: Device Management (Create + Switch Engine)

| # | Task | Est |
|---|------|-----|
| 2.1 | Update device creation to accept engine parameter | S |
| 2.2 | Add engine selector to device creation UI | S |
| 2.3 | Add engine badge to device cards | S |
| 2.4 | Add "Switch Engine" action (requires QR re-scan) | M |
| 2.5 | Update internal API routes for engine selection | S |
| 2.6 | Write tests for device engine management | S |

**Dependencies:** Sprint 1
**Estimated:** ~5 hours

---

## Sprint 3: Feature Support (Labels, Channels, Profile)

| # | Task | Est |
|---|------|-----|
| 3.1 | Update labels routes to use engine-aware client | S |
| 3.2 | Update channels routes to use engine-aware client | S |
| 3.3 | Update profile routes to use engine-aware client | S |
| 3.4 | Add feature availability indicators in dashboard | S |
| 3.5 | Update error messages for engine limitations | S |
| 3.6 | Write tests for feature support checks | S |

**Dependencies:** Sprint 2
**Estimated:** ~4 hours

---

## Sprint 4: Docker + Deployment

| # | Task | Est |
|---|------|-----|
| 4.1 | Create `docker-compose.webjs.yml` for second instance | M |
| 4.2 | Update production docker-compose with both instances | M |
| 4.3 | Deploy second OpenWA instance to server | S |
| 4.4 | Update Wavio environment variables | S |
| 4.5 | Test both instances running simultaneously | S |
| 4.6 | Monitor memory usage and optimize | M |

**Dependencies:** Sprint 3
**Estimated:** ~6 hours

---

## Sprint 5: Migration + Documentation

| # | Task | Est |
|---|------|-----|
| 5.1 | Database migration for existing devices | S |
| 5.2 | User migration guide (how to switch engines) | S |
| 5.3 | Update API documentation | S |
| 5.4 | Update dashboard help text | S |
| 5.5 | Load testing with multiple sessions | M |
| 5.6 | Final integration testing | M |

**Dependencies:** Sprint 4
**Estimated:** ~5 hours

---

## Summary

| Sprint | Focus | Tasks | Estimate |
|--------|-------|-------|----------|
| 1 | Foundation | 6 | ~4h |
| 2 | Device Management | 6 | ~5h |
| 3 | Feature Support | 6 | ~4h |
| 4 | Docker + Deployment | 6 | ~6h |
| 5 | Migration + Docs | 6 | ~5h |
| **Total** | | **30** | **~24h** |

---

## Server Requirements

### Current Server (94.237.68.57)

| Resource | Current | Required |
|----------|---------|----------|
| CPU | 2 vCPU | 4 vCPU (recommended) |
| RAM | 4 GB | 8 GB (for both engines) |
| Storage | 20 GB | 50 GB |

### Docker Resources

| Container | Memory Limit | PID Limit |
|-----------|-------------|-----------|
| openwa-baileys | 2 GB | 2048 |
| openwa-webjs | 4 GB | 4096 |
| **Total** | **6 GB** | **6144** |

---

## Rollback Plan

If issues arise:

1. **Stop webjs instance:** `docker stop openwa-webjs`
2. **Revert Wavio config:** Remove webjs endpoint vars
3. **Redeploy:** `npm run deploy`
4. **All devices stay on Baileys** (no data loss)

---

## Success Criteria

- [ ] Both engines running on server
- [ ] Devices can be created with either engine
- [ ] Features work correctly per engine
- [ ] Memory usage within limits
- [ ] No disruption to existing sessions
- [ ] Clear user-facing messages
- [ ] Documentation updated
