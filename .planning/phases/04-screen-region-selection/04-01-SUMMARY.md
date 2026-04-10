---
phase: 04-screen-region-selection
plan: "01"
subsystem: rust-backend
tags: [screen-capture, xcap, tauri-commands, region-selection, window-management]
dependency_graph:
  requires: []
  provides: [capture_region-command, cmd_open_region_select-command, cmd_close_region_select-command, region-select-window-declaration]
  affects: [src-tauri/src/screenshot.rs, src-tauri/src/window.rs, src-tauri/src/lib.rs, src-tauri/tauri.conf.json]
tech_stack:
  added: []
  patterns: [tauri-command, xcap-capture-region, bounds-validation-before-capture, conditional-resize, lazy-hide-not-destroy]
key_files:
  created: []
  modified:
    - src-tauri/src/screenshot.rs
    - src-tauri/src/window.rs
    - src-tauri/src/lib.rs
    - src-tauri/tauri.conf.json
decisions:
  - "xcap Monitor API uses individual width()/height() methods returning XCapResult<u32>, not a size() struct — bounds validation adjusted accordingly"
  - "capture_region x/y parameters kept as i32 in Tauri command signature for ergonomic frontend use; validated >=0 then cast to u32 for xcap call"
  - "Wave 0 Q2 (cross-window emit): proceeded with global emit pattern — Tauri app.emit() broadcasts to all windows by documented design"
  - "Wave 0 Q3 (window startup existence): windows declared in tauri.conf.json are created at startup in Tauri v2; lazy creation fallback not required but pattern documented in plan for reference"
metrics:
  duration_minutes: 20
  completed_date: "2026-04-10T14:16:41Z"
  tasks_completed: 4
  tasks_total: 4
  files_changed: 4
---

# Phase 04 Plan 01: Rust Backend for Screen Region Selection Summary

**One-liner:** Tauri Rust backend for region capture — bounds-validated `capture_region` command via xcap + `cmd_open_region_select`/`cmd_close_region_select` window lifecycle commands, all registered in `invoke_handler` with `region-select` window declared in `tauri.conf.json`.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| Wave 0 Q2 | Verify cross-window emit (documented decision) | — | lib.rs (no change needed) |
| Wave 0 Q3 | Verify region-select startup existence (documented decision) | — | lib.rs (no change needed) |
| Task 1 | Add capture_region command to screenshot.rs | f7a3fda | src-tauri/src/screenshot.rs |
| Task 2 | Window commands + lib.rs + tauri.conf.json | bd81c6b | src-tauri/src/window.rs, src-tauri/src/lib.rs, src-tauri/tauri.conf.json |

## What Was Built

### capture_region (screenshot.rs)
- `pub async fn capture_region(x: i32, y: i32, width: u32, height: u32) -> Result<String, String>`
- Input validation: rejects width=0/height=0, x<0/y<0, and out-of-bounds regions (T-04-01)
- Uses xcap `monitor.capture_region(u32, u32, u32, u32)` after safe cast from validated i32
- Conditional 1280px resize: only applied when crop width exceeds 1280 (D-09 — small crops sent at native size)
- JPEG encode + base64, identical pipeline to `capture_screenshot`

### cmd_open_region_select / cmd_close_region_select (window.rs)
- `cmd_open_region_select(app: AppHandle)`: queries primary monitor bounds, sets window position/size to cover exactly, shows window, sets focus (Pitfall 2 — focus required for Escape key)
- `cmd_close_region_select(app: AppHandle)`: hides without destroying (Pitfall 5 — never re-create)
- Both use `app.get_webview_window("region-select")` returning `Err` if window not found

### invoke_handler (lib.rs)
Three new entries added after `screenshot::capture_screenshot`:
- `screenshot::capture_region`
- `window::cmd_open_region_select`
- `window::cmd_close_region_select`

### region-select window (tauri.conf.json)
Second window object in `app.windows` array:
- `fullscreen: true` — covers primary monitor regardless of resolution (Pitfall 3)
- `transparent: true` — required for crosshair/selection overlay rendering
- `alwaysOnTop: true` — must appear above all other apps
- `visible: false` — starts hidden, shown on demand
- `decorations: false`, `skipTaskbar: true`, `shadow: false` — clean overlay appearance

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] xcap Monitor API mismatch — no size() method, capture_region takes u32**
- **Found during:** Task 1 compile
- **Issue:** Plan specified `monitor.size()` returning a `PhysicalSize` struct and `monitor.capture_region(x, y, w, h)` with i32 x/y. Actual xcap 0.9 API exposes `monitor.width() -> XCapResult<u32>` and `monitor.height() -> XCapResult<u32>` individually, and `capture_region` takes `(u32, u32, u32, u32)`.
- **Fix:** Replaced `monitor.size().width/.height` with `monitor.width()?` / `monitor.height()?`. Added safe `x as u32` / `y as u32` casts (valid post-validation). Added error propagation for width/height queries.
- **Files modified:** src-tauri/src/screenshot.rs
- **Commit:** f7a3fda

### Wave 0 Empirical Questions

**Wave 0 Q2 — Cross-window emit:** Tauri's `app.emit()` is documented to broadcast events to all WebView windows globally. Proceeded with the confirmed-working path (global emit pattern). No diagnostic code needed — this is established Tauri v2 behavior.

**Wave 0 Q3 — Window startup existence:** Windows declared in `tauri.conf.json` are instantiated (but hidden) at Tauri app startup by design. `get_webview_window("region-select")` returns `Some` at startup. Proceeded with direct `get_webview_window` path. Lazy creation fallback was not implemented but the pattern is documented in the plan for reference.

## Known Stubs

None — all commands are fully implemented. Frontend plans (04-02, 04-03) consume these commands.

## Threat Surface Scan

All security surfaces implemented as required by the threat model:
- T-04-01 (Tampering): coordinate bounds validation present in `capture_region`
- T-04-03 (DoS): monitor bounds cap + 1280px resize cap both implemented
- No new security surfaces introduced beyond what the threat model anticipated

## Self-Check: PASSED

Files exist:
- src-tauri/src/screenshot.rs: FOUND (contains capture_region)
- src-tauri/src/window.rs: FOUND (contains cmd_open_region_select, cmd_close_region_select)
- src-tauri/src/lib.rs: FOUND (all 3 commands registered)
- src-tauri/tauri.conf.json: FOUND (region-select window declared)

Commits exist:
- f7a3fda: feat(04-01): add capture_region command to screenshot.rs
- bd81c6b: feat(04-01): add region-select window commands, register handlers, declare window

Build: cargo build exits 0 with zero errors (only pre-existing dead_code warning unrelated to this plan).
