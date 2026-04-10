---
quick_id: 260409-wz8
type: quick-fix
status: complete
files_modified:
  - src-tauri/src/voice/audio_cue.rs
---

# Quick Task 260409-wz8: Fix PTT No Tokio Runtime Handle / DeviceSink Warning

**One-liner:** Captured tokio runtime handle before spawning std::thread in `play_cue_bytes` and entered it inside the thread so rodio's DeviceSink drop can resolve the runtime context.

## What Was Done

`play_cue_bytes` in `src-tauri/src/voice/audio_cue.rs` spawned a bare `std::thread` without carrying the tokio runtime context. rodio 0.22's `DeviceSink` drop implementation tries to find an active tokio runtime and logs "DeviceSink: no tokio runtime handle available" when none is present.

Fix applied:
1. Before `std::thread::spawn`, call `tokio::runtime::Handle::try_current().ok()` to capture the current runtime handle (if any).
2. Inside the spawned thread, call `rt_handle.as_ref().map(|h| h.enter())` and hold the guard for the thread's lifetime.
3. Renamed the `DeviceSinkBuilder` result from `handle` to `sink` for clarity.
4. Removed the redundant `duration_secs` block (inlined to `Duration::from_millis(200)` directly).

## Verification

`cargo check -p ai-buddy` completed with zero errors in 18.62s.

## Deviations

None — plan executed exactly as written.
