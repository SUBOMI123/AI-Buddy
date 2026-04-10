---
phase: 02-core-ai-loop
plan: 01
subsystem: ai-pipeline-backend
tags: [screenshot, hmac, sse-streaming, worker, claude-api]
dependency_graph:
  requires: [01-01, 01-02, 01-03]
  provides: [capture_screenshot, streamGuidance, signed-tokens, system-prompt-passthrough]
  affects: [02-02, 02-03]
tech_stack:
  added: [hmac 0.12, sha2 0.10, hex 0.4]
  patterns: [spawn_blocking for sync capture, SSE line buffering, HMAC token signing]
key_files:
  created:
    - src-tauri/src/screenshot.rs
    - src/lib/ai.ts
    - src-tauri/.cargo/config.toml
    - worker/.dev.vars
  modified:
    - src-tauri/src/lib.rs
    - src-tauri/src/preferences.rs
    - src-tauri/Cargo.toml
    - src/lib/tauri.ts
    - worker/src/index.ts
    - worker/wrangler.toml
decisions:
  - "HMAC secret embedded via env! macro at build time, dev value set in .cargo/config.toml"
  - "Screenshot resize to 1280px wide with Lanczos3 filter for Claude vision quality"
  - "SSE parsing uses fetch+ReadableStream (not EventSource) because POST with JSON body is required"
metrics:
  duration: "3 minutes"
  completed: "2026-04-10T00:35:24Z"
  tasks_completed: 2
  tasks_total: 2
---

# Phase 2 Plan 1: AI Pipeline Backend Summary

JWT-less HMAC token signing, xcap screenshot capture with JPEG/base64 encoding, Worker system prompt passthrough, and frontend SSE streaming module for Claude vision API integration.

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Rust screenshot capture command and HMAC token signing | 42969ef | screenshot.rs, preferences.rs, lib.rs, Cargo.toml, .cargo/config.toml |
| 2 | Worker system prompt passthrough and frontend AI streaming module | c21b8a2 | worker/src/index.ts, src/lib/ai.ts, src/lib/tauri.ts, worker/.dev.vars |

## What Was Built

### Screenshot Capture (screenshot.rs)
- `capture_screenshot` async Tauri command using xcap for primary monitor capture
- Wrapped in `spawn_blocking` to avoid blocking Tauri's async runtime
- Resizes to 1280px wide (aspect ratio preserved) with Lanczos3 filter
- Encodes to JPEG in-memory, then base64 for Claude vision API
- No filesystem I/O -- entire pipeline stays in memory (privacy: T-02-01)

### HMAC Token Signing (preferences.rs)
- `sign_token` function produces `<uuid>.<hmac_hex_signature>` format
- Uses `env!("APP_HMAC_SECRET")` for build-time secret embedding
- `cmd_get_token` now returns signed token that Worker auth middleware validates
- Dev secret set in `.cargo/config.toml`, production via CI env var

### Worker System Prompt Passthrough (worker/src/index.ts)
- Added `system: body.system` to the Claude API request body in /chat route
- Without this, Claude would ignore the system prompt and respond as generic chatbot
- One-line fix, critical for CORE-03 and CORE-05

### Frontend AI Streaming (ai.ts)
- `streamGuidance` function: fetch POST to Worker /chat, parse SSE response
- SSE line buffering handles partial chunks correctly
- AbortSignal support for request cancellation
- `SYSTEM_PROMPT` constant instructs Claude for numbered step-by-step guidance
- System prompt includes clarifying question behavior for vague intent
- Error messages match UI-SPEC copywriting contract

### Supporting Files
- `captureScreenshot` IPC wrapper added to tauri.ts
- `worker/.dev.vars` created with dev HMAC secret and placeholder API key
- `APP_HMAC_SECRET` added to wrangler.toml secrets documentation

## Deviations from Plan

None -- plan executed exactly as written.

## Decisions Made

1. **HMAC secret via env! macro**: Compile-time embedding ensures the secret is available without runtime config. Dev value in `.cargo/config.toml`, production value set via CI environment variable.
2. **Lanczos3 resize filter**: Best quality for downscaling screenshots for AI vision analysis. Slightly slower than Nearest but quality matters for UI element recognition.
3. **fetch+ReadableStream over EventSource**: EventSource only supports GET requests. Claude API proxy needs POST with JSON body, so manual SSE parsing with line buffering is the correct approach.

## Verification Results

- `cargo check` in src-tauri/: PASSED (compiles with screenshot.rs, hmac/sha2/hex deps)
- `npx tsc --noEmit`: PASSED (ai.ts and updated tauri.ts compile clean)
- `grep "system: body.system" worker/src/index.ts`: MATCHED
- `grep "capture_screenshot" src-tauri/src/lib.rs`: MATCHED
- `grep "sign_token" src-tauri/src/preferences.rs`: MATCHED

## Known Stubs

None -- all functions are fully implemented with real logic.

## Self-Check: PASSED

All 4 created files verified on disk. Both commit hashes (42969ef, c21b8a2) verified in git log.
