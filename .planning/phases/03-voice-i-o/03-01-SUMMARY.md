---
phase: 03-voice-i-o
plan: 03-01
subsystem: voice
tags: [ptt, cpal, assemblyai, websocket, rodio, audio-cues, permissions]
dependency_graph:
  requires: [02-03]
  provides: [ptt-pipeline, voice-module, audio-cues]
  affects: [shortcut.rs, preferences.rs, lib.rs]
tech_stack:
  added: [cpal 0.17, rodio 0.22, tokio-tungstenite 0.29, futures-util 0.3]
  patterns: [cpal-on-std-thread, mpsc-bridge-to-async, atomicbool-cas-guard, mixerdevicesink-rodio-022]
key_files:
  created:
    - src-tauri/Info.plist
    - src-tauri/entitlements.plist
    - src-tauri/assets/ptt_start.wav
    - src-tauri/assets/ptt_stop.wav
    - src-tauri/src/voice/mod.rs
    - src-tauri/src/voice/audio_cue.rs
    - src-tauri/src/voice/ptt.rs
  modified:
    - src-tauri/Cargo.toml
    - src-tauri/tauri.conf.json
    - src-tauri/src/preferences.rs
    - src-tauri/src/shortcut.rs
    - src-tauri/src/lib.rs
decisions:
  - "rodio 0.22 uses DeviceSinkBuilder::open_default_sink() returning MixerDeviceSink — not OutputStream+Sink (removed in 0.22)"
  - "rodio 0.22 MixerDeviceSink uses mixer().add(source) pattern — no append/sleep_until_end on sink directly"
  - "Audio cue playback uses 200ms sleep as duration ceiling since WAV is ~60ms — simpler than parsing WAV header"
  - "AssemblyAI v3 terminate format is {type:Terminate} — NOT v2 terminate_session boolean"
  - "Message::Text in tungstenite 0.29 requires Utf8Bytes — use .into() on String"
  - "tauri::Emitter trait must be explicitly imported for AppHandle.emit() in Tauri v2"
metrics:
  duration: "5m 19s"
  completed: "2026-04-09"
  tasks_completed: 2
  files_changed: 11
---

# Phase 3 Plan 1: Rust PTT + STT Pipeline Summary

## One-liner

Full cpal-on-std-thread push-to-talk pipeline with AssemblyAI v3 WebSocket streaming, rodio 0.22 MixerDeviceSink audio cues, AtomicBool CAS repeat guard, and macOS microphone entitlements.

## What Was Built

### Task 1: Permissions, Assets, and Voice Module Scaffold

- **`src-tauri/Info.plist`** — `NSMicrophoneUsageDescription` for macOS microphone permission dialog
- **`src-tauri/entitlements.plist`** — `com.apple.security.device.audio-input` entitlement for sandboxed mic access
- **`src-tauri/tauri.conf.json`** — Bundle macOS section wired to both plist files
- **`src-tauri/assets/ptt_start.wav`** — 660Hz sine click at 44100Hz/16-bit/mono, 60ms (~5.3KB)
- **`src-tauri/assets/ptt_stop.wav`** — 440Hz sine click at 44100Hz/16-bit/mono, 60ms (~5.3KB)
- **`src-tauri/src/voice/mod.rs`** — Voice module root with architecture docs and 4 unit tests
- **`src-tauri/src/voice/audio_cue.rs`** — PTT click cue playback via rodio 0.22 MixerDeviceSink
- **`src-tauri/src/voice/ptt.rs`** — Full PTT state machine: IS_PTT_ACTIVE CAS guard, cpal capture on std::thread, mpsc bridge to async WebSocket, AssemblyAI v3 streaming, Tauri event emission
- **Cargo.toml** — Added cpal 0.17, rodio 0.22, tokio-tungstenite 0.29, tokio full, reqwest 0.12, futures-util 0.3

### Task 2: PTT Shortcut Handler + Preference Commands + Wiring

- **`src-tauri/src/preferences.rs`** — Added `ptt_key`, `audio_cues_enabled`, `tts_enabled` fields with serde defaults; added 6 Tauri commands for get/set of each
- **`src-tauri/src/shortcut.rs`** — Added `register_ptt_shortcut` handling both `Pressed` (spawn async PTT session) and `Released` (stop session); reads PTT key from preferences (D-03)
- **`src-tauri/src/lib.rs`** — Registered `register_ptt_shortcut` in setup; added all 6 preference commands to `invoke_handler`

## Architecture Decisions Made

**cpal thread isolation (T-03-02):** `cpal::Stream` is `!Send` on macOS. Mic capture runs in `std::thread::spawn`. PCM frames bridge to the async WebSocket sender via `tokio::sync::mpsc::channel(32)`. This is the only safe pattern on macOS.

**AssemblyAI v3 terminate format (T-03-03):** The plan noted v3 uses `{"type":"Terminate"}` not v2's `{"terminate_session":true}`. Implemented correctly. The 30-second session timeout auto-closes sessions that exceed the limit.

**AtomicBool CAS guard (T-03-01):** `IS_PTT_ACTIVE.compare_exchange(false, true, SeqCst, SeqCst)` in `start_ptt_session` plus an early-exit read in the shortcut Pressed handler. Double-layered protection against key repeat opening multiple WebSocket sessions.

**Session stop channel:** `tokio::sync::watch::channel` stored in `Mutex<Option<Sender>>` — replaced each press. Signals both the PCM sender task and the read loop to terminate cleanly.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Missing `use tauri::Emitter` import**
- **Found during:** Task 1, first cargo build
- **Issue:** `AppHandle.emit()` requires `tauri::Emitter` trait to be in scope in Tauri v2
- **Fix:** Added `use tauri::Emitter;` to ptt.rs imports
- **Files modified:** `src-tauri/src/voice/ptt.rs`
- **Commit:** 13da079

**2. [Rule 1 - Bug] `Message::Text` requires `Utf8Bytes` not `String` in tungstenite 0.29**
- **Found during:** Task 1, first cargo build
- **Issue:** `tungstenite::Message::Text` wraps `Utf8Bytes`, not `String`. `.to_string()` alone fails type check.
- **Fix:** Changed `Message::Text(terminate.to_string())` to `Message::Text(terminate.to_string().into())`
- **Files modified:** `src-tauri/src/voice/ptt.rs`
- **Commit:** 13da079

**3. [Rule 1 - Bug] `DeviceSinkBuilder::new()` does not exist in rodio 0.22**
- **Found during:** Task 1, second cargo build
- **Issue:** Plan specified `DeviceSinkBuilder::new().open_default_sink()` which does not match actual rodio 0.22 API. The correct static method is `DeviceSinkBuilder::open_default_sink()` returning `MixerDeviceSink`.
- **Fix:** Rewrote `play_cue_bytes` to use `DeviceSinkBuilder::open_default_sink()` then `mixer().add(source)` with 200ms sleep ceiling
- **Files modified:** `src-tauri/src/voice/audio_cue.rs`
- **Commit:** 13da079

## Build and Test Results

```
cargo build: Finished dev profile — 0 errors, 13 warnings (all "never used" — expected until Task 3 wires frontend)
cargo test -- voice --nocapture:
  test voice::tests::test_ptt_key_repeat_guard ... ok
  test voice::tests::test_audio_cue_module_exists ... ok
  test voice::tests::test_ws_session_lifecycle_guard ... ok
  test voice::tests::test_mic_thread_isolation ... ok
  test result: ok. 4 passed; 0 failed
```

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | 13da079 | feat(03-01): permissions, assets, and voice module scaffold |
| 2 | bd488a8 | feat(03-01): PTT shortcut handler, preferences, and command wiring |

## Known Stubs

None — all functions are fully implemented. The voice pipeline is ready for frontend wiring in plan 03-02.

## Self-Check: PASSED

All created files verified present on disk. Both task commits verified in git log.
