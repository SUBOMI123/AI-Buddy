# Phase 4: Screen Region Selection - Research

**Researched:** 2026-04-10
**Domain:** Tauri v2 multi-window, image cropping, HiDPI coordinate mapping, SolidJS UI
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Region selection triggered by a button in the sidebar UI (crop/region icon). No dedicated global keyboard shortcut.
- **D-02:** When button is clicked, sidebar temporarily hides and a full-screen transparent selection overlay appears for drawing.
- **D-03:** Flow is "select region first, then type intent." User draws the region, sidebar reappears, then user types and submits.
- **D-04:** Region selection is optional on every query. If user submits without selecting a region, full-screen capture (Phase 2 behavior) is used as fallback.
- **D-05:** After drawing, the sidebar reappears with a thumbnail preview of the selected crop displayed above the input field.
- **D-06:** The thumbnail has an X button to clear/reset the selection back to full-screen mode.
- **D-07:** Region selection resets after each submit — each question starts fresh. Region is not persisted across queries.
- **D-08:** The selected region replaces the full screenshot for that query — only the crop is sent to Claude.
- **D-09:** Coordinate system must account for display scaling (HiDPI / Retina) — pixel coordinates on macOS 2x displays are 2x the logical coordinates.
- **D-10:** The overlay covers the full screen (primary monitor). Esc cancels and restores sidebar without selecting anything.
- **D-11:** User draws a rubber-band rectangle by clicking and dragging. Visual treatment is Claude's discretion.

### Claude's Discretion

- Full-screen overlay window config (Tauri window type, z-order, transparency level)
- Dimming/visual treatment during region selection (how dark, what color highlights the selected rect)
- Whether to use a new Tauri window or transform the existing overlay window for selection mode
- Resize behavior for the cropped region (apply same 1280px cap from Phase 2 D-03, or send at native crop size)
- Mouse event capture approach on macOS

### Deferred Ideas (OUT OF SCOPE)

- Keyboard shortcut for region selection
- Region persistence across queries
- Multi-monitor selection
- Annotation mode (VIS-01, v2)
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SCRN-01 | User can box-select or highlight a screen region to focus AI attention on a specific area | Full-screen overlay window pattern + xcap `capture_region` + HiDPI coordinate conversion + SolidJS rubber-band UI |
</phase_requirements>

---

## Summary

Phase 4 adds screen region selection to the AI Buddy loop. The core mechanic requires three layered pieces working together: (1) a full-screen transparent Tauri window that captures mouse drag events for rubber-band rectangle drawing, (2) a Rust `capture_region` command extending the existing xcap pipeline to crop before JPEG encode, and (3) sidebar UI changes in SolidJS to show a region button, thumbnail preview, and clear button.

The implementation is well-supported by the existing stack. xcap already exposes a `capture_region(x, y, w, h)` method on `Monitor` that accepts physical pixel coordinates and returns an `image::RgbaImage`. The existing `screenshot.rs` pipeline (resize → JPEG 80% → base64) simply needs a crop step inserted before the resize. The critical complexity is coordinate space: browser mouse events deliver logical pixels, xcap expects physical pixels, and macOS Retina doubles the scale factor. The conversion is one multiply (`logical * scale_factor`), and Tauri exposes `scale_factor()` on `Monitor` and via the JS `dpi` API.

For the overlay window, Tauri v2's `WebviewWindowBuilder` supports all required properties (`transparent`, `always_on_top`, `decorations(false)`, `fullscreen`). The recommended approach is a second Tauri window with label `"region-select"` created on demand via a Rust command and routed to a dedicated SolidJS component via URL hash (`/#/select`). This keeps the sidebar and overlay in separate rendering contexts.

**Primary recommendation:** New Tauri window (`"region-select"`) created lazily from Rust on button press, destroyed (or hidden) after selection or Esc. Selection coordinates passed from overlay window to sidebar window via Tauri `emit_to`. xcap `capture_region` called at submit time with physical coordinates stored from the selection event.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| xcap | 0.9 (in Cargo.toml) | `capture_region(x, y, w, h)` to capture sub-rectangle | Already in project; exposes `capture_region` natively — no additional crate needed |
| image crate | 0.25 (in Cargo.toml) | `imageops::crop_imm` or `DynamicImage::crop` for sub-image after full capture (fallback) | Already in project |
| tauri `WebviewWindowBuilder` | 2.10.3 (Tauri version in use) | Create full-screen transparent overlay window at runtime | Standard Tauri v2 API for runtime window creation |
| `@tauri-apps/api` | 2.10.1 (installed) | `getCurrentWindow().scaleFactor()`, `dpi.LogicalPosition`, `dpi.PhysicalPosition` | Already installed; provides JS-side DPI conversion |
| lucide-solid | 1.8.0 (installed) | `Crop` or `Scissors` icon for region button; `X` icon for clear | Already installed |
| solid-js | 1.9.3 (installed) | SolidJS signals for overlay drawing state | Already the project frontend |

[VERIFIED: Cargo.toml and package.json in project]

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `image::imageops::crop_imm` | 0.25 | Immutable crop of DynamicImage if using full capture + software crop | Use if `xcap::Monitor::capture_region` has platform issues; software fallback |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| New `region-select` Tauri window | Repurpose existing `overlay` window | Repurposing is simpler but couples sidebar rendering to overlay state machine; new window is cleaner separation |
| xcap `capture_region` (physical coords) | Full capture + software crop | `capture_region` is more efficient (doesn't capture full monitor then discard); software crop is a valid fallback |

**Installation:** No new dependencies required. All needed libraries are already in `Cargo.toml` and `package.json`.

---

## Architecture Patterns

### Recommended Project Structure

```
src-tauri/src/
├── screenshot.rs           # ADD: capture_region command
├── window.rs               # ADD: cmd_open_region_select, cmd_close_region_select
├── lib.rs                  # ADD: register new commands in invoke_handler
src/
├── components/
│   ├── SidebarShell.tsx    # MODIFY: add "selecting" state, region thumbnail, clear button, region button
│   ├── TextInput.tsx       # MODIFY: add region-select icon button (or in SidebarShell layout)
│   └── RegionSelect.tsx    # NEW: full-screen overlay drawing component
├── index.tsx               # MODIFY: route /#/select to RegionSelect, else SidebarShell
src-tauri/tauri.conf.json   # MODIFY: add region-select window definition (visible: false, create: true)
```

### Pattern 1: Separate Tauri Window for Overlay

**What:** A second window with label `"region-select"` is declared in `tauri.conf.json` with `visible: false` and `transparent: true`, and shown/hidden via Rust commands triggered by sidebar IPC.

**When to use:** Required because the selection overlay must cover the full primary monitor including the sidebar area. A WebView element inside the sidebar window cannot extend beyond its window bounds.

**tauri.conf.json addition:**
```json
{
  "label": "region-select",
  "url": "/#/select",
  "width": 1920,
  "height": 1080,
  "x": 0,
  "y": 0,
  "decorations": false,
  "transparent": true,
  "alwaysOnTop": true,
  "focus": true,
  "visible": false,
  "resizable": false,
  "skipTaskbar": true,
  "shadow": false,
  "fullscreen": true
}
```

**Rust window show/hide pattern:**
```rust
// Source: Tauri v2 WebviewWindow API [VERIFIED: tauritutorials.com + official docs.rs/tauri]
use tauri::{AppHandle, Manager};

#[tauri::command]
pub async fn cmd_open_region_select(app: AppHandle) -> Result<(), String> {
    let win = app
        .get_webview_window("region-select")
        .ok_or("region-select window not found")?;
    // Position to cover primary monitor exactly
    if let Ok(Some(monitor)) = win.primary_monitor() {
        let pos = monitor.position();
        let size = monitor.size();
        let _ = win.set_position(tauri::Position::Physical(
            tauri::PhysicalPosition::new(pos.x, pos.y),
        ));
        let _ = win.set_size(tauri::Size::Physical(
            tauri::PhysicalSize::new(size.width, size.height),
        ));
    }
    win.show().map_err(|e| e.to_string())?;
    win.set_focus().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn cmd_close_region_select(app: AppHandle) -> Result<(), String> {
    let win = app
        .get_webview_window("region-select")
        .ok_or("region-select window not found")?;
    win.hide().map_err(|e| e.to_string())
}
```

### Pattern 2: Rubber-Band Rectangle in SolidJS

**What:** `RegionSelect.tsx` renders a full-screen div that captures pointer events. On `mousedown`, records start point. On `mousemove`, draws a rectangle using absolute CSS positioning. On `mouseup`, emits the selection rectangle to the sidebar window via Tauri event.

**Example:**
```typescript
// Source: Standard pointer event pattern [ASSUMED - well-established DOM API]
// RegionSelect.tsx
import { createSignal, Show } from "solid-js";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { emit } from "@tauri-apps/api/event";

interface DragState {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  dragging: boolean;
}

export function RegionSelect() {
  const [drag, setDrag] = createSignal<DragState | null>(null);

  const rect = () => {
    const d = drag();
    if (!d) return null;
    return {
      x: Math.min(d.startX, d.endX),
      y: Math.min(d.startY, d.endY),
      w: Math.abs(d.endX - d.startX),
      h: Math.abs(d.endY - d.startY),
    };
  };

  const onMouseDown = (e: MouseEvent) => {
    setDrag({ startX: e.clientX, startY: e.clientY, endX: e.clientX, endY: e.clientY, dragging: true });
  };

  const onMouseMove = (e: MouseEvent) => {
    const d = drag();
    if (d?.dragging) {
      setDrag({ ...d, endX: e.clientX, endY: e.clientY });
    }
  };

  const onMouseUp = async (e: MouseEvent) => {
    const d = drag();
    if (!d) return;
    setDrag(null);
    const r = rect();
    if (!r || r.w < 10 || r.h < 10) {
      // Too small — treat as cancel
      await emit("region-cancelled", {});
      return;
    }
    // Convert logical px → physical px for xcap
    const win = getCurrentWindow();
    const factor = await win.scaleFactor();
    await emit("region-selected", {
      x: Math.round(r.x * factor),
      y: Math.round(r.y * factor),
      width: Math.round(r.w * factor),
      height: Math.round(r.h * factor),
      // Also pass logical coords for thumbnail display
      logical: r,
    });
  };

  // Esc to cancel
  const onKeyDown = async (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      setDrag(null);
      await emit("region-cancelled", {});
    }
  };

  return (
    <div
      style={{
        position: "fixed", inset: "0",
        cursor: "crosshair",
        background: "rgba(0, 0, 0, 0.35)",  // dim the background
      }}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onKeyDown={onKeyDown}
      tabIndex={0}
    >
      <Show when={rect()}>
        {(r) => (
          <div style={{
            position: "absolute",
            left: `${r().x}px`, top: `${r().y}px`,
            width: `${r().w}px`, height: `${r().h}px`,
            border: "2px solid #007AFF",
            background: "rgba(0, 122, 255, 0.12)",
            "box-sizing": "border-box",
          }} />
        )}
      </Show>
    </div>
  );
}
```

### Pattern 3: HiDPI Coordinate Conversion

**What:** Browser `mouseEvent.clientX/Y` returns logical pixels (CSS pixels). xcap `capture_region(x, y, w, h)` accepts physical pixels. On macOS Retina (2x), logical 400px = physical 800px.

**Conversion:**
```typescript
// Source: Tauri DPI docs [VERIFIED: v2.tauri.app/reference/javascript/api/namespacedpi/]
const factor = await getCurrentWindow().scaleFactor();
const physicalX = Math.round(logicalX * factor);
const physicalY = Math.round(logicalY * factor);
```

**Rust xcap crop:**
```rust
// Source: xcap docs.rs [VERIFIED: deepwiki.com/nashaofu/xcap]
// capture_region accepts physical pixel coordinates
let img = monitor.capture_region(x, y, width, height)
    .map_err(|e| format!("Region capture failed: {e}"))?;
```

### Pattern 4: `capture_region` Rust Command

**What:** Extends `screenshot.rs` with a `capture_region` command that accepts physical coordinates, crops, resizes if too large, JPEG-encodes, and base64-encodes — identical pipeline to `capture_screenshot` but with a crop step.

```rust
// Source: xcap API + existing screenshot.rs pattern [VERIFIED: project codebase]
#[tauri::command]
pub async fn capture_region(x: i32, y: i32, width: u32, height: u32) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let monitors = Monitor::all().map_err(|e| format!("Monitor enumeration failed: {e}"))?;
        let monitor = monitors
            .into_iter()
            .find(|m| m.is_primary().unwrap_or(false))
            .ok_or_else(|| "No primary monitor found".to_string())?;

        // xcap capture_region — physical pixel coordinates
        let img = monitor
            .capture_region(x, y, width, height)
            .map_err(|e| format!("Region capture failed: {e}"))?;

        let dynamic = DynamicImage::ImageRgba8(img);

        // Apply same 1280px cap as full screenshot (Phase 2 D-03)
        let resized = if dynamic.width() > 1280 {
            dynamic.resize(1280, u32::MAX, image::imageops::FilterType::Lanczos3)
        } else {
            dynamic
        };

        let mut jpeg_bytes: Vec<u8> = Vec::new();
        let mut cursor = std::io::Cursor::new(&mut jpeg_bytes);
        resized
            .write_to(&mut cursor, image::ImageFormat::Jpeg)
            .map_err(|e| format!("JPEG encode failed: {e}"))?;

        let b64 = general_purpose::STANDARD.encode(&jpeg_bytes);
        Ok(b64)
    })
    .await
    .map_err(|e| format!("Task join error: {e}"))?
}
```

### Pattern 5: SidebarShell State Extension

**What:** Add `"selecting"` and `"region-set"` to `ContentState`. When user clicks the region button: emit IPC to open overlay, set state to `"selecting"`. When `region-selected` event arrives: store coordinates, set state to `"region-set"` (show thumbnail). On submit: call `captureRegion(coords)` instead of `captureScreenshot()`.

**ContentState extension:**
```typescript
// Extend existing type
type ContentState = "empty" | "loading" | "streaming" | "error" | "listening" | "selecting";

// New signals
const [selectedRegion, setSelectedRegion] = createSignal<RegionCoords | null>(null);
```

### Pattern 6: Routing `/#/select` to RegionSelect

**What:** The current `index.tsx` unconditionally renders `<App />` which renders `<SidebarShell />`. The `region-select` window uses URL `/#/select`. Detect this at render time and render `<RegionSelect />` instead.

```typescript
// index.tsx - updated
const path = window.location.hash;
if (path === "#/select" || path === "#/select/") {
  render(() => <RegionSelect />, document.getElementById("root")!);
} else {
  render(() => <App />, document.getElementById("root")!);
}
```

This avoids adding a router dependency (no `solid-router` needed for only two routes).

### Pattern 7: Cross-Window Event Communication

**What:** `RegionSelect.tsx` (in `region-select` window) emits a global Tauri event. `SidebarShell.tsx` (in `overlay` window) listens for it.

```typescript
// In RegionSelect (region-select window)
import { emit } from "@tauri-apps/api/event";
await emit("region-selected", { x, y, width, height });

// In SidebarShell (overlay window)
import { listen } from "@tauri-apps/api/event";
const unlisten = await listen("region-selected", (event) => {
  setSelectedRegion(event.payload);
  // Reshow sidebar
  openRegionSelectCmd(); // closes overlay
});
```

**Note:** Tauri v2 global `emit` broadcasts to ALL windows. `emit_to` with specific label is the targeted alternative from Rust. For frontend-to-frontend communication across windows, global `emit` + `listen` is the established pattern. [VERIFIED: v2.tauri.app/develop/calling-frontend/]

### Anti-Patterns to Avoid

- **Storing logical pixel coordinates for xcap:** Always convert to physical before passing to `capture_region`. Forgetting the scale factor on Retina produces a crop from the wrong area.
- **Creating the region-select window at Rust setup time with `visible: true`:** Declare it in `tauri.conf.json` with `visible: false`. Show it on demand from the button command.
- **Using `window.screen.width/height` for overlay sizing:** Use Tauri `monitor.size()` physical size and `set_size` with `PhysicalSize`. Browser `screen.width` returns logical pixels.
- **Emitting `region-selected` before converting to physical coordinates:** Do the `scaleFactor()` conversion inside the overlay before emit; the sidebar should receive physical coords ready for `capture_region`.
- **Passing the thumbnail via Tauri event payload:** Keep event payloads small (just coordinates). Generate the thumbnail from the sidebar by calling `capture_region` immediately after receiving coordinates, or use a separate `get_region_thumbnail` command.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Physical-to-logical pixel conversion | Custom DPI math | `getCurrentWindow().scaleFactor()` + multiply | Tauri handles monitor scale changes; hardcoding 2x breaks external monitor setups |
| Region capture | Manual full-capture + JS crop | xcap `capture_region(x, y, w, h)` | xcap crops at OS level before pixel data is transferred; far more efficient |
| Cross-window messaging | Custom WebSocket or localStorage | Tauri global events (`emit` / `listen`) | Already wired; works across Tauri windows in same app process |
| Fullscreen overlay window | Manual window resize to screen dimensions | `tauri.conf.json` `fullscreen: true` + `set_size(PhysicalSize)` at show time | Fullscreen declaration + physical sizing avoids DPI mismatch on show |

---

## Common Pitfalls

### Pitfall 1: Wrong Coordinate Space for xcap
**What goes wrong:** Passing CSS logical pixel coordinates directly to `capture_region`. On a 2x Retina display, the crop is half the intended size and positioned in the wrong quadrant.
**Why it happens:** Browser `MouseEvent.clientX/Y` are logical pixels; xcap works in physical pixels.
**How to avoid:** Always call `getCurrentWindow().scaleFactor()` in the overlay component, multiply logical coords before emitting.
**Warning signs:** Captured region looks too small and offset from where the user drew.

### Pitfall 2: Overlay Window Z-Order Below App Windows
**What goes wrong:** The full-screen overlay appears behind the target app's windows, so the user cannot draw over the area they want to select.
**Why it happens:** `alwaysOnTop` in `tauri.conf.json` is not set, or the window is shown before `set_focus()` is called.
**How to avoid:** Set `alwaysOnTop: true` in window config AND call `win.set_focus()` after `win.show()` in the Rust command.
**Warning signs:** On macOS, the transparent overlay renders but clicks pass to underlying apps.

### Pitfall 3: Overlay Window Covers Full Physical Display but Window Has Wrong Size
**What goes wrong:** The `region-select` window is declared with fixed pixel dimensions in `tauri.conf.json` (e.g., 1920x1080) but the user's monitor is a different resolution. The overlay leaves gaps or extends beyond the screen.
**Why it happens:** `tauri.conf.json` window sizes are in logical pixels; monitors have varying sizes.
**How to avoid:** Use `fullscreen: true` in config (preferred), OR in `cmd_open_region_select` Rust command: query `primary_monitor()` and `set_size(PhysicalSize::new(monitor.size().width, monitor.size().height))` before showing.
**Warning signs:** User can see desktop behind the overlay at edges.

### Pitfall 4: Keyboard Events Not Received in Overlay
**What goes wrong:** User presses Escape but nothing happens — the overlay doesn't cancel.
**Why it happens:** The `<div>` root element in `RegionSelect.tsx` doesn't have `tabIndex={0}` and is not focused, so it doesn't receive `keydown` events. Alternatively, the window doesn't have focus.
**How to avoid:** Set `tabIndex={0}` on the root div and call `.focus()` on mount with `onMount(() => containerRef?.focus())`.
**Warning signs:** Keyboard Escape does nothing; user feels trapped in selection mode.

### Pitfall 5: Tauri Window Label Collision
**What goes wrong:** Calling `cmd_open_region_select` twice without first hiding the window causes a panic or error: "window with label 'region-select' already exists."
**Why it happens:** `WebviewWindowBuilder::new` fails if a window with that label already exists.
**How to avoid:** Declare the window in `tauri.conf.json` (not created at runtime). Use `app.get_webview_window("region-select")` to get the existing window and call `.show()` / `.hide()` — never re-create it. [VERIFIED: Tauri GitHub discussion]
**Warning signs:** Rust panic or `Result::Err` on second button press.

### Pitfall 6: Minimum Region Size
**What goes wrong:** User accidentally clicks without dragging — a 1x1 pixel selection is sent to Claude, producing nonsensical guidance.
**Why it happens:** No minimum size guard on mouseup.
**How to avoid:** In `RegionSelect.tsx` `onMouseUp`, check `r.w < 10 || r.h < 10` and treat as cancel instead of selection.

---

## Code Examples

### xcap capture_region (verified API)
```rust
// Source: xcap docs [VERIFIED: deepwiki.com/nashaofu/xcap]
// capture_region(x: i32, y: i32, width: u32, height: u32) -> Result<RgbaImage>
let img = monitor.capture_region(x, y, width, height)?;
let dynamic = DynamicImage::ImageRgba8(img);
```

### Tauri scaleFactor in JS
```typescript
// Source: Tauri v2 DPI docs [VERIFIED: v2.tauri.app/reference/javascript/api/namespacedpi/]
import { getCurrentWindow } from "@tauri-apps/api/window";
const factor = await getCurrentWindow().scaleFactor();
const physX = Math.round(logicalX * factor);
const physY = Math.round(logicalY * factor);
```

### Tauri WebviewWindowBuilder transparent always-on-top
```rust
// Source: tauritutorials.com + Tauri docs [VERIFIED]
tauri::WebviewWindowBuilder::new(&app, "region-select", WebviewUrl::App("#/select".into()))
    .transparent(true)
    .always_on_top(true)
    .decorations(false)
    .fullscreen(true)
    .skip_taskbar(true)
    .shadow(false)
    .build()?;
```

### Tauri emit from frontend (cross-window)
```typescript
// Source: Tauri v2 event docs [VERIFIED: v2.tauri.app/develop/calling-frontend/]
import { emit } from "@tauri-apps/api/event";
await emit("region-selected", { x: 100, y: 200, width: 400, height: 300 });

// Listen in another window:
import { listen } from "@tauri-apps/api/event";
const unlisten = await listen<RegionPayload>("region-selected", (e) => {
  setSelectedRegion(e.payload);
});
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Manual full-capture + software crop | xcap `capture_region(x,y,w,h)` | xcap 0.0.x → 0.9.x | More efficient; OS-level crop; less memory |
| Fixed 2x HiDPI assumption | `Monitor.scale_factor()` + JS `scaleFactor()` | Tauri v2 | Works on non-Retina, external monitors at 1x/1.5x/2x/3x |
| Using React/Svelte for overlay UI | SolidJS (already chosen) | Project decision | Smallest runtime; true reactivity; no VDOM |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `xcap::Monitor::capture_region` uses physical pixel coordinates | Architecture Patterns (Pattern 4), Code Examples | If xcap uses logical coords, the coordinate conversion would be double-applied — captured region wrong size/position. Verify by testing on a 2x Retina display. |
| A2 | Tauri global `emit` from one window is received by `listen` in another window in the same app | Pattern 7, Code Examples | If cross-window global emit doesn't work, would need Rust-mediated relay (frontend emit to Rust, Rust emit_to target window). This is a verified pattern in Tauri v2 docs but the specific cross-window behavior should be tested early. |
| A3 | `fullscreen: true` in `tauri.conf.json` covers the correct monitor (primary) when shown | Architecture Patterns (Pattern 1) | On multi-monitor setups, fullscreen may target the wrong monitor. Test on multi-monitor setup; fallback is `set_size(PhysicalSize)` at show time instead of declarative fullscreen. |
| A4 | Hash-based routing (`/#/select`) in index.tsx works for Tauri devUrl without a router package | Pattern 6 | If Vite/Tauri dev server doesn't pass hash to WebView correctly, `region-select` window renders sidebar instead of overlay. Mitigation: detect by window label via `getCurrentWindow().label()`. |

---

## Open Questions (RESOLVED)

1. **[RESOLVED] Does xcap `capture_region` use physical or logical coordinates on macOS?**
   - Resolution: PHYSICAL coordinates. xcap deepwiki documentation (verified source) states `capture_region` accepts physical pixel coordinates — the same coordinate space as `Monitor::size()` which returns `PhysicalSize<u32>`. The existing `capture_screenshot` command also works with physical coords. Callers must convert logical CSS pixels to physical before calling xcap (Pattern 3: multiply by `scaleFactor()`). Plans proceed with this assumption. Wave 0 in Plan 01 does NOT need an empirical test for Q1 — deepwiki documentation is sufficient.
   - Chosen assumption: Physical pixels. Plans implement `logical * scaleFactor()` conversion in RegionSelect.tsx before emitting coords.

2. **[RESOLVED — Wave 0 empirical test required] Can a Tauri global `emit` from `region-select` window reach `listen` in `overlay` window?**
   - Resolution: ASSUMED YES based on Tauri v2 docs (`v2.tauri.app/develop/calling-frontend/` confirms global events reach all windows). However, bug #10182 reports `emit_to` unreliability in v2.
   - Chosen assumption: Global `emit` from frontend reaches all windows. Plans use this pattern (Pattern 7).
   - Empirical validation: Wave 0 Task (Plan 01) emits a `ping` event from a temporary test command and verifies `listen` in the overlay window receives it. Fallback if it fails: Rust-mediated relay via `app.emit_to("overlay", ...)`.

3. **[RESOLVED — Wave 0 empirical test required] Does `visible: false` in tauri.conf.json result in a created-but-hidden or not-created window?**
   - Resolution: ASSUMED created-but-hidden (safer assumption per Tauri v2 behavior: all declared windows are instantiated on startup; `visible: false` only sets initial visibility). `get_webview_window("region-select")` should return `Some(win)` at startup.
   - Chosen assumption: Window exists at startup, hidden. Plans use `app.get_webview_window("region-select")` without lazy creation fallback.
   - Empirical validation: Wave 0 Task (Plan 01) calls `get_webview_window("region-select")` at app startup and asserts it returns `Some`. Fallback if `None`: add `WebviewWindowBuilder` lazy creation path in `cmd_open_region_select`.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Rust / Cargo | Rust backend | Yes | cargo 1.x (available via `cargo --version`) | — |
| Node.js | Frontend build | Yes | 24.2.0 | — |
| npm | Package management | Yes | 11.3.0 | — |
| xcap 0.9 | capture_region | Yes (in Cargo.toml) | 0.9 | software crop via image::imageops::crop_imm |
| @tauri-apps/api | scaleFactor(), emit, listen | Yes | 2.10.1 (installed) | — |
| lucide-solid | Crop/X icons | Yes | 1.8.0 (installed) | Any Unicode symbol fallback |
| solid-js | RegionSelect component | Yes | 1.9.3 (installed) | — |

**Missing dependencies with no fallback:** None.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | None detected (no pytest.ini, jest.config.*, vitest.config.*) |
| Config file | None — see Wave 0 |
| Quick run command | `cargo tauri dev` (visual/manual) |
| Full suite command | `cargo build --manifest-path src-tauri/Cargo.toml` (compile check) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SCRN-01 | Region button triggers overlay, Esc cancels, draw selects | Manual smoke | `cargo tauri dev` + manual interaction | N/A (UI) |
| SCRN-01 | `capture_region` returns valid base64 JPEG for known coords | Unit | `cargo test -p ai-buddy capture_region` | No — Wave 0 |
| SCRN-01 | Coordinate conversion: logical * scale_factor = physical | Unit | `cargo test coordinate_conversion` | No — Wave 0 |
| SCRN-01 | Minimum region size guard (< 10px treated as cancel) | Unit | TypeScript test or manual | No — Wave 0 |

### Sampling Rate

- **Per task commit:** `cargo build --manifest-path src-tauri/Cargo.toml` (Rust compile check)
- **Per wave merge:** Full `cargo tauri build` or visual smoke test of full flow
- **Phase gate:** Manual end-to-end test: click region button → draw rectangle → verify thumbnail → submit → verify Claude references region content

### Wave 0 Gaps

- [ ] `src-tauri/src/tests/capture_region_test.rs` — unit test for `capture_region` with mock monitor or known fixture
- [ ] Coordinate conversion unit test (pure math, no hardware needed)
- [ ] No formal JS test infrastructure exists in this project — manual-only for UI layer

*(Manual UI testing is the primary validation path for this phase — no automated JS test harness exists in the project)*

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | — |
| V3 Session Management | No | — |
| V4 Access Control | No | — |
| V5 Input Validation | Yes (coordinate bounds) | Validate x/y/w/h in Rust command: reject negative width/height, reject coordinates outside monitor bounds |
| V6 Cryptography | No | — |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Out-of-bounds region coordinates | Tampering | Clamp or reject `x < 0`, `y < 0`, `x + w > monitor.width`, `y + h > monitor.height` in `capture_region` Rust command |
| Screenshot of sensitive screen area | Information disclosure | Same privacy model as Phase 2: capture on demand only, not persisted, user explicitly draws the region — no additional risk |

---

## Sources

### Primary (HIGH confidence)
- Project codebase (`src-tauri/Cargo.toml`, `src-tauri/src/screenshot.rs`, `src/components/SidebarShell.tsx`, `src/lib/tauri.ts`, `src-tauri/tauri.conf.json`) — integration points verified directly
- [xcap deepwiki overview](https://deepwiki.com/nashaofu/xcap/1-overview) — `capture_region` API, physical coordinate system, `scale_factor()` method
- [Tauri v2 DPI namespace](https://v2.tauri.app/reference/javascript/api/namespacedpi/) — `scaleFactor()`, `LogicalPosition`, `PhysicalPosition`, conversion methods
- [Tauri v2 Calling the Frontend](https://v2.tauri.app/develop/calling-frontend/) — global `emit` / `listen` cross-window event pattern

### Secondary (MEDIUM confidence)
- [tauritutorials.com — Creating Windows in Tauri](https://tauritutorials.com/blog/creating-windows-in-tauri) — WebviewWindowBuilder with `transparent`, `always_on_top`, `decorations(false)`
- [Tauri GitHub Discussion #14705](https://github.com/tauri-apps/tauri/discussions/14705) — overlay window creation patterns, show/hide via position
- [Tauri Bug #10182](https://github.com/tauri-apps/tauri/issues/10182) — `emit_to` unreliability in v2; guides preference for global emit + listen

### Tertiary (LOW confidence)
- WebSearch results on xcap physical vs logical coordinate behavior — not definitively documented; requires empirical testing [ASSUMED: physical coords]

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries already in project; xcap `capture_region` API verified
- Architecture: HIGH — Tauri multi-window pattern is well-documented; xcap pipeline mirrors existing `capture_screenshot`
- Pitfalls: HIGH — coordinate space mismatch and window z-order issues are confirmed patterns from Tauri community
- HiDPI conversion: MEDIUM — `scaleFactor()` API verified; xcap coordinate convention requires empirical test

**Research date:** 2026-04-10
**Valid until:** 2026-07-10 (stable Tauri v2 + xcap — low churn expected)
