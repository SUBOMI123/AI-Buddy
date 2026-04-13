# Phase 12: Worker Deploy — Context

**Generated:** 2026-04-13  
**Status:** Ready for research + planning

---

## Domain

Get the Cloudflare Worker live in production: KV namespace provisioned, all API proxy routes reachable, and per-user rate limiting + quota enforced as distinct layers.

The worker code is already complete (`/worker/src/index.ts`). What this phase adds: KV namespace ID, a quota enforcement layer for `/chat`, wiring the production URL into the app build config.

---

## Decisions

### Quota scope — `/chat` only

Phase 12 adds quota tracking for `/chat` only (20 guidance queries/user/day). `/stt` and `/tts` quotas are left to Phase 13, which handles the full QUOT-01–QUOT-08 implementation alongside the app-side display and Stripe integration.

**What this means for the Worker:**
- Add a `checkQuota()` function alongside the existing `checkRateLimit()` function
- Quota check applied only in the `/chat` route handler (not global middleware)
- Returns `{ error: 'quota_exceeded', quota: 20, reset_in_seconds: N }` when limit hit
- Rate limit (60/min abuse protection) stays in global middleware — returns `{ error: 'rate_limited', retry_after: 60 }`
- INFRA-05 distinction satisfied: two layers, two distinct error codes

### Quota window — rolling 24h

Quota resets on a rolling 24h window (not calendar day midnight). KV key expires 24h after the first request using `expirationTtl: 86400`. Consistent with the existing rate limit pattern in the worker.

**KV key design:**
- Key: `quota:chat:${tokenValue}` (separate namespace from rate limit keys `rate:${tokenValue}`)
- Value: request count as string
- TTL: 86400 seconds (24h rolling from first request)

### Production URL — update build config in Phase 12

Phase 12 includes updating `WORKER_URL` to the real production Cloudflare Worker URL in the build configuration. This allows a smoke-test build against prod before Phase 14/15 signing and CI.

**Where to update:**
- Set `WORKER_URL` in `.cargo/config.toml` under `[env]` or equivalent build script
- The production Worker URL will be known after `npx wrangler deploy` completes
- Fallback `http://localhost:8787` stays for dev builds (no change to `option_env!` pattern)

---

## Canonical Refs

- `/worker/src/index.ts` — existing worker implementation (rate limiting, HMAC auth, all routes)
- `/worker/wrangler.toml` — KV namespace placeholder to replace with real ID
- `/Users/subomi/Desktop/AI-Buddy/src-tauri/src/shortcut.rs` — `option_env!("WORKER_URL")` usage
- `/Users/subomi/Desktop/AI-Buddy/src-tauri/src/voice/tts.rs` — `option_env!("WORKER_URL")` usage
- `/Users/subomi/Desktop/AI-Buddy/src-tauri/src/memory.rs` — `std::env::var("WORKER_URL")` usage
- `.planning/REQUIREMENTS.md` — INFRA-03, INFRA-04, INFRA-05 specs

---

## Scope Boundary

**In Phase 12:**
- Provision KV namespace + update `wrangler.toml`
- Deploy Worker to production (`npx wrangler deploy`)
- Add quota enforcement for `/chat` (20/day, rolling 24h, `quota_exceeded` error code)
- Update app build config with production Worker URL
- Verify all three success criteria pass

**Deferred to Phase 13:**
- STT quota (5 min/day), TTS quota (10 responses/day)
- App-side quota display ("12 / 20 requests left today")
- Soft-limit warning (2 requests remaining)
- `/refresh-subscription` endpoint
- Stripe integration

---

## Deferred Ideas

None captured during this discussion.
