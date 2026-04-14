---
phase: 13-quota-monetization
plan: "02"
subsystem: ui, payments
tags: [solidjs, stripe, tauri, opener, quota, monetization]

requires:
  - phase: 13-01
    provides: Worker quota enforcement, /create-checkout, /refresh-subscription, /stripe-webhook endpoints

provides:
  - X-Quota-Remaining header parsed from /chat responses and displayed as badge in SidebarShell header
  - QuotaBanner soft-limit warning component (amber, dismissible, shown when ≤2 requests remain)
  - Distinct quota_exceeded UI with Upgrade + Refresh Status CTAs (separate from generic error state)
  - handleUpgrade() opens Stripe Checkout URL in system browser via tauri-plugin-opener
  - handleRefreshSubscription() clears quota_exceeded state after Stripe confirms active subscription
  - tauri_plugin_opener::init() in lib.rs builder chain
  - opener:allow-open-url scoped to https:// in capabilities/default.json

affects: [future phases using opener plugin, any phase touching SidebarShell error states]

tech-stack:
  added: ["@tauri-apps/plugin-opener (JS import)"]
  patterns:
    - "onQuotaUpdate callback on streamGuidance() — header parsed before SSE body read"
    - "isQuotaExceeded() derived signal — errorMessage() sentinel value 'quota_exceeded'"
    - "showQuotaBanner excludes isQuotaExceeded() to prevent contradictory soft+hard limit UI"

key-files:
  created:
    - src/components/QuotaBanner.tsx
  modified:
    - src/lib/ai.ts
    - src/components/SidebarShell.tsx
    - src-tauri/src/lib.rs
    - src-tauri/capabilities/default.json
    - worker/src/index.ts

key-decisions:
  - "Tauri v2 opener:allow-open-url requires explicit URL scope — bare permission string blocks all URLs"
  - "X-Quota-Remaining requires Access-Control-Expose-Headers in Worker CORS config — custom headers are filtered without it"
  - "showQuotaBanner must gate on !isQuotaExceeded() — stale remaining=1 from prior response would show contradictory soft+hard limit simultaneously"
  - "quota_exceeded detected as sentinel string in errorMessage() signal (not a separate signal) — keeps error state machine consistent"

patterns-established:
  - "Sentinel error strings: onError('quota_exceeded') is a typed sentinel; SidebarShell branches on errorMessage() value"
  - "CORS expose headers: any custom response headers read by frontend must be in exposeHeaders in Hono cors() config"
  - "Tauri opener scope: opener:allow-open-url must use object form with allow:[{url:'https://**'}] not bare string"

requirements-completed: [QUOT-05, QUOT-08, PAY-02, PAY-05]

duration: 90min
completed: 2026-04-13
---

# Phase 13 Plan 02: App-Side Quota & Upgrade Flow Summary

**Quota badge, soft-limit banner, hard-limit upgrade screen, and Stripe Checkout browser launch via tauri-plugin-opener**

## Performance

- **Duration:** ~90 min
- **Completed:** 2026-04-13
- **Tasks:** 3 + human checkpoint
- **Files modified:** 6

## Accomplishments

- `ai.ts` parses `X-Quota-Remaining`/`X-Quota-Limit` headers from `/chat` responses and fires `onQuotaUpdate` callback; 429 with `quota_exceeded` body emits sentinel string instead of generic error
- `SidebarShell.tsx` shows live quota badge ("15 / 20 left") in header, dismissible amber `QuotaBanner` at ≤2 requests, and distinct quota_exceeded screen with Upgrade + Refresh Status buttons
- `handleUpgrade()` calls `/create-checkout` then opens Stripe URL in system browser; `handleRefreshSubscription()` calls `/refresh-subscription` and clears the error state when subscription confirmed active
- Opener plugin initialized in `lib.rs` and scoped to `https://` in capabilities

## Task Commits

1. **Task 1: ai.ts quota callback + sentinel** — `334a5ad` (feat)
2. **Task 2: QuotaBanner + SidebarShell wiring** — `334a5ad` (feat)
3. **Task 3: opener plugin lib.rs + capabilities** — `334a5ad` (feat)
4. **Fix: CORS expose headers** — `174c6a4` (fix)
5. **Fix: banner consistency when quota exceeded** — `ce3255e` (fix)
6. **Fix: opener URL scope** — `41ed49c` (fix)

## Files Created/Modified

- `src/components/QuotaBanner.tsx` — New dismissible soft-limit warning component
- `src/lib/ai.ts` — `onQuotaUpdate` callback, `X-Quota-Remaining` header parsing, `quota_exceeded` sentinel
- `src/components/SidebarShell.tsx` — quota signals, badge, banner, upgrade/refresh handlers, distinct error state
- `src-tauri/src/lib.rs` — `tauri_plugin_opener::init()` in builder chain
- `src-tauri/capabilities/default.json` — `opener:allow-open-url` scoped to `https://**`
- `worker/src/index.ts` — `exposeHeaders` added to Hono CORS config

## Decisions Made

- Used `errorMessage() === 'quota_exceeded'` sentinel pattern rather than a separate signal — keeps the error state machine to one source of truth
- `showQuotaBanner` gates on `!isQuotaExceeded()` to prevent contradictory soft+hard limit display when remaining=1 stale value persists from prior response

## Deviations from Plan

### Auto-fixed Issues

**1. CORS missing exposeHeaders**
- **Found during:** Checkpoint (quota badge not appearing)
- **Issue:** `X-Quota-Remaining` was sent by Worker but `fetch()` in WebView returned `null` — custom headers are filtered by CORS spec without `Access-Control-Expose-Headers`
- **Fix:** Added `exposeHeaders: ['X-Quota-Remaining', 'X-Quota-Limit']` to Hono `cors()` config
- **Committed in:** `174c6a4`

**2. Soft-limit banner shown simultaneously with hard-limit screen**
- **Found during:** Checkpoint step 3 (quota_exceeded test)
- **Issue:** `quotaRemaining()` held stale value of 1 from last successful response; banner showed "1 AI request left today" while hard-limit screen showed "used all requests"
- **Fix:** Added `!isQuotaExceeded()` guard to `showQuotaBanner` derived signal
- **Committed in:** `ce3255e`

**3. Tauri opener URL scope missing**
- **Found during:** Checkpoint step 4 (Upgrade button click)
- **Issue:** Bare `"opener:allow-open-url"` string in capabilities blocks all URLs; Tauri v2 requires explicit `allow:[{url:'https://**'}]` scope object
- **Fix:** Changed permission entry to scoped object form
- **Committed in:** `41ed49c`

---

**Total deviations:** 3 auto-fixed
**Impact on plan:** All fixes required for correctness. No scope creep.

## Issues Encountered

- `VITE_WORKER_URL` not set — frontend fell back to `http://localhost:8787`. Fixed by creating `.env` from `.env.example` with production URL.

## Next Phase Readiness

- Phase 13 fully complete — quota enforcement (Worker) + quota display + upgrade flow (App) all verified
- Stripe webhook writes `subscription:UUID = active` on payment; `/refresh-subscription` reads live Stripe status
- Ready for Phase 13 verification (`/gsd-verify-work`)

---
*Phase: 13-quota-monetization*
*Completed: 2026-04-13*
