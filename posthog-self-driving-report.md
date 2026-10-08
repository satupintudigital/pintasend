# PostHog Self-driving Setup Report

**Project:** PintaSend  
**Date:** 2026-08-22  
**Inbox:** https://eu.posthog.com/project/242725/inbox

---

## Summary

PostHog Self-driving has been configured for PintaSend. Session Replay, Error Tracking, and Support were enabled; six signal sources were wired to the inbox; the scout troop was tuned to five scouts; and two Replay Vision scanners were created to watch the device connection flow and rage-click sessions. Findings will start appearing in the [Self-driving inbox](https://eu.posthog.com/project/242725/inbox) within approximately 30 minutes.

---

## AI data processing

**Status:** Approved. Organization-level AI data processing consent was granted before this run started.

---

## GitHub

**Status:** Already connected (integration id `76430`, account `synard1`, connected 2026-08-07).

No action required. Self-driving can research findings in your code and open fixes using this connection.

---

## Products enabled

| Product | Action | Notes |
|---|---|---|
| Session Replay | **enabled** | Server-side toggle turned on. `posthog.init` has `session_recording: {...}` — no `disable_session_recording: true` override, so the server flip is effective. |
| Error Tracking | **already enabled** | Was already on. `capture_exceptions: true` in `posthog.init` — no override conflict. |
| Support (Conversations) | **enabled** | Server-side toggle turned on. Tickets only arrive once an inbound channel is connected — **see follow-ups**. |

---

## Signal sources

| source_product | source_type | Action |
|---|---|---|
| `signals_scout` | `cross_source_issue` | **ON by default** — scout findings reach the inbox with no config row needed. |
| `health_checks` | `health_issue` | **enabled** (id `01a026cf-9016-74f4-a40f-e944eda46fdc`) |
| `error_tracking` | `issue_created` | **enabled** (id `01a026cf-a14b-75ab-bdd2-113c421f24ec`) |
| `error_tracking` | `issue_reopened` | **enabled** (id `01a026cf-b186-76a3-a7ba-f2e51302f0fa`) |
| `error_tracking` | `issue_spiking` | **enabled** (id `01a026cf-c344-771e-8a8a-82829f6aad72`) |
| `session_replay` | `session_analysis_cluster` | **enabled** (id `01a026cf-d8ac-71a9-a204-22fa04662c6a`, sample rate 10%) |
| `conversations` | `ticket` | **enabled** (id `01a026cf-ebaf-7e47-8dda-3ff113ba44f5`) — dormant until an inbound channel is connected |
| `llm_analytics` | — | **skipped** — no LLM/AI usage in this project |
| `logs` | — | **skipped** — PostHog logs product not in use |
| `replay_vision` | — | **skipped** — Replay Vision scanners are self-authorizing via `emits_signals`; no config row needed |

---

## Connected tools

The user selected **None of these** for all external tools (GitHub Issues, Linear, Jira, Sentry, Zendesk). No external tool responders were created.

---

## Scout troop

**Run budget:** 100 runs/day (early access default), 3 runs/tick max. 0 runs used today.  
**Banner:** "Scouts are in early access. Each project gets up to 100 scout runs a day. Contact team-self-driving@posthog.com if you need more."

### Enabled (5 scouts)

| Scout | What it watches |
|---|---|
| `signals-scout-general` | Cross-product correlations and surfaces no specialist covers |
| `signals-scout-product-analytics` | Funnels, retention, lifecycle, and stickiness flows for conversion regressions |
| `signals-scout-web-analytics` | Per-channel session volume, attribution, and landing-page health against your traffic baseline |
| `signals-scout-web-vitals` | p75 LCP / INP / CLS / FCP per page against Google thresholds and your own history; correlates regressions with deploys |
| `signals-scout-health-checks` | PostHog instrumentation health issues, weighted by blast radius |

### Disabled (22 scouts)

| Scout | Reason disabled |
|---|---|
| `signals-scout-error-tracking` | **Intentional** — covered by the native error tracking source (step 4). Re-enabling would duplicate findings. |
| `signals-scout-session-replay` | **Intentional** — covered by the native session replay source (step 4). Re-enabling would duplicate findings. |
| `signals-scout-ai-observability` | No AI/LLM events in project. Enable if `$ai_*` events are added. |
| `signals-scout-revenue-analytics` | No payment SDK (Stripe/Paddle/etc.) detected. Enable if revenue data is connected. |
| `signals-scout-surveys` | 0 surveys in project. Enable if PostHog surveys are launched. |
| `signals-scout-feature-flags` | No feature flag usage confirmed. Enable if flags are adopted. |
| `signals-scout-experiments` | No active A/B experiments. Enable when experiments are running. |
| `signals-scout-logs` | PostHog logs product not in use. Enable if logs are configured. |
| `signals-scout-csp-violations` | No CSP reporting configured. Enable if `$csp_violation` events are added. |
| `signals-scout-customer-analytics` | No group/accounts analytics. Enable if B2B group analytics are added. |
| `signals-scout-data-pipelines` | No CDP destinations, batch exports, or hog flows in use. |
| `signals-scout-data-warehouse` | No warehouse sources connected. |
| `signals-scout-conversations` | Conversations product just enabled; no ticket data yet. Enable once support flow is active. |
| `signals-scout-anomaly-detection` | Not in top-5 most-used surfaces; available if desired. |
| `signals-scout-observability-gaps` | Available for future use. |
| `signals-scout-replay-vision` | No prior Replay Vision observations. Enable once scanners accumulate data. |
| `signals-scout-inbox-validation` | Fresh setup — no shipped fixes to validate yet. Enable after first deployment cycle. |
| `signals-scout-insight-alerts` | No alerts configured yet. |
| `signals-scout-apm` | No distributed tracing / OpenTelemetry spans. |
| `signals-scout-mcp-tool-calls` | No `$mcp_tool_call` telemetry. |
| `signals-scout-tasks` | No PostHog Tasks in use. |
| `signals-scout-skills-store` | Skill hygiene scout — enable if skills are actively maintained. |

---

## Custom scouts

No custom scouts were created. Gap analysis result: all 5 event types currently flowing into PostHog (`$web_vitals`, `$pageview`, `$pageleave`, `$autocapture`, `$rageclick`) are already covered by the enabled built-in troop. The product's key domain surfaces — WhatsApp device connection, message delivery, campaign execution, and webhook dispatch — have no PostHog events yet (posthog-node is initialized but no `capture()` calls exist in the codebase).

**Surfaces considered and ruled out:**

| Surface | Filter that ruled it out |
|---|---|
| Device connection funnel (connect wizard → QR → complete) | Not watchable — no events captured via posthog-node for this flow. Add `posthog.capture('device_connected')` etc. and add a custom scout once they exist. |
| Campaign delivery pipeline | Not watchable — no campaign lifecycle events in PostHog. |
| WhatsApp message delivery rate | Not watchable — no message send/delivery events captured. |
| Webhook delivery failures | Not watchable — no webhook delivery events captured. |

**Noise escape hatch:** If a built-in scout turns out noisy, set `emit: false` on its config in PostHog (inbox → scout settings) to switch it to dry-run mode. It will still log its reasoning but write nothing to the inbox.

**Recommended next step:** Add `posthog.capture()` calls via posthog-node to the core domain flows (device connect, message send, campaign run) — then return here to add custom scouts for those surfaces.

---

## Replay Vision scanners

A Replay Vision scanner is an LLM that watches individual session recordings on a schedule and pushes what it finds directly to the Self-driving inbox. This is the only part of this setup that spends Replay Vision credits. Findings arrive at **half weight** — they need corroboration from a second independent observation before being promoted into an inbox report.

| Scanner | Type | Query scope | Sampling | Monthly credits (est.) | Status |
|---|---|---|---|---|---|
| Device connection breakage | monitor | Sessions with `$current_url` containing `/connect` | 50% | 0 (no recordings yet) | **created** |
| PintaSend dashboard rage clicks | monitor | Sessions containing a `$rageclick` event | 100% | 0 (no recordings yet) | **created** |

**Device connection breakage** watches the `/connect` flow — the highest-value completion step in PintaSend, where a broken QR code, a stalled wizard, or a silent form failure would block a user from using the product entirely. It looks for: QR code failing to load, connection wizard not advancing after a scan, error toasts or alerts after a step, the dashboard staying blank after setup, and form submits with no response.

**PintaSend dashboard rage clicks** watches any session where a rage-click was recorded, looking for users repeatedly hammering an unresponsive connect button, retrying API key copy with no feedback, clicking campaign send with no confirmation, or hitting the webhook test button without any visible response.

The project has 0 recordings at setup time. Both scanners are armed and will begin working as soon as sessions start recording.

---

## Follow-ups

- [ ] **Connect a Support inbound channel** — Support (Conversations) is enabled but tickets only arrive once you connect an inbound channel (email, inbox, or Slack). Go to PostHog → Support to connect one.
- [ ] **Add posthog-node server-side event capture** — The core domain flows (device connection, message delivery, campaign execution, webhook dispatch) have no PostHog events. Add `posthog.capture()` calls in the relevant API route handlers (`/api/connect/complete`, `/api/campaigns/[id]/[action]`, `/api/messages`, workers/webhook-delivery) to unlock custom scouts and richer analytics.
- [ ] **Create saved funnel insights** — `signals-scout-product-analytics` watches saved flows (funnels, retention). Create at least one funnel insight in PostHog (e.g. `/login` → `/connect` → `/dashboard`) so the scout has a baseline to monitor.
- [ ] **Enable `signals-scout-feature-flags`** if PostHog feature flags are adopted in the codebase.
- [ ] **Enable `signals-scout-conversations`** once the support channel is connected and tickets begin flowing.
- [ ] **Enable `signals-scout-replay-vision`** after the Replay Vision scanners accumulate enough observations to trend.

---

## What happens next

The scout coordinator picks up the freshly-enabled configs within ~30 minutes and begins its first runs. Each run draws from the project's budget (100 runs/day during early access). Findings cluster into reports in your [inbox](https://eu.posthog.com/project/242725/inbox); immediately-actionable ones can trigger coding tasks. The two Replay Vision scanners will begin scanning sessions as soon as recordings arrive — no further setup needed.
