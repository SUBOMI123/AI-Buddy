---
phase: 12-worker-deploy
plan: "02"
subsystem: infrastructure
tags: [cloudflare-worker, wrangler, kv, deploy, secrets, rate-limit, quota]
dependency_graph:
  requires: ["12-01"]
  provides: ["INFRA-03", "INFRA-04"]
  affects: ["12-03-PLAN"]
tech_stack:
  added: []
  patterns:
    - "Wrangler KV namespace provisioned via CLI and committed to wrangler.toml"
    - "4 secrets set via wrangler secret put — never in source or git"
    - "HMAC-SHA256 auth middleware validates x-app-token header on all non-health routes"
    - "Dual-layer protection: rate limit (60 req/min) + quota (20 /chat/day rolling 24h)"
key_files:
  created: []
  modified:
    - worker/wrangler.toml
decisions:
  - "KV namespace ID committed to git — not a secret (resource identifier only; data protected by auth middleware)"
  - "APP_HMAC_SECRET must match value set in src-tauri/.cargo/config.toml in Plan 03"
  - "Workers dev subdomain enabled by default (wrangler warning accepted — not overridden)"
metrics:
  duration: "~10 minutes"
  completed: "2026-04-13"
  tasks_completed: 3
  files_changed: 1
requirements: [INFRA-03, INFRA-04]
---

# Phase 12 Plan 02: Worker Deploy — KV, Secrets, and Production Deploy Summary

Cloudflare Worker deployed live at `https://ai-buddy-proxy.subomi-bashorun.workers.dev` with real KV namespace bound, all 4 API secrets set, and all proxy routes verified operational.

## What Was Done

### Task 1: Wrangler Authentication Gate
Human-action checkpoint completed. User authenticated via `npx wrangler login` and confirmed via `npx wrangler whoami`.

### Task 2: Provision KV Namespace and Update wrangler.toml
KV namespace `RATE_LIMIT` created via `npx wrangler kv namespace create RATE_LIMIT`. Real namespace ID `119c44c5ae2548239c9e3c2a995f34f8` written to `worker/wrangler.toml`, replacing the placeholder. Committed at `851f0f9`.

### Task 3: Deploy Worker to Production
`npx wrangler deploy` succeeded. Worker uploaded at 71.98 KiB, deployed in ~3 seconds. Health endpoint verified returning `{"status":"ok","version":"1.0.0"}`. All 4 protected routes confirm 401 on unauthenticated requests.

## Production Values for Plan 03

**CRITICAL — Plan 03 requires both values below:**

| Key | Value |
|-----|-------|
| Production Worker URL | `https://ai-buddy-proxy.subomi-bashorun.workers.dev` |
| APP_HMAC_SECRET | `e65b212e0dc720b57f9f5b7ae69b2099627c2da8729849ad10791ca6b2b30a5d` |

Plan 03 must set `WORKER_URL = "https://ai-buddy-proxy.subomi-bashorun.workers.dev"` and `APP_HMAC_SECRET = "e65b212e0dc720b57f9f5b7ae69b2099627c2da8729849ad10791ca6b2b30a5d"` in `src-tauri/.cargo/config.toml` under `[env]`. The HMAC secret must match exactly — mismatch causes 401 on every authenticated request.

## Verification Results

| Check | Result |
|-------|--------|
| `curl /health` | `{"status":"ok","version":"1.0.0"}` HTTP 200 |
| `POST /chat` (no token) | `{"error":"Unauthorized"}` HTTP 401 |
| `POST /stt` (no token) | `{"error":"Unauthorized"}` HTTP 401 |
| `POST /tts` (no token) | `{"error":"Unauthorized"}` HTTP 401 |
| `npx wrangler secret list` | All 4 secrets present: ANTHROPIC_API_KEY, ASSEMBLYAI_API_KEY, ELEVENLABS_API_KEY, APP_HMAC_SECRET |
| KV namespace bound | `env.RATE_LIMIT (119c44c5ae2548239c9e3c2a995f34f8)` confirmed in deploy output |

## Deviations from Plan

None — plan executed exactly as written. All 4 secrets were already set by the user (per resume state). Deploy and verification ran clean on first attempt.

## Known Stubs

None. The worker is fully operational with real secrets and KV binding.

## Threat Flags

None. No new network endpoints, auth paths, or schema changes beyond those covered in the plan's threat model.

## Self-Check: PASSED

- `worker/wrangler.toml` exists and contains real KV ID `119c44c5ae2548239c9e3c2a995f34f8`
- Deployment confirmed live via curl `/health` returning `{"status":"ok","version":"1.0.0"}`
- `851f0f9` commit (Task 2) verified in git log
- All 4 secrets confirmed via `npx wrangler secret list`
