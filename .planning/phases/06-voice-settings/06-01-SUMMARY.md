---
phase: 06-voice-settings
plan: "01"
subsystem: voice-settings-ui
tags: [voice, tts, ptt, settings, rust, solidjs]
dependency_graph:
  requires: [05-03]
  provides: [VOICE-02]
  affects: [SidebarShell, SettingsScreen, shortcut.rs, preferences.rs]
tech_stack:
  added: []
  patterns:
    - update_ptt_shortcut mirrors update_shortcut pattern for PTT live re-registration
    - ttsEnabled signal lifted from SidebarShell to SettingsScreen via props (no new mechanism)
    - Voice section placed above skill profile sections — always visible on settings open
key_files:
  created: []
  modified:
    - src-tauri/src/shortcut.rs
    - src-tauri/src/preferences.rs
    - src-tauri/src/lib.rs
    - src/lib/tauri.ts
    - src/components/SettingsScreen.tsx
    - src/components/SidebarShell.tsx
decisions:
  - "update_ptt_shortcut added to shortcut.rs mirroring update_shortcut — unregister old, register new with identical PTT handler"
  - "cmd_update_ptt_shortcut is a new command (not a replacement for cmd_set_ptt_key) — keeps persistence-only contract intact for existing callers"
  - "ttsEnabled setter passed down as onTtsChange prop — same pattern as onClose, no new signal mechanism needed"
  - "_currentTaskLabel removed entirely (Option A from research) — task label is implementation detail, not user-facing"
metrics:
  duration_seconds: 178
  completed_date: "2026-04-11"
  tasks_completed: 4
  files_modified: 6
requirements: [VOICE-02]
---

# Phase 06 Plan 01: Voice Settings UI Summary

Voice settings UI wired end-to-end: TTS auto-play toggle and PTT key input added to SettingsScreen, backed by `cmd_update_ptt_shortcut` Rust command that persists and live re-registers without app restart.

## What Was Built

**Rust backend (Task 1):**
- `update_ptt_shortcut()` in `shortcut.rs` — unregisters old PTT shortcut, registers new one with identical handler body copied from `register_ptt_shortcut()`
- `cmd_update_ptt_shortcut` Tauri command in `preferences.rs` — validates key format via `key.parse::<Shortcut>()`, reads old key, persists new key, calls `update_ptt_shortcut()` for live re-registration
- Registered in `lib.rs` `invoke_handler!` immediately after `cmd_set_ptt_key`
- 3 unit tests: `valid_ptt_key_parses`, `default_ptt_key_parses`, `invalid_ptt_key_does_not_parse` — all pass

**Frontend IPC (Task 2):**
- `updatePttShortcut(key)` exported from `src/lib/tauri.ts` — wraps `cmd_update_ptt_shortcut`, returns the validated key string

**Settings UI (Task 3):**
- `SettingsScreenProps` extended with `ttsEnabled: boolean` and `onTtsChange: (val: boolean) => void`
- Voice section added above skill profile sections in SettingsScreen scrollable area
- TTS checkbox reads `props.ttsEnabled` (reactive from SidebarShell signal), calls `props.onTtsChange` on change
- PTT key text input loads current key via `getPttKey()` on mount, saves on blur/Enter via `updatePttShortcut()` with inline error display for invalid formats
- SidebarShell imports `setTtsEnabled as setTtsEnabledIpc`, passes `ttsEnabled()` and `onTtsChange` prop to SettingsScreen

**Dead code cleanup (Task 4):**
- `_currentTaskLabel` signal declaration and comment removed from SidebarShell (line 62)
- `setCurrentTaskLabel(ctx.taskLabel)` setter call removed from `submitIntent`

## Decisions Made

| Decision | Rationale |
|----------|-----------|
| New `cmd_update_ptt_shortcut` command (not modifying `cmd_set_ptt_key`) | Keeps persistence-only contract intact for any future callers; consistent with `cmd_set_shortcut` vs `update_shortcut` precedent |
| `update_ptt_shortcut` in shortcut.rs mirrors `update_shortcut` exactly | Proven pattern, identical unregister-before-register logic, same error handling |
| ttsEnabled passed via prop (not re-read on settings close) | Simplest approach, no new mechanism, consistent with `onClose` prop pattern |
| `_currentTaskLabel` removed entirely | Task label is implementation detail, not user-facing; simpler than Option B (surface in settings) |

## Verification Results

| Check | Result |
|-------|--------|
| `cargo test` (18 tests) | PASS — 18 passed, 0 failed |
| `tsc --noEmit` | PASS — no errors |
| `_currentTaskLabel` grep in SidebarShell | CLEAN — 0 matches |
| `cmd_update_ptt_shortcut` in lib.rs | FOUND — 1 match |
| `updatePttShortcut` export in tauri.ts | FOUND — 1 match |

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — all data paths are wired. TTS checkbox reads live `props.ttsEnabled` signal. PTT key loads from `getPttKey()` IPC. Both save immediately via IPC on change.

## Threat Flags

No new threat surface introduced beyond what the plan's threat model covers. `cmd_update_ptt_shortcut` validates input before any state mutation (T-06-01 mitigated). `update_ptt_shortcut` unregisters before registering (T-06-03 mitigated).

## Self-Check: PASS

Files exist:
- `src-tauri/src/shortcut.rs` — contains `pub fn update_ptt_shortcut`
- `src-tauri/src/preferences.rs` — contains `cmd_update_ptt_shortcut` and unit tests
- `src-tauri/src/lib.rs` — contains `preferences::cmd_update_ptt_shortcut`
- `src/lib/tauri.ts` — exports `updatePttShortcut`
- `src/components/SettingsScreen.tsx` — contains Voice section
- `src/components/SidebarShell.tsx` — no `_currentTaskLabel`, passes voice props

Commits exist:
- `df14d53` — feat(06-01): add update_ptt_shortcut + cmd_update_ptt_shortcut with unit tests
- `62bc59d` — feat(06-01): add updatePttShortcut IPC wrapper to tauri.ts
- `a404fa6` — feat(06-01): add Voice section to SettingsScreen, wire ttsEnabled prop from SidebarShell
- `aa64ec9` — chore(06-01): remove _currentTaskLabel dead signal from SidebarShell
