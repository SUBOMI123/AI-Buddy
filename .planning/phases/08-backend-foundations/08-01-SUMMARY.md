---
phase: 08-backend-foundations
plan: "01"
subsystem: rust-backend
tags: [multi-monitor, window-positioning, physical-units, bug-fix]
dependency_graph:
  requires: []
  provides: [cursor-based-monitor-detection, physical-unit-window-sizing]
  affects: [src-tauri/src/window.rs, src-tauri/src/shortcut.rs, src-tauri/src/tray.rs]
tech_stack:
  added: []
  patterns: [available_monitors-range-check, all-physical-units]
key_files:
  modified:
    - src-tauri/src/window.rs
    - src-tauri/src/shortcut.rs
    - src-tauri/src/tray.rs
decisions:
  - toggle_overlay fallback uses position (0,0) origin check instead of is_primary() per plan spec — avoids potential missing method on Monitor type
  - tray.rs call site fixed as deviation (Rule 3) — was blocking the build
metrics:
  duration_seconds: 104
  completed_date: "2026-04-11"
  tasks_completed: 2
  files_modified: 3
---

# Phase 08 Plan 01: Multi-Monitor Overlay + Physical Unit Fix Summary

**One-liner:** Cursor-based monitor detection via `available_monitors()` range check replacing hardcoded `primary_monitor()`, with all-Physical unit window sizing to fix the Retina 2x sizing bug.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Rewrite toggle_overlay with cursor-based monitor detection | 9e29996 | src-tauri/src/window.rs, src-tauri/src/tray.rs |
| 2 | Update both toggle_overlay call sites in shortcut.rs | 956c90b | src-tauri/src/shortcut.rs |

## What Was Built

`toggle_overlay` in `window.rs` now:
1. Calls `app.cursor_position()` to get the current cursor location (physical coordinates)
2. Calls `app.available_monitors()` to enumerate all connected displays
3. Range-checks the cursor position against each monitor's physical rect to find the active monitor
4. Falls back to: monitor at origin (0,0) → first monitor in list (never panics on empty list)
5. Uses exclusively `tauri::Size::Physical` and `tauri::Position::Physical` — no more Logical/Physical mixing

The function signature changed from `toggle_overlay(window: &WebviewWindow)` to `toggle_overlay(app: &AppHandle, window: &WebviewWindow)`.

All three call sites were updated: `shortcut.rs` (register_shortcut), `shortcut.rs` (update_shortcut), and `tray.rs` (show_hide menu item).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking Issue] tray.rs had a third toggle_overlay call site not mentioned in the plan**
- **Found during:** Task 1 build verification
- **Issue:** `cargo build` failed with 3 errors — shortcut.rs (×2) and tray.rs (×1) — all calling the old single-argument signature. The plan only documented shortcut.rs call sites.
- **Fix:** Updated `tray.rs` line 22 to pass `app` as first argument: `toggle_overlay(app, &window)`
- **Files modified:** src-tauri/src/tray.rs
- **Commit:** 9e29996 (included with Task 1 commit)

## Verification Results

All plan verification checks passed:

1. `cargo build` exits 0 — confirmed
2. `grep "available_monitors" src-tauri/src/window.rs` — returns match at line 25
3. `grep "primary_monitor" src-tauri/src/window.rs` — no match inside `toggle_overlay` (only in `cmd_open_region_select`, which was not touched)
4. No `tauri::Size::Logical` or `tauri::LogicalSize::new` inside `toggle_overlay` — confirmed (word "Logical" appears only in a comment)
5. `grep "toggle_overlay(app," src-tauri/src/shortcut.rs` — 2 matches at lines 26 and 169

## Known Stubs

None. This plan makes no UI changes and wires no data to display components.

## Threat Flags

None. No new network endpoints, auth paths, file access patterns, or schema changes introduced. The coordinate math uses OS-provided physical values with no user input path.

## Self-Check: PASSED

- src-tauri/src/window.rs — FOUND (modified)
- src-tauri/src/shortcut.rs — FOUND (modified)
- src-tauri/src/tray.rs — FOUND (modified, deviation)
- Commit 9e29996 — FOUND (`git log --oneline | head -2`)
- Commit 956c90b — FOUND (`git log --oneline | head -2`)
- `cargo build` exit 0 — CONFIRMED
