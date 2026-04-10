# Phase 4: Screen Region Selection - Context

**Gathered:** 2026-04-10
**Status:** Ready for planning

<domain>
## Phase Boundary

User can draw a bounding box over any part of the screen to focus AI attention on a specific area. That crop — not the full screenshot — is sent as Claude's visual context, producing more targeted guidance. Region selection is optional; if no region is selected, full-screen capture (Phase 2 behavior) applies. This phase adds one new Tauri window (selection overlay), one new Rust command (`capture_region`), and sidebar UI changes to show the region button and thumbnail preview.

</domain>

<decisions>
## Implementation Decisions

### Selection Trigger
- **D-01:** Region selection is triggered by a **button in the sidebar UI** — a crop/region icon the user clicks. No dedicated global keyboard shortcut.
- **D-02:** When the user clicks the button, the sidebar temporarily hides, and a full-screen transparent selection overlay appears for drawing.

### Region + Intent Flow
- **D-03:** Flow is **select region first, then type intent** — "aim then ask." User draws the region, sidebar reappears, then user types and submits. Region is locked in before the query is written.
- **D-04:** Region selection is **optional on every query** — if user submits without selecting a region, full-screen capture (Phase 2 D-01/D-02 behavior) is used as fallback.

### Region Confirmation in Sidebar
- **D-05:** After drawing, the sidebar reappears with a **thumbnail preview** of the selected crop displayed above the input field. This lets the user confirm what will be sent before typing.
- **D-06:** The thumbnail has an **X button** to clear/reset the selection back to full-screen mode.
- **D-07:** Region selection **resets after each submit** — each question starts fresh. Region is not persisted across queries.

### Region Capture
- **D-08:** The selected region **replaces** the full screenshot for that query — only the crop is sent to Claude, not the full monitor image.
- **D-09:** Coordinate system must account for display scaling (HiDPI / Retina) — pixel coordinates on macOS 2× displays are 2× the logical coordinates.

### Selection Overlay Behavior
- **D-10:** The overlay covers the full screen (all monitors or primary monitor — Claude's discretion). Esc cancels and restores sidebar without selecting anything.
- **D-11:** User draws a rubber-band rectangle by clicking and dragging. Visual treatment of the overlay (dimming, crosshair cursor, selection highlight color) is Claude's discretion.

### Claude's Discretion
- Full-screen overlay window config (Tauri window type, z-order, transparency level)
- Dimming/visual treatment during region selection (how dark, what color highlights the selected rect)
- Whether to use a new Tauri window or transform the existing overlay window for selection mode
- Resize behavior for the cropped region (apply same 1280px cap from D-03 Phase 2, or send at native crop size)
- Mouse event capture approach on macOS (Tauri window input passthrough vs dedicated event listener)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project Context
- `.planning/PROJECT.md` — Core value, constraints, key decisions
- `.planning/REQUIREMENTS.md` — v1 requirement: SCRN-01

### Prior Phase Artifacts
- `.planning/phases/01-infrastructure-app-shell/01-CONTEXT.md` — D-14 (macOSPrivateApi: true, transparent windows available), D-06/D-07 (overlay toggle shortcut — do not conflict)
- `.planning/phases/02-core-ai-loop/02-CONTEXT.md` — D-01 (capture on submit), D-02 (full primary monitor via xcap), D-03 (1280px JPEG 80%), D-07 (clear and replace on new submit)

### Existing Code — Integration Points
- `src-tauri/src/screenshot.rs` — `capture_screenshot` command to extend with `capture_region(x, y, w, h)` variant
- `src/components/SidebarShell.tsx` — State machine to extend: add region selection state, hide/show sidebar around overlay, pass region to submit
- `src/lib/tauri.ts` — IPC wrappers to extend for region selection commands and events
- `src/components/TextInput.tsx` — May need region indicator/thumbnail above it, or add to SidebarShell layout

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `screenshot.rs`: xcap + image crate pipeline already wired — add `capture_region` that crops by (x, y, w, h) before JPEG encode
- `SidebarShell.tsx`: ContentState signal + Show pattern — add "selecting" state for when overlay is open
- `tauri.ts`: IPC wrapper pattern established — add `startRegionSelect()`, `onRegionSelected(callback)` wrappers

### Established Patterns
- Tauri `#[tauri::command]` for Rust → TS IPC
- Tauri events (`emit`) for async results back to frontend (same pattern as `stt-partial` / `stt-final`)
- `createSignal` + `Show` for reactive SolidJS state in SidebarShell
- CSS custom properties for theming

### Integration Points
- **New Tauri window:** Full-screen transparent selection overlay (separate from sidebar overlay window)
- **New Rust command:** `capture_region(x: i32, y: i32, width: u32, height: u32)` — crops xcap image, JPEG encodes, returns base64
- **New Tauri event:** `region-selected { x, y, width, height, thumbnail_b64 }` — emitted when user finishes drawing
- **Modified:** `SidebarShell.handleSubmit` — uses `captureRegion(coords)` instead of `captureScreenshot()` when region is set
- **Modified:** Sidebar layout — thumbnail preview + clear button above `TextInput` when region is set

</code_context>

<specifics>
## Specific Ideas

- "Aim then ask" mental model is key — the user points at what they care about before framing the question. This matches how humans naturally communicate ("look at this — what do I do?")
- Thumbnail preview in the sidebar is a trust signal — user sees exactly what Claude will see before committing to the query
- Esc to cancel during region draw must always restore sidebar — user should never feel trapped in selection mode

</specifics>

<deferred>
## Deferred Ideas

- **Keyboard shortcut for region selection** — Could be added later if power users want to trigger without touching sidebar. Not in scope for v1.
- **Region persistence across queries** — Keep the same region for follow-up questions. Useful UX but adds complexity; deferred to later.
- **Multi-monitor selection** — Which monitor to draw on, or allow spanning monitors. V1 targets primary monitor only.
- **Annotation mode** — Drawing arrows or circles on the screenshot before sending. VIS-01 in v2 requirements.

</deferred>

---

*Phase: 04-screen-region-selection*
*Context gathered: 2026-04-10*
