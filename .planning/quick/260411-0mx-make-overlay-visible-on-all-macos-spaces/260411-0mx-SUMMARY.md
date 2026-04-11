---
phase: quick
plan: 260411-0mx
subsystem: window-management
tags: [overlay, macos, spaces, tauri-config]
dependency_graph:
  requires: []
  provides: [overlay-visible-all-spaces]
  affects: [overlay-window, toggle-behavior]
tech_stack:
  added: []
  patterns: [declarative-tauri-window-config]
key_files:
  modified:
    - src-tauri/tauri.conf.json
decisions:
  - "Used declarative visibleOnAllWorkspaces in tauri.conf.json over programmatic set_visible_on_all_workspaces() — applied at window creation by Tauri, no setup code needed, survives window recreation"
metrics:
  duration: ~2min
  completed: 2026-04-11
---

# Quick Task 260411-0mx: Make Overlay Visible on All macOS Spaces — Summary

**One-liner:** Added `visibleOnAllWorkspaces: true` to overlay window config so toggling from any Space shows the overlay on the current Space, not the original launch Space.

## What Was Done

Single field added to the `overlay` window entry in `src-tauri/tauri.conf.json`:

```json
"visibleOnAllWorkspaces": true
```

Placed immediately after `"alwaysOnTop": true`. The `region-select` window was left unchanged — it only needs standard workspace behavior.

## Verification

- `cargo check` passed (21.91s, no errors)
- `overlay` window config contains `visibleOnAllWorkspaces: true`
- `region-select` window config does NOT contain `visibleOnAllWorkspaces`
- Tauri 2.10.3 / tauri-utils-2.8.3 confirm the field exists in `WindowConfig` with serde alias `visible-on-all-workspaces`

## Deviations from Plan

None — plan executed exactly as written.

## Commits

| Task | Commit | Files |
|------|--------|-------|
| 1: Add visibleOnAllWorkspaces to overlay window config | `182829d` | `src-tauri/tauri.conf.json` |

## Human Verification Required

The plan includes a `checkpoint:human-verify` gate. To verify:

1. Run `cargo tauri dev` from the project root
2. Open Mission Control, switch to a second Space
3. Press the overlay shortcut (Ctrl+Shift+Space)
4. Expected: overlay appears on the current Space (Space 2), not stranded on Space 1
5. Toggle on/off and switch Spaces — overlay should follow the active Space

## Known Stubs

None.

## Threat Flags

None — `visibleOnAllWorkspaces` on an already-visible-to-user overlay does not introduce new security surface (T-0mx-01 accepted per threat model).

## Self-Check: PASSED

- `src-tauri/tauri.conf.json` modified and valid JSON
- Commit `182829d` exists in git log
- `cargo check` passed with no errors
