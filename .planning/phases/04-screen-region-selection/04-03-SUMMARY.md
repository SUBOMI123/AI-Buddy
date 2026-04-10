---
phase: 04-screen-region-selection
plan: "03"
subsystem: frontend
tags: [region-selection, solidjs, sidebar, thumbnail-preview, crop-button, ipc, debugging]
dependency_graph:
  requires: [04-01, 04-02]
  provides: [sidebar-region-integration, crop-button, thumbnail-preview, region-aware-submit]
  affects: [src/components/SidebarShell.tsx, src/components/TextInput.tsx, src/components/RegionSelect.tsx, src-tauri/src/window.rs, src-tauri/src/lib.rs]
tech_stack:
  added: []
  patterns: [region-state-machine, thumbnail-data-uri, region-aware-submit-branch, unlisten-cleanup, rust-ipc-for-js-suspend-race, logical-vs-physical-coordinates]
key_files:
  created: []
  modified:
    - src/components/SidebarShell.tsx
    - src/components/TextInput.tsx
    - src/components/RegionSelect.tsx
    - src-tauri/src/window.rs
    - src-tauri/src/lib.rs
decisions:
  - "thumbnailB64 show condition requires BOTH selectedRegion and thumbnailB64 non-null — thumbnail capture failure degrades gracefully (region still submitted)"
  - "ContentState 'selecting' used to prevent accidental interactions during region draw; sidebar is visually covered by the region-select overlay window, not hidden"
  - "Region reset (setSelectedRegion(null)) happens at submit start using captured 'region' const — avoids race between reset and captureRegion call"
  - "xcap capture_region() uses CGDisplayBounds logical point coordinates throughout — scaleFactor() multiplication was incorrect and removed"
  - "Region confirm/cancel routed through Rust IPC commands (cmd_confirm_region, cmd_cancel_region) rather than direct JS event emit to avoid JS suspend race condition when overlay window loses focus"
  - "Mouse events bound to document.addEventListener rather than div element to reliably capture mouseup outside element bounds"
metrics:
  duration_minutes: 90
  completed_date: "2026-04-10T16:00:00Z"
  tasks_completed: 3
  tasks_total: 3
  files_changed: 5
---

# Phase 04 Plan 03: Sidebar Region Selection Integration Summary

**One-liner:** SidebarShell wired to region selection state machine with Crop button, thumbnail preview, and region-aware submit — plus 5 post-implementation fixes resolving JS suspend race, document-level mouse capture, logical coordinate system mismatch, cross-window event delivery, and instruction pill visibility.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| Task 1 | Wire region selection into SidebarShell.tsx (state, listeners, thumbnail, submit branch) | 371c8ac | src/components/SidebarShell.tsx |
| Task 2 | Add Crop button to TextInput.tsx | daf5d3e | src/components/TextInput.tsx |
| Task 3 (checkpoint) | Human verification: end-to-end region selection flow | PASSED | — |

## What Was Built

### SidebarShell.tsx changes

**ContentState extension:**
- Added `"selecting"` to ContentState union type for region selection in-progress state

**New signals:**
- `selectedRegion: Signal<RegionCoords | null>` — stores logical point coords from region-selected event
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
- Dimensions label: `{width} × {height}` in logical points
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

### Post-verification fixes (RegionSelect.tsx, window.rs, lib.rs)

Five bugs were discovered and fixed during human verification:

1. **JS suspend race** — confirm/cancel now routes through Rust IPC (`cmd_confirm_region`, `cmd_cancel_region`) rather than direct `emit()`, eliminating the race where the JS context was suspended when the overlay window lost focus.
2. **Mouse event capture** — `mousedown`/`mousemove`/`mouseup` moved from div element listeners to `document.addEventListener` to reliably capture mouseup events outside element bounds.
3. **Logical coordinate mismatch** — removed `scaleFactor()` multiplication. xcap's `capture_region()` uses CGDisplayBounds logical points throughout; sending physical pixel coords caused the Rust bounds check to reject valid regions silently.
4. **Cross-window event delivery** — fullscreen conflict resolved; event delivery path corrected to ensure `region-selected` / `region-cancelled` reliably arrive at the sidebar window.
5. **Instruction pill visibility** — repositioned pill to `top: 56px` (clears macOS menu bar at ~25px), added dark background (`rgba(0,0,0,0.72)` + backdrop-blur), increased text weight and opacity for legibility.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] JS suspend race — confirm/cancel event delivery unreliable via direct emit**
- **Found during:** Human verification (step 6 — overlay closed but thumbnail did not appear)
- **Issue:** When the region-select overlay window loses focus after mouseup, the JS context can be suspended before `emit("region-selected")` fires. The sidebar window never receives the event.
- **Fix:** Added `cmd_confirm_region` and `cmd_cancel_region` Tauri commands in `window.rs`. RegionSelect.tsx invokes these commands; the Rust handler emits the event from the backend where no JS suspend can occur.
- **Files modified:** src-tauri/src/window.rs, src-tauri/src/lib.rs, src/components/RegionSelect.tsx
- **Commit:** 8461af2

**2. [Rule 1 - Bug] Mouse events bound to div element — mouseup missed when cursor leaves element**
- **Found during:** Human verification (drag outside element boundary failed to confirm region)
- **Issue:** `onMouseUp` bound to the overlay div; releasing the mouse outside the div did not fire the handler, leaving a stuck dragging state.
- **Fix:** Moved all three mouse handlers to `document.addEventListener` with cleanup in onCleanup.
- **Files modified:** src/components/RegionSelect.tsx
- **Commit:** 519d34a

**3. [Rule 1 - Bug] scaleFactor() multiplication produced physical pixel coords — xcap rejects them**
- **Found during:** Human verification (thumbnail never appeared; debug investigation in region-select-no-thumbnail.md)
- **Issue:** RegionSelect.tsx multiplied CSS logical coords by `scaleFactor()` before sending to `cmd_confirm_region`. xcap's `capture_region()` and its Rust bounds check both use CGDisplayBounds logical points. Physical pixel coords (2x on Retina) exceeded logical monitor dimensions → Rust returned an error → `catch` block set `thumbnailB64(null)` silently → Show condition failed.
- **Fix:** Removed `scaleFactor()` call entirely. Raw logical CSS coordinates sent directly to Rust.
- **Files modified:** src/components/RegionSelect.tsx
- **Commit:** cd77efd

**4. [Rule 1 - Bug] Cross-window event delivery / fullscreen conflict**
- **Found during:** Human verification (overlay did not close after region confirmed in some runs)
- **Issue:** Fullscreen window configuration conflicted with Tauri event delivery on macOS; `region-selected` / `region-cancelled` were not reliably delivered to the sidebar window in all code paths.
- **Fix:** Resolved routing via the Rust-side emit added in fix #1; also corrected window configuration to avoid fullscreen conflicts.
- **Files modified:** src-tauri/src/window.rs, src/components/RegionSelect.tsx
- **Commit:** 586b09a

**5. [Rule 2 - Missing critical functionality] Instruction pill invisible behind macOS menu bar**
- **Found during:** Human verification (step 3 — instruction text not visible)
- **Issue:** Pill positioned at `top: 0`, hidden behind the macOS menu bar (~25px). Bare text without background had insufficient contrast on light screens.
- **Fix:** Repositioned to `top: 56px`, added dark pill background (`rgba(0,0,0,0.72)` + `backdrop-filter: blur`), increased text weight to 500 and opacity to 0.95.
- **Files modified:** src/components/RegionSelect.tsx
- **Commit:** cd2b882

## Known Stubs

None — all signals are wired to real IPC calls. The thumbnail preview renders actual base64 JPEG from `captureRegion`. The submit branch calls real Rust commands.

## Threat Surface Scan

- T-04-08 (Information Disclosure): thumbnailB64 stored in SolidJS signal, in-memory only, not persisted. Cleared on submit and X click — matches threat model disposition (accept).
- T-04-09 (Tampering): region-selected coords pass through SidebarShell to `captureRegion`. Rust `capture_region` validates bounds (Plan 01 T-04-01). No additional frontend validation added — Rust is the authoritative gate per threat model (mitigate).
- T-04-10 (DoS): `"selecting"` ContentState is set before `openRegionSelect()` call — second Crop button click while selecting would call `openRegionSelect()` again, but `cmd_open_region_select` is idempotent (show on already-visible window). Per threat model, this is accepted behavior (mitigate).

New surface: `cmd_confirm_region` and `cmd_cancel_region` are new Tauri IPC endpoints added as a deviation fix. Both are invoked only from the region-select WebView window (same origin, same app binary). No external trust boundary crossed. Threat model not materially changed.

## Self-Check: PASSED

Files exist:
- src/components/SidebarShell.tsx: FOUND (contains selectedRegion, thumbnailB64, onRegionSelected listener, captureRegion branch)
- src/components/TextInput.tsx: FOUND (contains Crop button, onRegionSelect prop, regionActive prop)
- src/components/RegionSelect.tsx: FOUND (contains cmd_confirm_region invoke, document.addEventListener, no scaleFactor, pill at top:56px)
- src-tauri/src/window.rs: FOUND (contains cmd_confirm_region, cmd_cancel_region)
- src-tauri/src/lib.rs: FOUND (cmd_confirm_region and cmd_cancel_region registered in invoke_handler)

Commits exist:
- 371c8ac: feat(04-03): wire region selection into SidebarShell + add Crop button to TextInput
- daf5d3e: feat(04-03): add Crop button to TextInput component
- 586b09a: fix(04-03): fix cross-window event delivery and fullscreen conflict
- 519d34a: fix(04-03): bind mouse events to document, not div element
- 8461af2: fix(04-03): route region confirm/cancel through Rust to fix JS suspend race
- cd77efd: fix(04-03): send logical coords to capture_region, not physical pixels
- cd2b882: fix(04-03): fix instruction pill visibility — clear menu bar, add contrast

Human verification: PASSED — all 11 steps confirmed by user.
TypeScript compile: zero errors (npx tsc --noEmit exits 0)
