# Phase 13: Quota & Monetization — Context

**Generated:** 2026-04-13
**Status:** Ready for research + planning

---

## Domain

Free tier users see their daily limits enforced in the Worker and displayed in the app UI. Paid subscribers bypass all limits via Stripe. Phase 12 delivered the `/chat` quota (20/day rolling 24h) — this phase adds STT/TTS quotas, the app-side display, the Upgrade button, and the Stripe subscription flow.

---

## Decisions

### Quota display in UI

**Counter:** Persistent badge in the `SidebarShell` header — shows "12 / 20 left today" always visible when guidance has been used. Updated from Worker response headers after every `/chat` call.

**Soft-limit warning:** Dismissible inline banner rendered above the text input when ≤2 requests remain. Appears before the hard limit so the user sees it while guidance still works. Includes "Upgrade" CTA.

**Quota-exceeded state:** When the hard limit is hit, the error response (`quota_exceeded`) replaces the normal guidance response. The input is not disabled — user can still type, but submitting shows the error again. "Upgrade" button is visible in the error state.

**What this means for components:**
- `SidebarShell.tsx` — add quota badge to header area; handle `quota_exceeded` error distinctly from generic errors (note: `contentState` and `errorMessage` signals both live in `SidebarShell.tsx`, not `App.tsx`)
- New `QuotaBanner.tsx` (or inline in `SidebarShell`) — soft-limit warning with Upgrade CTA
- `ai.ts` — parse `X-Quota-Remaining` header from Worker responses, surface to UI

### STT quota measurement

**Decision: count token requests (1 token = 1 session), 10 sessions/day.**

QUOT-02's "5 min/day" becomes "10 STT sessions/day" in implementation — the Worker cannot measure stream duration since it only issues the token, not proxies the WebSocket. Requirements document note: this is the enforced interpretation of QUOT-02.

**KV key design:**
- Key: `quota:stt:${tokenValue}` with `expirationTtl: 86400` on first write only (same pattern as `/chat`)
- Limit: 10 sessions/day
- Error code: `quota_exceeded` with `{ error: 'quota_exceeded', service: 'stt', quota: 10, reset_in_seconds: N }`

**TTS quota (QUOT-03):** 10 TTS responses/day. KV key: `quota:tts:${tokenValue}`, same rolling 24h TTL pattern.
- Error code: `quota_exceeded` with `{ error: 'quota_exceeded', service: 'tts', quota: 10, reset_in_seconds: N }`

### Stripe checkout flow

**Flow:**
1. User clicks "Upgrade" in app
2. App calls Worker `/create-checkout` endpoint with `{ uuid: installationToken }`
3. Worker creates a Stripe Checkout Session with `metadata: { installation_uuid: uuid }` and `mode: 'subscription'`
4. Worker returns `{ url: checkoutUrl }` — app opens URL in system browser via Tauri `open()` / `shell.open()`
5. User completes Checkout (Stripe collects email for receipts — standard Stripe form)
6. Stripe fires `checkout.session.completed` webhook to Worker
7. Webhook handler writes `subscription:${uuid} = 'active'` in KV
8. App shows a "Payment complete? Refresh status" button that calls `/refresh-subscription`

**User identity:** `installation_token` UUID from `preferences.rs` (PAY-04 — already persisted locally, already sent with every Worker request via `x-app-token`).

**No deep link for Phase 13:** The `success_url` in Stripe Checkout points to a static "Payment complete — return to app" page. User manually clicks back. Deep link (ai-buddy:// scheme) deferred to v4.0.

### Worker subscription architecture

**KV key:** `subscription:${installationUuid}` — values: `'active'` | `'cancelled'` | absent (free tier)

**Quota enforcement change:** Before enforcing quota, Worker reads `subscription:${uuid}` from KV. If value is `'active'`, skip quota check entirely and pass through.

**New Worker endpoints:**

`POST /create-checkout`:
- Auth middleware applies (requires valid x-app-token)
- Extracts `installationUuid` from parsed token (the UUID part before the `.`)
- Calls Stripe API to create Checkout Session
- Returns `{ url: string }`

`POST /stripe-webhook`:
- No auth middleware (Stripe signs with webhook secret, not app token)
- Validates `Stripe-Signature` header with `STRIPE_WEBHOOK_SECRET`
- On `checkout.session.completed`: writes `subscription:${uuid} = 'active'` in KV
- On `customer.subscription.deleted`: writes `subscription:${uuid} = 'cancelled'`
- Returns 200 immediately

`POST /refresh-subscription`:
- Auth middleware applies
- Calls Stripe API to list subscriptions for the UUID (via metadata search or stored customer ID)
- Updates KV with current status
- Returns `{ status: 'active' | 'free' }`

**New Wrangler secrets needed:**
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`

---

## Scope Boundary

**In Phase 13 (Worker side):**
- STT quota (10 sessions/day) in `/stt` route
- TTS quota (10 responses/day) in `/tts` route
- Subscription bypass: check `subscription:${uuid}` before all quota enforcement
- `/create-checkout` endpoint
- `/stripe-webhook` endpoint (no app token auth — Stripe signature instead)
- `/refresh-subscription` endpoint
- `/quota` endpoint — returns current counts for all three categories (chat/stt/tts) for the UI counter

**In Phase 13 (App side):**
- `ai.ts` — parse quota headers from Worker responses, emit quota state to UI
- `SidebarShell.tsx` — quota badge in header, handle `quota_exceeded` distinctly, show Upgrade CTA in error state
- `QuotaBanner.tsx` — soft-limit warning component (≤2 remaining)
- Upgrade flow: call `/create-checkout`, open URL in system browser
- Post-payment: `/refresh-subscription` call, update paid state in UI

**Deferred:**
- Deep link (ai-buddy:// scheme) after payment — v4.0
- Per-seat or team pricing — post-beta
- In-app Stripe Elements — post-beta

---

## Canonical Refs

- `worker/src/index.ts` — existing Worker (rate limiting, checkQuota for /chat, HMAC auth pattern)
- `worker/wrangler.toml` — KV namespace binding to reuse
- `src-tauri/src/preferences.rs` — installation_token UUID (user identity for PAY-04)
- `src/lib/ai.ts` — existing error handling, onError callback pattern
- `src/components/SidebarShell.tsx` — header to add quota badge
- `src/App.tsx` — content state machine, error handling
- `.planning/REQUIREMENTS.md` — QUOT-01 through QUOT-08, PAY-01 through PAY-05
- `.planning/phases/12-worker-deploy/12-CONTEXT.md` — quota window decisions (rolling 24h, KV key patterns)
- `.planning/phases/12-worker-deploy/12-01-SUMMARY.md` — checkQuota() implementation pattern to replicate

---

## Deferred Ideas

None captured during this discussion.
