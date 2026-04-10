---
phase: 04-screen-region-selection
plan: "03"
subsystem: frontend
tags: [region-selection, solidjs, sidebar, thumbnail-preview, crop-button, ipc]
dependency_graph:
  requires: [04-01, 04-02]
  provides: [sidebar-region-integration, crop-button, thumbnail-preview, region-aware-submit]
  affects: [src/components/SidebarShell.tsx, src/components/TextInput.tsx]
tech_stack:
  added: []
  patterns: [region-state-machine, thumbnail-data-uri, region-aware-submit-branch, unlisten-cleanup]
key_files:
  created: []
  modified:
    - src/components/SidebarShell.tsx
    - src/components/TextInput.tsx
decisions:
  - "thumbnailB64 show condition requires BOTH selectedRegion and thumbnailB64 non-null — thumbnail capture failure degrades gracefully (region still submitted)"
  - "ContentState 'selecting' used to prevent accidental interactions during region draw; sidebar is visually covered by the region-select overlay window, not hidden"
  - "Region reset (setSelectedRegion(null)) happens at submit start using captured 'region' const — avoids race between reset and captureRegion call"
metrics:
  duration_minutes: 15
  completed_date: "2026-04-10T15:00:00Z"
  tasks_completed: 2
  tasks_total: 2
  files_changed: 2
---

# Phase 04 Plan 03: Sidebar Region Selection Integration Summary

**One-liner:** SidebarShell wired to region selection state machine — Crop button in TextInput opens rubber-band overlay, onRegionSelected/onRegionCancelled listeners capture thumbnail and restore sidebar, submitIntent branches captureRegion vs captureScreenshot based on selectedRegion signal, region resets after every submit.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| Task 1 | Wire region selection into SidebarShell.tsx (state, listeners, thumbnail, submit branch) | 371c8ac | src/components/SidebarShell.tsx |
| Task 2 | Add Crop button to TextInput.tsx | daf5d3e | src/components/TextInput.tsx |

## What Was Built

### SidebarShell.tsx changes

**ContentState extension:**
- Added `"selecting"` to ContentState union type for region selection in-progress state

**New signals:**
- `selectedRegion: Signal<RegionCoords | null>` — stores physical pixel coords from region-selected event
- `thumbnailB64: Signal<string | null>` — stores base64 JPEG of selected crop for preview

**New event listeners (registered in onMount, cleaned up in onCleanup):**
- `onRegionSelected`: closes overlay window, stores coords, sets contentState to "empty", captures thumbnail via `captureRegion`
- `onRegionCancelled`: closes overlay window, restores contentState to "empty" without setting region (full-screen fallback preserved)

**New handlers:**
- `handleRegionSelect()`: sets contentState to "selecting", calls `openRegionSelect()`
- `handleClearRegion()`: resets selectedRegion and thumbnailB64 to null

**submitIntent branch (D-08):**
- When `selectedRegion()` is set: calls `captureRegion(region)` — sends crop to Claude
- When null: calls `captureScreenshot()` — full-screen fallback (no regression)
- Region reset (`setSelectedRegion(null)`, `setThumbnailB64(null)`) immediately after capture call (D-07)

**Thumbnail preview JSX (above TextInput):**
- `<Show when={selectedRegion() !== null && thumbnailB64() !== null}>` — renders only when both are set
- `<img src="data:image/jpeg;base64,...">` with 80px max height, cover fit
- Dimensions label: `{width} × {height}` in physical pixels
- X clear button (absolute top-right, 44px touch target, `aria-label="Clear selected region"`)
- Fade-in animation via `thumbnailFadeIn` keyframe

**TextInput props added:**
- `onRegionSelect={handleRegionSelect}` — wires Crop button click
- `regionActive={selectedRegion() !== null}` — drives icon accent color

### TextInput.tsx changes

- Added `Crop` to lucide-solid import alongside existing `Mic, Send`
- Extended `TextInputProps` with `onRegionSelect?: () => void` and `regionActive?: boolean`
- Inserted Crop button immediately before Send button:
  - Rendered conditionally: `{props.onRegionSelect && (...)}`
  - `aria-label="Select screen region"`, `aria-pressed` reflects regionActive
  - Idle: `color-text-secondary`; active: `color-accent`
  - 44px min-height/min-width touch target
  - Disabled when `props.disabled` (needsPermission) is true

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — all signals are wired to real IPC calls. The thumbnail preview renders actual base64 JPEG from `captureRegion`. The submit branch calls real Rust commands.

## Threat Surface Scan

- T-04-08 (Information Disclosure): thumbnailB64 stored in SolidJS signal, in-memory only, not persisted. Cleared on submit and X click — matches threat model disposition (accept).
- T-04-09 (Tampering): region-selected coords pass through SidebarShell to `captureRegion`. Rust `capture_region` validates bounds (Plan 01 T-04-01). No additional frontend validation added — Rust is the authoritative gate per threat model (mitigate).
- T-04-10 (DoS): `"selecting"` ContentState is set before `openRegionSelect()` call — second Crop button click while selecting would call `openRegionSelect()` again, but `cmd_open_region_select` is idempotent (show on already-visible window). Per threat model, this is accepted behavior (mitigate).

No new security surfaces introduced beyond what the threat model anticipated.

## Self-Check: PASSED

Files exist:
- src/components/SidebarShell.tsx: FOUND (contains selectedRegion, thumbnailB64, onRegionSelected listener, captureRegion branch)
- src/components/TextInput.tsx: FOUND (contains Crop button, onRegionSelect prop, regionActive prop)

Commits exist:
- 371c8ac: feat(04-03): wire region selection into SidebarShell + add Crop button to TextInput
- daf5d3e: feat(04-03): add Crop button to TextInput component

TypeScript compile: zero errors (npx tsc --noEmit exits 0)
