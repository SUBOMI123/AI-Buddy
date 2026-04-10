---
phase: 03-voice-i-o
plan: 03-02
subsystem: voice
tags: [tts, assemblyai, elevenlabs, rodio, worker, ipc, websocket]
dependency_graph:
  requires: [03-01]
  provides: [worker-stt-route, worker-tts-route, rust-play-tts-command, ts-voice-ipc-wrappers]
  affects: [worker/src/index.ts, src-tauri/src/voice/tts.rs, src-tauri/src/voice/mod.rs, src-tauri/src/lib.rs, src/lib/tauri.ts]
tech_stack:
  added: []
  patterns: [mixerdevicesink-stop-channel-d16, worker-tts-streaming-proxy, assemblyai-token-issuance]
key_files:
  created:
    - src-tauri/src/voice/tts.rs
  modified:
    - worker/src/index.ts
    - src-tauri/src/voice/mod.rs
    - src-tauri/src/lib.rs
    - src/lib/tauri.ts
decisions:
  - "rodio 0.22 stop-before-play (D-16) uses SyncSender<()> stop channel — MixerDeviceSink is !Send so cannot be stored in static Mutex; drop(handle) terminates audio"
  - "TTS audio fully buffered before rodio decode — Cloudflare Workers stream in chunks but rodio Decoder needs seekable reader; acceptable for guidance text (30-200KB)"
  - "Worker /tts uses ElevenLabs Rachel voice (21m00Tcm4TlvDq8ikWAM) — clear and neutral for instructional speech"
  - "60-second ceiling in playback poll loop as safety net — audio for typical 50-300 char guidance text completes in 1-10 seconds"
metrics:
  duration: "~10m"
  completed: "2026-04-10"
  tasks_completed: 2
  files_changed: 5
---

# Phase 3 Plan 2: Worker Routes + Rust TTS Command Summary

## One-liner

Worker /stt issues AssemblyAI v3 short-lived tokens and /tts proxies ElevenLabs Turbo v2.5 streaming MP3, with a Rust cmd_play_tts command using rodio 0.22 MixerDeviceSink stop-channel pattern for D-16 stop-before-play.

## What Was Built

### Task 1: Worker /stt and /tts Route Implementation

- **`worker/src/index.ts` /stt** — Replaced 501 stub with AssemblyAI token endpoint: GET `streaming.assemblyai.com/v3/token?expires_in_seconds=300` with `Authorization: ASSEMBLYAI_API_KEY`. Returns `{ token }` for Rust PTT pipeline to use when opening WebSocket directly to AssemblyAI.
- **`worker/src/index.ts` /tts** — Replaced 501 stub with ElevenLabs Turbo v2.5 streaming proxy: validates text (non-empty, max 2000 chars per T-03-05), POSTs to ElevenLabs with `eleven_turbo_v2_5` model ID, streams MP3 audio back as `audio/mpeg`.
- **Auth protection (T-03-04)** — Both routes are covered by the existing `app.use('*', ...)` HMAC middleware. No per-route auth added — the global middleware blocks unauthenticated requests before reaching route handlers.
- **Input validation (T-03-05)** — /tts returns 400 with `{ error: "text must be a non-empty string" }` for empty text, and `{ error: "text must be 2000 characters or fewer" }` for oversized payloads.

### Task 2: Rust play_tts Command + TypeScript IPC Wrappers

- **`src-tauri/src/voice/tts.rs`** — New file implementing `cmd_play_tts` async Tauri command:
  - Local validation mirrors Worker validation (non-empty, max 2000 chars)
  - D-16 stop-before-play: `static STOP_TX: Mutex<Option<mpsc::SyncSender<()>>>` stores the stop signal sender; each new call sends `()` to terminate any active playback thread
  - Fetches MP3 from Worker /tts via reqwest with `x-app-token` header
  - Buffers full response before decode (rodio needs seekable reader)
  - Spawns `std::thread` (MixerDeviceSink is !Send on macOS) — polls stop channel every 50ms, drops handle on stop signal or 60s ceiling
  - Uses rodio 0.22 `DeviceSinkBuilder::open_default_sink()` → `MixerDeviceSink` → `mixer().add(source)`
- **`src-tauri/src/voice/mod.rs`** — Added `pub mod tts;` declaration
- **`src-tauri/src/lib.rs`** — Registered `voice::tts::cmd_play_tts` in invoke_handler; verified `register_ptt_shortcut` already present in setup closure (wired in 03-01)
- **`src/lib/tauri.ts`** — Appended Phase 3 IPC wrappers:
  - PTT preferences: `getPttKey`, `setPttKey`, `getAudioCuesEnabled`, `setAudioCuesEnabled`
  - TTS preferences: `getTtsEnabled`, `setTtsEnabled`
  - TTS playback: `playTts` (fire-and-forget)
  - STT event listeners: `onSttPartial`, `onSttFinal`, `onSttError` (wrapping `listen` from @tauri-apps/api/event, already imported)

## Architecture Decisions Made

**D-16 stop-channel approach:** `MixerDeviceSink` is `!Send` on macOS (wraps CoreAudio internals), so it cannot be stored in a `static Mutex`. Instead, a `mpsc::SyncSender<()>` (which is `Send + Sync`) is stored in the static. The playback thread holds the receiver and polls it every 50ms. On new TTS request, the old sender fires `try_send(())` — the thread receives it, calls `drop(handle)` to terminate CoreAudio output, and exits.

**Buffer before decode:** ElevenLabs streams MP3 chunks. Cloudflare Workers forward them incrementally. rodio's `Decoder::new()` requires `Read + Seek`. Full buffering into `Vec<u8>` then `Cursor::new()` gives a seekable reader. For typical 50-300 char guidance text, the buffer is 30-200KB — acceptable latency tradeoff.

**Worker auth pattern confirmation:** The global `app.use('*', ...)` middleware already excludes only `/health`. Both new routes (/stt, /tts) fall under this middleware with no additional work needed.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] rodio 0.22 API is `DeviceSinkBuilder::open_default_sink()` (static), not `::new().open_default_sink()`**
- **Found during:** Task 2 planning — 03-01 SUMMARY documented this deviation explicitly
- **Issue:** Plan specified `DeviceSinkBuilder::new().open_default_sink()` which does not exist in rodio 0.22. Actual API is the static method `DeviceSinkBuilder::open_default_sink()` returning `MixerDeviceSink`. Playback via `handle.mixer().add(source)` — not `sink.append(source)`.
- **Fix:** Used `DeviceSinkBuilder::open_default_sink()` and `mixer().add(source)` in tts.rs, consistent with audio_cue.rs established in 03-01. D-16 stop via `drop(handle)` inside thread on stop signal.
- **Files modified:** `src-tauri/src/voice/tts.rs`
- **Commit:** ba33878

**2. [Rule 2 - Missing] Added `test_stop_tx_is_send_sync` compile-time test**
- **Found during:** Task 2 implementation
- **Issue:** Plan's test only covered input validation. The critical correctness property that `SyncSender<()>` is `Send + Sync` (enabling static storage) had no verification.
- **Fix:** Added second unit test that asserts `SyncSender<()>` satisfies `Send + Sync` as a compile-time proof.
- **Files modified:** `src-tauri/src/voice/tts.rs`
- **Commit:** ba33878

## Build and Test Results

```
cargo build: Finished dev profile — 0 errors, 1 warning (pre-existing dead_code warning in ptt.rs from 03-01)
cargo test -- test_tts_input_validation --nocapture:
  test voice::tts::tests::test_tts_input_validation ... ok
  test result: ok. 1 passed; 0 failed
cd worker && npx tsc --noEmit: exit 0 (no errors)
npx tsc --noEmit (frontend): exit 0 (no errors)
```

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | f8ffce4 | feat(03-02): implement Worker /stt and /tts routes |
| 2 | ba33878 | feat(03-02): Rust play_tts command and TypeScript IPC wrappers |

## Known Stubs

None — all routes and commands are fully implemented. The voice IPC layer is ready for frontend wiring in plan 03-03.

## Threat Surface Scan

No new network endpoints beyond what the plan specified. Both /stt and /tts are covered by existing HMAC auth middleware (T-03-04). No new trust boundaries introduced.

## Self-Check: PASSED
