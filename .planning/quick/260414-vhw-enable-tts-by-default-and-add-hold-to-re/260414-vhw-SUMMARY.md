---
phase: quick
plan: 260414-vhw
subsystem: voice-ui
tags: [tts, ptt, mic-button, preferences, frontend]
dependency_graph:
  requires: []
  provides: [ptt-mic-button, tts-default-on]
  affects: [SidebarShell, preferences, ptt-pipeline]
tech_stack:
  added: []
  patterns: [hold-to-record mic button, Tauri command wrappers for existing pipeline]
key_files:
  created: []
  modified:
    - src-tauri/src/preferences.rs
    - src-tauri/src/voice/ptt.rs
    - src-tauri/src/lib.rs
    - src/lib/tauri.ts
    - src/components/SidebarShell.tsx
decisions:
  - cmd_ptt_start early-exits via IS_PTT_ACTIVE load check (before delegating to start_ptt_session CAS guard) to skip async overhead when already recording
  - onMouseLeave only calls pttStop when isListening() to avoid spurious stop calls from casual cursor movement
metrics:
  duration: ~10 minutes
  completed: "2026-04-15T03:45:51Z"
  tasks_completed: 2
  tasks_total: 2
  files_changed: 5
---

# Quick Task 260414-vhw: Enable TTS by Default and Add Hold-to-Record Mic Button

**One-liner:** TTS default flipped to true in preferences.rs; mic button added to input row using hold-to-record PTT via two thin Tauri command wrappers.

## What Was Built

### Task 1: TTS default + PTT Rust command wrappers (commit 07bdc54)

- `default_tts_enabled()` in `preferences.rs` changed from `false` to `true` — new installs now have TTS on by default
- Added `cmd_ptt_start` (async `#[tauri::command]`) and `cmd_ptt_stop` (`#[tauri::command]`) at the bottom of `voice/ptt.rs`
  - Both delegate to the existing `start_ptt_session` / `stop_ptt_session` functions — no new pipeline code
  - `cmd_ptt_start` loads `worker_url`, `app_token`, and `audio_cues_enabled` from preferences before calling `start_ptt_session`
  - `cmd_ptt_stop` loads `audio_cues_enabled` from preferences before calling `stop_ptt_session`
- Both commands registered in `tauri::generate_handler![]` in `lib.rs` after `voice::tts::cmd_play_tts`

### Task 2: Frontend IPC wrappers + mic button UI (commit 2ad58d1)

- `pttStart()` and `pttStop()` exported from `src/lib/tauri.ts`
- Both imported in `SidebarShell.tsx`
- `micPulse` keyframe animation added to the existing `<style>` block in SidebarShell
- `<TextInput>` wrapped in a flex row div with a new mic `<button>` to its left:
  - `onMouseDown` / `onTouchStart` call `pttStart()`
  - `onMouseUp` / `onTouchEnd` call `pttStop()`
  - `onMouseLeave` calls `pttStop()` only when `isListening()` is true
  - Button shows red background + pulsing ring animation while `isListening()`
  - Button disabled and opacity 0.4 when `needsPermission()` is true
  - Inline SVG mic icon — no new icon library dependency

## Verification

- `cargo check` (with `APP_HMAC_SECRET=test`): passed, no errors
- `npm run build` (Vite): passed, no TypeScript errors, 98.28 kB bundle

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None.

## Threat Flags

None — no new network endpoints or auth paths introduced. `cmd_ptt_start`/`cmd_ptt_stop` operate within the existing WebView→Rust trust boundary with the same IS_PTT_ACTIVE atomic guard that prevents double-start (T-vhw-01).

## Self-Check: PASSED

- `src-tauri/src/preferences.rs` modified: confirmed `default_tts_enabled` returns `true`
- `src-tauri/src/voice/ptt.rs` modified: `cmd_ptt_start` and `cmd_ptt_stop` present
- `src-tauri/src/lib.rs` modified: both commands in `generate_handler![]`
- `src/lib/tauri.ts` modified: `pttStart` and `pttStop` exported
- `src/components/SidebarShell.tsx` modified: mic button wrapping TextInput, `micPulse` animation present
- Commits 07bdc54 and 2ad58d1 exist in git log
