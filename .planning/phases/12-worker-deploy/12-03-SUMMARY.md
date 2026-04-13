---
phase: 12-worker-deploy
plan: "03"
subsystem: infrastructure
tags: [cloudflare-worker, option_env, build-config, smoke-test, hmac]
dependency_graph:
  requires: ["12-02"]
  provides: ["INFRA-03", "INFRA-04", "INFRA-05"]
  affects: []
tech_stack:
  added: []
  patterns:
    - "option_env! macro for compile-time WORKER_URL embedding in all Rust backend files"
    - "src-tauri/.cargo/config.toml [env] as the single source of truth for build-time secrets"
    - "Node.js HMAC smoke-test script for production route verification without a full Tauri build"
key_files:
  created:
    - worker/scripts/smoke-test.mjs
  modified:
    - src-tauri/src/memory.rs
    - src-tauri/.cargo/config.toml
decisions:
  - "APP_HMAC_SECRET committed to .cargo/config.toml — known tradeoff, moves to CI secrets in Phase 14"
  - "Smoke test accepts WORKER_URL and APP_HMAC_SECRET as CLI args to avoid hardcoding in script"
metrics:
  duration: "~10 minutes"
  completed: "2026-04-13"
  tasks_completed: 3
  files_changed: 3
requirements: [INFRA-03, INFRA-04, INFRA-05]
---

# Phase 12 Plan 03: App Wire-Up and Production Smoke Test Summary

Production Worker URL baked into Tauri build config via option_env!, memory.rs runtime env var inconsistency fixed, and HMAC smoke-test script created for end-to-end production verification.

## What Was Done

### Task 1: Fix memory.rs runtime env var
Changed `classify_intent()` from `std::env::var("WORKER_URL")` (runtime OS lookup) to `option_env!("WORKER_URL")` (compile-time macro). Now consistent with `shortcut.rs` and `tts.rs`. In packaged production builds, the correct URL is embedded in the binary — no OS env var needed at runtime.

### Task 2: Update .cargo/config.toml with production values
Updated `src-tauri/.cargo/config.toml` to set:
- `WORKER_URL = "https://ai-buddy-proxy.subomi-bashorun.workers.dev"` (production URL from Plan 02)
- `APP_HMAC_SECRET = "e65b212e0dc720b57f9f5b7ae69b2099627c2da8729849ad10791ca6b2b30a5d"` (matches wrangler secret set in Plan 02)

Replaced the `dev-hmac-secret-do-not-use-in-production` placeholder. Future `cargo tauri build` runs will embed the production URL and secret via `option_env!`.

### Task 3: Write smoke-test script
Created `worker/scripts/smoke-test.mjs` — a Node.js script that:
- Generates a valid HMAC-signed token (UUID + HMAC-SHA256, matching `preferences.rs` `cmd_get_token` format)
- Tests 5 scenarios: `/health` (unauthenticated), `/chat` 401 rejection, `/chat`/`/stt`/`/tts` with valid token
- Accepts `WORKER_URL` and `APP_HMAC_SECRET` as CLI args
- Exits 1 with diagnostic if any test fails
- Syntax verified: `node --check` exits 0

### Task 4: Human verification (pending)
Checkpoint awaiting user confirmation that smoke test passes against production Worker.

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | `84e9e64` | fix(12-03): use option_env! for WORKER_URL in classify_intent |
| 2 | `af687bd` | chore(12-03): wire production WORKER_URL and APP_HMAC_SECRET into build config |
| 3 | `fca038a` | feat(12-03): add smoke-test script for production Worker route verification |

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None. All three files modified/created are fully functional.

## Threat Flags

None. All security-relevant surfaces (APP_HMAC_SECRET in config.toml, HMAC token in smoke-test CLI args) are covered by the plan's threat model (T-12-11, T-12-12).

## Self-Check: PASSED

- `grep "option_env" src-tauri/src/memory.rs` returns 1 line with `option_env!("WORKER_URL")`
- `grep "std::env::var" src-tauri/src/memory.rs` returns no output
- `grep "WORKER_URL" src-tauri/.cargo/config.toml` returns `https://ai-buddy-proxy.subomi-bashorun.workers.dev`
- `grep "dev-hmac-secret" src-tauri/.cargo/config.toml` returns no output
- `node --check worker/scripts/smoke-test.mjs` exits 0
- All 3 commits exist in git log: 84e9e64, af687bd, fca038a
