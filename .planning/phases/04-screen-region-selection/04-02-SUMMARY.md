---
phase: 04-screen-region-selection
plan: "02"
subsystem: frontend
tags: [region-selection, solidjs, ipc, tauri-events, rubber-band, overlay]
dependency_graph:
  requires: [04-01]
  provides: [RegionSelect-component, region-select-routing, region-selection-ipc-wrappers]
  affects: [src/components/RegionSelect.tsx, src/index.tsx, src/lib/tauri.ts]
tech_stack:
  added: []
  patterns: [hash-based-routing, rubber-band-drawing, hidpi-logical-to-physical, tauri-global-emit, tauri-listen-event]
key_files:
  created:
    - src/components/RegionSelect.tsx
  modified:
    - src/index.tsx
    - src/lib/tauri.ts
decisions:
  - "Hash-based routing in index.tsx — no router package; window.location.hash check is sufficient for two-window Tauri app"
  - "RegionCoords defined in both RegionSelect.tsx (for component) and tauri.ts (for IPC consumers) — both export the same shape, no shared types file needed at this stage"
metrics:
  duration_minutes: 15
  completed_date: "2026-04-10T14:30:00Z"
  tasks_completed: 2
  tasks_total: 2
  files_changed: 3
---

# Phase 04 Plan 02: Frontend Region Selection Overlay Summary

**One-liner:** SolidJS rubber-band overlay component with HiDPI-aware physical coordinate conversion, hash-based routing for the region-select Tauri window, and full IPC wrappers (openRegionSelect, closeRegionSelect, captureRegion, onRegionSelected, onRegionCancelled).

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| Task 1 | Create RegionSelect.tsx — full-screen rubber-band drawing overlay | 3d135e9 | src/components/RegionSelect.tsx |
| Task 2 | Update index.tsx routing + extend tauri.ts IPC wrappers | 9b396d5 | src/index.tsx, src/lib/tauri.ts |

## What Was Built

### RegionSelect.tsx (src/components/RegionSelect.tsx)
- Full-screen fixed overlay with `cursor: crosshair` and `rgba(0,0,0,0.35)` scrim
- `tabIndex={0}` on root div with `containerRef?.focus()` in `onMount` — captures Escape key without extra document listeners
- Drag state tracked via `createSignal<DragState | null>` — startX/Y, endX/Y, dragging flag
- `logicalRect()` derived accessor computes normalized CSS rect (handles all drag directions)
- Rubber-band rectangle: `2px solid #007AFF` border, `rgba(0,122,255,0.12)` fill, pointer-events none
- Instruction text `"Drag to select a region • Esc to cancel"` shown only when not dragging via `<Show>`
- `onMouseUp`: minimum size guard (w < 10 || h < 10 → cancel), then `getCurrentWindow().scaleFactor()` converts logical→physical coords before `emit("region-selected", coords)`
- Escape key: calls `cancel()` which emits `emit("region-cancelled", {})`
- Exports: `RegionCoords` interface and `RegionSelect` function component

### index.tsx (src/index.tsx)
- Reads `window.location.hash` at render time
- Routes `#/select` (and `#/select/...`) to `<RegionSelect />` for the region-select window
- All other paths render `<App />` as before — zero regression to main overlay window

### tauri.ts IPC wrappers (src/lib/tauri.ts)
Five new exports appended after existing Phase 3 exports:
- `RegionCoords` — interface with physical pixel x/y/width/height
- `openRegionSelect()` → `invoke("cmd_open_region_select")`
- `closeRegionSelect()` → `invoke("cmd_close_region_select")`
- `captureRegion(coords)` → `invoke<string>("capture_region", { x, y, width, height })`
- `onRegionSelected(cb)` → `listen<RegionCoords>("region-selected", ...)`
- `onRegionCancelled(cb)` → `listen("region-cancelled", ...)`
All pre-existing exports (checkScreenPermission through onSttError) preserved unchanged.

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — all exports are fully wired to real Tauri IPC. Plan 03 (SidebarShell) will consume `onRegionSelected`, `onRegionCancelled`, `openRegionSelect`, `closeRegionSelect`, and `captureRegion`.

## Threat Surface Scan

No new security surfaces introduced beyond what the threat model anticipated:
- T-04-05: region-selected payload coordinates are validated in Rust `capture_region` (Plan 01) — defense-in-depth is already in place
- T-04-06: RegionSelect overlay is user-initiated; Esc always cancels; no user trap possible
- T-04-07: show/hide calls are idempotent (Plan 01 implementation)

## Self-Check: PASSED

Files exist:
- src/components/RegionSelect.tsx: FOUND
- src/index.tsx: FOUND (contains #/select routing)
- src/lib/tauri.ts: FOUND (contains all 5 new exports)

Commits exist:
- 3d135e9: feat(04-02): add RegionSelect.tsx full-screen rubber-band drawing overlay
- 9b396d5: feat(04-02): hash-based routing in index.tsx + region selection IPC wrappers in tauri.ts

TypeScript compile: zero errors (npx tsc --noEmit exits 0)
