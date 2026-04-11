# Phase 8: Backend Foundations - Research

**Researched:** 2026-04-10
**Domain:** Tauri v2 multi-monitor window positioning + Rust OS app detection
**Confidence:** HIGH

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CTX-01 | App detects the name of the currently active application when the overlay is invoked — used to enrich the AI prompt context | `active-win-pos-rs` crate `get_active_window().app_name`; new `cmd_get_active_app` Tauri command; called in `onOverlayShown` handler |
| CTX-02 | When the active app is detected, AI-suggested quick actions reflect the app context (e.g. "Debug error" in Terminal, "Explain layer" in Figma) rather than generic actions | `detectedApp` signal in SidebarShell passed to a `QuickActions` stub (stub only this phase — full QuickActions is Phase 11); also passed as `appContext` to `recordInteraction` |
| CTX-03 | App detection is sourced from the OS (Rust layer) — must not rely on AI classification of screenshots | Entire feature lives in new `src-tauri/src/app_context.rs`; no AI call involved |
| PLAT-01 | Invoking the overlay keyboard shortcut opens the panel on the monitor where the user's cursor is — not always the primary display | Replace `primary_monitor()` call in `toggle_overlay` with `cursor_position()` + range-check across `available_monitors()`; fix mixed physical/logical unit bug in same edit |
</phase_requirements>

---

## Summary

Phase 8 delivers two independent Rust-backend changes that share no UI surface: (1) replacing hardcoded primary-monitor positioning in `toggle_overlay` with cursor-based monitor detection, and (2) adding a new Tauri command that reads the frontmost application name from the OS at overlay-open time. Both features are pure Rust additions; the only SolidJS changes are a new signal and a new IPC call in `SidebarShell.tsx`.

The multi-monitor fix has a known complication: Tauri issue #7890 documents that `monitor_from_point()` can produce wrong results on macOS with mixed-DPI displays. The validated workaround — enumerated range check across `available_monitors()` — sidesteps the bug. The same `window.rs` edit must also fix the pre-existing mixed physical/logical unit bug on lines 26–38 (noted in the v2 research). These two fixes travel together.

For app detection, `active-win-pos-rs` v0.10.0 covers macOS, Windows, and Linux via a single `get_active_window()` call. The `app_name` field (process/bundle name) is available without any permission on macOS. The `title` field requires Screen Recording permission; this phase does not use `title`.

**Primary recommendation:** Add `active-win-pos-rs = "0.10"` to `Cargo.toml`, create `src-tauri/src/app_context.rs` with a single Tauri command, rewrite the monitor-detection block in `toggle_overlay`, and plumb the `detectedApp` signal through `SidebarShell` to `recordInteraction`.

---

## Standard Stack

### Core (already in project)
| Library | Version | Purpose | Status |
|---------|---------|---------|--------|
| Tauri | 2.10.3 | Window management, IPC, monitor APIs | Already in `Cargo.toml` |
| SolidJS | latest | Frontend reactive state | Already in use |
| xcap | 0.9 | Screen capture (unchanged this phase) | Already in `Cargo.toml` |
| rusqlite | 0.39 | SQLite for memory (unchanged) | Already in `Cargo.toml` |

### New Dependency (Phase 8)
| Library | Version | Purpose | Why |
|---------|---------|---------|-----|
| active-win-pos-rs | 0.10.0 | Get frontmost app name from OS | Cross-platform (macOS, Windows, Linux) unified API; `app_name` available without special permission; actively maintained (released 2026-03-13) |

**Installation:**
```bash
# In src-tauri/Cargo.toml [dependencies]:
active-win-pos-rs = "0.10"
```

**Version verification:** Confirmed 0.10.0 is latest as of 2026-04-10. [VERIFIED: crates.io API]

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| active-win-pos-rs | frontmost crate | macOS-only; uses NSWorkspace notification observer (better for continuous tracking, wrong for on-demand snapshot). Ruled out. |
| active-win-pos-rs | Raw NSWorkspace call via objc crate | macOS-only; requires unsafe FFI boilerplate. Not needed when a cross-platform crate exists. |
| available_monitors() range check | monitor_from_point() | monitor_from_point has documented coordinate inconsistency on macOS mixed-DPI (Tauri #7890). Range check is the safe workaround. |

---

## Architecture Patterns

### Recommended File Changes

```
src-tauri/src/
├── app_context.rs       # NEW — cmd_get_active_app command
├── lib.rs               # MODIFY — add mod app_context, register command
├── window.rs            # MODIFY — toggle_overlay signature + monitor logic + unit fix
└── shortcut.rs          # MODIFY — pass AppHandle to toggle_overlay

src/lib/
└── tauri.ts             # MODIFY — add getActiveApp() wrapper

src/components/
└── SidebarShell.tsx     # MODIFY — detectedApp signal, call getActiveApp on overlay-shown
```

### Pattern 1: App Detection Command

**What:** New Tauri command in `app_context.rs` that wraps `active_win_pos_rs::get_active_window()` and returns just the `app_name` string.
**When to use:** Called from JS in the `onOverlayShown` handler, before any guidance is submitted.

```rust
// src-tauri/src/app_context.rs
// Source: active-win-pos-rs 0.10.0 docs + ARCHITECTURE.md research

use active_win_pos_rs::get_active_window;

/// Returns the name of the frontmost application at the moment of call.
/// Uses OS-native API (NSWorkspace on macOS, GetForegroundWindow on Windows).
/// Returns None if detection fails or no window has focus.
/// Does NOT use the title field — title requires Screen Recording on macOS (Pitfall V2-3).
#[tauri::command]
pub fn cmd_get_active_app() -> Result<Option<String>, String> {
    match get_active_window() {
        Ok(win) => {
            let name = win.app_name.trim().to_string();
            if name.is_empty() {
                Ok(None)
            } else {
                Ok(Some(name))
            }
        }
        Err(_) => Ok(None), // Best-effort — never fail hard on app detection
    }
}
```

**Critical:** `cmd_get_active_app` must be synchronous (no `async`) — `active-win-pos-rs` is a sync blocking call. There is no async variant. Register it in `lib.rs` invoke_handler.

### Pattern 2: Multi-Monitor Toggle

**What:** Replace `primary_monitor()` hardcode in `toggle_overlay` with cursor-based detection using `available_monitors()` + range check. Simultaneously fix the mixed-unit bug on lines 26–38 of the current `window.rs`.

**Signature change required:** Current `toggle_overlay(&WebviewWindow)` has no access to `cursor_position()` — that lives on `AppHandle`. Change signature to `toggle_overlay(app: &AppHandle, window: &WebviewWindow)`. Update both call sites: `shortcut.rs` (line 26) and `cmd_toggle_overlay` (line 50).

```rust
// src-tauri/src/window.rs
// Source: Tauri 2.10.2 docs.rs AppHandle + ARCHITECTURE.md research

pub fn toggle_overlay(app: &AppHandle, window: &WebviewWindow) -> tauri::Result<()> {
    if window.is_visible().unwrap_or(false) {
        window.hide()?;
        let _ = window.emit("overlay-hidden", ());
    } else {
        // Detect monitor containing cursor, fall back to primary.
        // Do NOT use monitor_from_point() — has coordinate bug on macOS mixed-DPI (#7890).
        // Instead: enumerate all monitors and range-check cursor position manually.
        let cursor = app.cursor_position().unwrap_or(tauri::PhysicalPosition::new(0.0, 0.0));
        let monitors = app.available_monitors().unwrap_or_default();

        let active_monitor = monitors.iter().find(|m| {
            let pos = m.position();
            let size = m.size();
            let right = pos.x as f64 + size.width as f64;
            let bottom = pos.y as f64 + size.height as f64;
            cursor.x >= pos.x as f64
                && cursor.x < right
                && cursor.y >= pos.y as f64
                && cursor.y < bottom
        });

        let monitor = active_monitor
            .or_else(|| monitors.iter().find(|m| m.is_primary()))
            .or_else(|| monitors.first());

        if let Some(monitor) = monitor {
            let pos = monitor.position();
            let size = monitor.size();
            let scale = monitor.scale_factor();
            let window_width_logical = 300.0_f64;
            let menu_bar_height_logical: f64 = if cfg!(target_os = "macos") { 25.0 } else { 0.0 };

            // FIX: Use consistent units — all Physical. No LogicalSize for set_size.
            // Previous bug: set_position(Physical) + set_size(Logical) = wrong on 2x displays.
            let x = pos.x + size.width as i32 - (window_width_logical * scale) as i32;
            let y = pos.y + (menu_bar_height_logical * scale) as i32;
            let height_physical = (size.height as f64 - menu_bar_height_logical * scale) * 0.5;

            let _ = window.set_position(tauri::Position::Physical(
                tauri::PhysicalPosition::new(x, y),
            ));
            let _ = window.set_size(tauri::Size::Physical(
                tauri::PhysicalSize::new(
                    (window_width_logical * scale) as u32,
                    height_physical as u32,
                ),
            ));
        }

        window.show()?;
        window.set_focus()?;
        let _ = window.emit("overlay-shown", ());
    }
    Ok(())
}
```

### Pattern 3: Frontend Integration

**What:** `onOverlayShown` handler calls `getActiveApp()` and stores result in a `detectedApp` signal. Signal is passed to `recordInteraction` as `appContext`.

```typescript
// src/components/SidebarShell.tsx (additions only)
const [detectedApp, setDetectedApp] = createSignal<string | null>(null);

// Inside onMount, replace the existing unlisten block:
const unlisten = await onOverlayShown(async () => {
    // State reset (keep existing reset logic)
    setContentState("empty");
    setErrorMessage("");
    setStreamingText("");
    abortController?.abort();
    abortController = null;
    if (inputRef && !needsPermission()) {
        inputRef.focus();
    }

    // CTX-01: Detect active app (best-effort, never await-block the UI)
    try {
        const app = await getActiveApp();
        setDetectedApp(app);
    } catch {
        setDetectedApp(null); // Graceful degradation
    }
});
```

```typescript
// src/lib/tauri.ts (new export)
export async function getActiveApp(): Promise<string | null> {
    return invoke<string | null>("cmd_get_active_app");
}
```

**CTX-02 stub:** Pass `detectedApp()` to `streamGuidance` as part of the system prompt context. The `appContext` field in `recordInteraction` already exists and accepts a string — pass `detectedApp() ?? undefined` there. Full QuickActions context UI is Phase 11.

**AI prompt injection:** In `ai.ts`, add `appContext` to `StreamGuidanceOptions` and inject into the system prompt:
```typescript
+ (appContext ? `\n\nThe user is currently in: ${appContext}` : "")
```

### Pattern 4: Shortcut.rs Call Site Update

Both call sites of `toggle_overlay` must pass the `AppHandle`:

```rust
// shortcut.rs — register_shortcut callback (line ~26)
app.global_shortcut()
    .on_shortcut(shortcut, move |app, _shortcut, event| {
        if event.state == ShortcutState::Pressed {
            if let Some(window) = app.get_webview_window("overlay") {
                let _ = crate::window::toggle_overlay(app, &window); // CHANGED
            }
        }
    })?;

// window.rs — cmd_toggle_overlay
#[tauri::command]
pub fn cmd_toggle_overlay(app: AppHandle, window: WebviewWindow) -> Result<(), String> {
    toggle_overlay(&app, &window).map_err(|e| e.to_string()) // CHANGED
}
```

### Anti-Patterns to Avoid

- **Using `monitor_from_point()`:** Has coordinate inconsistency on macOS mixed-DPI (Tauri #7890, open as of 2026-04). Use manual range-check across `available_monitors()` instead. [VERIFIED: GitHub issue confirmed open 2026-04]
- **Reading `win.title` from active-win-pos-rs on macOS:** Returns empty string unless Screen Recording is granted. Use `win.app_name` only. [VERIFIED: active-win-pos-rs GitHub README]
- **Using `async` for `cmd_get_active_app`:** `active-win-pos-rs::get_active_window()` is sync. Wrapping in `async` adds overhead; the call is fast enough to be synchronous.
- **Blocking overlay show on `getActiveApp()`:** App detection is best-effort. If the OS call hangs (e.g., elevated process focus on Windows), the overlay must still open. Fire `getActiveApp()` non-blocking with `try/catch`.
- **Mixing Physical + Logical units in the same window operation:** Current `window.rs` lines 34–38 do this. Fix it in the same edit as the multi-monitor change. Pick Physical everywhere.
- **Calling `current_monitor()` immediately after `set_position()`:** Can return wrong or None if called before the window finishes repositioning. Not needed for this phase — avoided entirely.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Frontmost app detection | Custom NSWorkspace FFI via objc crate | active-win-pos-rs 0.10.0 | Already handles macOS + Windows + Linux; permission edge cases handled |
| Monitor-from-cursor | Re-implement using CoreGraphics CGDisplayForPoint | available_monitors() range check | Tauri wraps it; custom FFI would bypass the abstraction layer and be platform-specific |
| Window coordinate normalization | Custom DPI normalization math | Consistent Physical unit usage everywhere | Prevents the mixed-unit bug class entirely |

**Key insight:** The multi-monitor positioning fix is 90% "don't use the wrong API" — avoid `monitor_from_point` (buggy) and avoid `current_monitor` (unreliable on new windows). The positive fix is 10 lines of range-check code.

---

## Common Pitfalls

### Pitfall 1: monitor_from_point() coordinate mismatch on macOS mixed-DPI
**What goes wrong:** `monitor_from_point(cursor.x, cursor.y)` returns the wrong monitor or None on a MacBook Pro + external display setup where monitors have different pixel densities. The secondary monitor's reported PhysicalPosition.x uses the primary's logical width as its origin, not the actual physical boundary.
**Why it happens:** Tauri issue #7890 — `tao` (the windowing layer) does not reconcile CGDisplayBounds coordinate system with the logical coordinate system on mixed-DPI setups. Open as of 2026-04.
**How to avoid:** Enumerate `available_monitors()` and find the monitor whose `PhysicalRect` contains the cursor coordinates by manual range check. [VERIFIED: GitHub issue #7890]
**Warning signs:** Overlay opens on primary monitor even when cursor is on external monitor.

### Pitfall 2: Mixed Physical/Logical window units
**What goes wrong:** `set_position(PhysicalPosition)` + `set_size(LogicalSize)` causes incorrect window sizing on 2x (Retina) displays. The position is placed correctly but the size is twice the intended physical dimensions, or vice versa.
**Why it happens:** Pre-existing bug in `window.rs` lines 34–38: `set_position(Physical)` then `set_size(Logical)`. On a 2x display, logical 300px = physical 600px, so the window is either too small or too wide.
**How to avoid:** Standardize on Physical throughout `toggle_overlay`. Derive height from `monitor.size().height` (physical) and subtract the menu bar offset in physical pixels (`menu_bar_height_logical * scale`). [VERIFIED: codebase inspection of window.rs]
**Warning signs:** Overlay is 600px wide instead of 300px on Retina; overlay half-height appears wrong.

### Pitfall 3: active-win-pos-rs returns empty app_name on Windows elevated processes
**What goes wrong:** On Windows, if the frontmost window belongs to an elevated process (UAC dialog, admin tool) and the Tauri app is not elevated, `GetWindowText` or process module resolution fails silently. `get_active_window()` may return an error or an `ActiveWindow` with empty `app_name`.
**Why it happens:** Windows process isolation — non-elevated processes cannot read properties of elevated processes through the standard Win32 API chain.
**How to avoid:** Treat `get_active_window()` errors as returning `None` (already handled in the command). Never unwrap. Never surface the error to the user — just show no app context. [CITED: active-win-pos-rs GitHub issues, Pitfall V2-3 in .planning/research/PITFALLS.md]
**Warning signs:** App name shows "Unknown" or overlay shows no context on Windows when a UAC dialog was recently dismissed.

### Pitfall 4: Blocking overlay show on app detection latency
**What goes wrong:** If `getActiveApp()` is `await`ed before the overlay becomes interactive, a slow OS call (e.g., Windows process enumeration on a loaded system) delays the overlay appearance. User expects the overlay to appear immediately on keypress.
**Why it happens:** The `onOverlayShown` handler in SidebarShell awaits several async calls. Adding another blocking `await` extends perceived latency.
**How to avoid:** Fire `getActiveApp()` as a non-blocking call: `getActiveApp().then(app => setDetectedApp(app)).catch(() => setDetectedApp(null))`. Do not `await` it in the main reset handler. [ASSUMED — based on UX best practice]
**Warning signs:** Overlay feels sluggish to open after adding app detection.

### Pitfall 5: title field empty on macOS (using app_name only)
**What goes wrong:** `win.title` is always `""` on macOS unless Screen Recording permission is granted. Using `title` to get document-specific context (e.g., "VS Code — main.rs") silently returns nothing.
**Why it happens:** macOS enforces this at the OS level. Even with Screen Recording permission, the `title` field behavior in `active-win-pos-rs` is documented as requiring the permission to be populated.
**How to avoid:** Use only `win.app_name`. Accept that context is app-level, not document-level. Phase 11 QuickActions are designed around app-level context. [VERIFIED: active-win-pos-rs GitHub README]
**Warning signs:** `app_name` returns "Code" (process name) — this is correct behavior, not a bug.

---

## Code Examples

### Complete app_context.rs

```rust
// src-tauri/src/app_context.rs
// Source: active-win-pos-rs 0.10.0 + .planning/research/ARCHITECTURE.md

use active_win_pos_rs::get_active_window;

/// Returns the bundle/process name of the frontmost application.
/// Returns None if no window has focus or detection fails.
/// Uses only app_name — does not read title (requires Screen Recording on macOS, Pitfall 3).
/// Intentionally synchronous — get_active_window() is a fast synchronous OS call.
#[tauri::command]
pub fn cmd_get_active_app() -> Result<Option<String>, String> {
    match get_active_window() {
        Ok(win) => {
            let name = win.app_name.trim().to_string();
            if name.is_empty() {
                Ok(None)
            } else {
                Ok(Some(name))
            }
        }
        Err(_) => Ok(None),
    }
}
```

### lib.rs additions

```rust
// Add to mod declarations:
mod app_context;

// Add to invoke_handler! macro:
app_context::cmd_get_active_app,
```

### tauri.ts addition

```typescript
// Source: existing tauri.ts pattern, CTX-01 requirement
export async function getActiveApp(): Promise<string | null> {
    return invoke<string | null>("cmd_get_active_app");
}
```

### ai.ts system prompt injection (CTX-02)

```typescript
// In StreamGuidanceOptions interface:
appContext?: string;  // Active app name from OS detection

// In streamGuidance, extend systemPrompt:
const systemPrompt =
    SYSTEM_PROMPT +
    (TIER_SUFFIX[tier] ?? "") +
    (appContext ? `\n\nThe user is currently working in: ${appContext}` : "") +
    (memoryContext ? `\n\n## User skill context\n${memoryContext}` : "");
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `primary_monitor()` hardcoded | `available_monitors()` + cursor range check | Phase 8 (this phase) | Overlay opens on correct monitor |
| Mixed Physical+Logical units | All Physical units in `toggle_overlay` | Phase 8 (this phase) | Correct sizing on Retina displays |
| No app context | `active-win-pos-rs` OS-native call | Phase 8 (this phase) | AI prompt enriched with app name |
| `appContext` always null in `recordInteraction` | Populated from `detectedApp` signal | Phase 8 (this phase) | Memory DB gains app usage data for future Phase 11 |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `active-win-pos-rs::get_active_window()` is fast enough to be called synchronously without degrading overlay open latency | Common Pitfalls #4 | If slow, need to spawn_blocking or fire non-blocking; won't crash, just slow overlay |
| A2 | Non-blocking pattern for `getActiveApp()` in `onOverlayShown` (fire-and-forget, don't await) is the right UX tradeoff | Architecture Pattern 3 | If order matters for CTX-02 (QuickActions needs app name before render), might need await with timeout |
| A3 | `appContext` string injected into the system prompt is sufficient for CTX-02 — no additional Cloudflare Worker changes needed | Code Examples | If Worker strips unknown system prompt fields, injection is lost; Worker is pass-through for system, so LOW risk |

---

## Open Questions (RESOLVED)

1. **Does `active-win-pos-rs` require Accessibility permission on macOS for `app_name` (not just `title`)?**
   - What we know: README states `title` requires Screen Recording. `app_name` is described as available via NSWorkspace without special permission.
   - What's unclear: Whether any macOS Sequoia privacy change (post-2024) added additional gating.
   - Recommendation: Test on a clean macOS Sequoia install as noted in STATE.md blocker. If a permission dialog appears for `app_name`, fall back to returning None and document.
   - **RESOLVED:** `app_name` is available without Screen Recording permission (NSWorkspace lookup, not CGWindowList). `cmd_get_active_app` returns `None` gracefully on any error — overlay still opens. Runtime validation on clean Sequoia install noted as post-Phase-8 check in STATE.md.

2. **Should `detectedApp` persist across overlay hide/show, or reset each time?**
   - What we know: Current `onOverlayShown` resets all state. Detecting app on each show is the correct behavior (user may switch apps between invocations).
   - What's unclear: Race condition if user switches app very quickly after pressing shortcut.
   - Recommendation: Reset `detectedApp` to null on hide, re-detect on show. This is always fresh data.
   - **RESOLVED:** Plan 02 Task 2 implements `setDetectedApp(null)` reset in the overlay-hidden handler, then fire-and-forget `getActiveApp()` in the overlay-shown handler. Always fresh data; race condition is benign (null renders as empty context, no crash).

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Rust / cargo | Build | ✓ | 1.85+ (inferred from project working) | — |
| Tauri v2 | Window APIs | ✓ | 2.10.3 (from Cargo.toml) | — |
| active-win-pos-rs | CTX-01, CTX-03 | Not yet installed | 0.10.0 (to add) | None — required for feature |
| macOS Sequoia (test target) | Validate app_name permission | Not verified | — | Manual test required per STATE.md |

**Missing dependencies with no fallback:**
- `active-win-pos-rs = "0.10"` must be added to `Cargo.toml` — no fallback for OS app detection without it.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Tauri integration test + manual |
| Config file | none (no automated test suite configured) |
| Quick run command | `cargo build` (compile-time correctness) |
| Full suite command | `cargo tauri dev` + manual smoke test |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CTX-01 | `cmd_get_active_app` returns app name string | Manual smoke | — | ❌ Wave 0 |
| CTX-02 | App name appears in AI system prompt context | Manual smoke | — | ❌ Wave 0 |
| CTX-03 | No screenshot analysis involved (code audit) | Code review | `grep -r "screenshot" src-tauri/src/app_context.rs` | ❌ Wave 0 |
| PLAT-01 | Overlay opens on cursor's monitor | Manual smoke (two-monitor setup) | — | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `cargo build` — confirms compilation, type safety, no missing imports
- **Per wave merge:** `cargo tauri dev` + manual overlay toggle on both monitors
- **Phase gate:** All 4 success criteria verified manually before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `src-tauri/src/app_context.rs` — new file, covers CTX-01, CTX-03
- [ ] No existing test infrastructure for Tauri commands — manual smoke is the gate

*(No automated test framework change needed — existing pattern is cargo build + manual)*

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | — |
| V3 Session Management | no | — |
| V4 Access Control | no | — |
| V5 Input Validation | yes | `app_name` returned as-is; trim whitespace before returning; cap at reasonable length if injected into prompt |
| V6 Cryptography | no | — |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Malicious app name injection into AI prompt | Tampering | Trim and length-cap `app_name` before prompt injection; treat as untrusted user-like input |
| Window title exfiltration | Information Disclosure | Phase 8 explicitly does NOT use `title` field — `app_name` only |

**Security note:** The `app_name` field comes from the OS process table — a user-controlled process can set any name. Injecting it raw into the Claude system prompt is safe in practice (Claude does not execute it), but it should be trimmed and capped (e.g., 100 chars) to prevent prompt bloat from an adversarially-named process.

---

## Project Constraints (from CLAUDE.md)

| Directive | Impact on Phase 8 |
|-----------|-------------------|
| Tauri v2 required | All window APIs use `tauri::` not Electron; already satisfied |
| API keys never in binary | `cmd_get_active_app` makes no external API calls; constraint satisfied trivially |
| Platform-specific Rust crates for capture | `active-win-pos-rs` is cross-platform pure Rust; consistent with this pattern |
| SolidJS frontend | New `detectedApp` signal uses `createSignal`; no React patterns |
| Privacy: no stored screen data | `app_name` is not screen data; stored in `app_context` column of `interactions` table, which already exists |
| Cloudflare Worker proxy for API | Phase 8 adds no new API routes; prompt injection happens client-side |

---

## Sources

### Primary (HIGH confidence)
- [VERIFIED: crates.io API] — active-win-pos-rs 0.10.0, released 2026-03-13
- [CITED: docs.rs/tauri/2.10.2/tauri/struct.AppHandle.html] — `cursor_position()`, `available_monitors()`, `monitor_from_point()` signatures
- [CITED: github.com/tauri-apps/tauri/issues/7890] — macOS mixed-DPI coordinate bug, open as of 2026-04
- [CITED: github.com/dimusic/active-win-pos-rs] — `title` requires Screen Recording; `app_name` does not
- [VERIFIED: codebase inspection] — `window.rs` lines 26–38 mixed Physical/Logical unit bug confirmed
- [VERIFIED: codebase inspection] — `app_context` column exists in `recordInteraction` IPC call (tauri.ts line 155)
- [VERIFIED: .planning/research/ARCHITECTURE.md] — Feature 4 and 5 analysis (v2 research document)
- [VERIFIED: .planning/research/PITFALLS.md] — Pitfalls V2-3 (app detection) and V2-4 (multi-monitor)

### Secondary (MEDIUM confidence)
- [CITED: .planning/STATE.md] — Decisions: active-win-pos-rs = "0.10", available_monitors() range check approach, window.rs mixed-unit bug fix

### Tertiary (LOW confidence)
- None

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — active-win-pos-rs 0.10.0 verified on crates.io; Tauri AppHandle APIs verified on docs.rs 2.10.2
- Architecture: HIGH — patterns derived from existing codebase inspection + verified Tauri API signatures + prior v2 research
- Pitfalls: HIGH — mixed-unit bug verified in codebase; #7890 confirmed open on GitHub; permission behavior confirmed in active-win-pos-rs README

**Research date:** 2026-04-10
**Valid until:** 2026-05-10 (stable stack; active-win-pos-rs unlikely to change significantly in 30 days)
