# Architecture Patterns: v2.0 Integration

**Project:** AI Buddy v2.0 — Task-Native Experience
**Researched:** 2026-04-10
**Mode:** Feasibility / Integration

---

## Existing Architecture Snapshot

Before mapping v2 integrations, the current system contracts that must not break:

```
SidebarShell (SolidJS state machine)
  ContentState: "empty" | "loading" | "streaming" | "error" | "listening" | "selecting"
  Signals: streamingText, lastIntent, inputValue, selectedRegion, thumbnailB64,
           currentTier, ttsEnabled, showSettings, isListening, sttError

IPC contract (tauri.ts wrappers):
  invoke: 14 registered commands in lib.rs
  events: overlay-shown, overlay-hidden, ptt-start, stt-partial, stt-final, stt-error,
          region-selected, region-cancelled

Rust state (tauri::State):
  MemoryDb(Mutex<Connection>) — single managed state

Cloudflare Worker routes:
  POST /chat, POST /classify, POST /stt, POST /tts, GET /health
```

---

## Feature 1: Quick Action Buttons

### Where do they live in the state machine?

Quick action buttons (e.g., "Explain this", "Write a command", "Debug this error") are a **pre-intent shortcut layer** that bypasses the text input. They do NOT require a new ContentState.

The correct integration point is in the `empty` state render path. When `contentState() === "empty"` and no permission is needed, render a `QuickActions` component above the `EmptyState`. Clicking a button calls `submitIntent(buttonLabel)` directly — identical to the user typing and pressing Enter.

No state machine changes needed. The existing `loading → streaming → empty` cycle handles the full button-triggered flow.

**New component:** `QuickActions.tsx` — reads from `detectedApp` signal (see Feature 4), renders 3–4 contextual buttons. Passes button label directly to `handleSubmit`.

**Modified component:** `SidebarShell.tsx` — add `detectedApp` signal, add `QuickActions` to the empty-state branch of the JSX.

### Async AI classification fit

The existing `prepareGuidanceContext` already calls `/classify` async before streaming. Quick actions pre-supply the intent text; classification still runs on the same path. No architectural change needed. The button label is a human-readable phrase that gets classified the same way a typed intent does.

**Confidence: HIGH** — button → `submitIntent` is direct reuse of the existing submission path.

---

## Feature 2: Conversation Continuity

### Where does conversation history live?

**Recommendation: SolidJS signal in SidebarShell, not Rust state or Cloudflare Worker KV.**

Rationale:
- The existing `streamingText` signal holds only the last response. Conversation history is a `createSignal<Message[]>([])` where `Message = { role: 'user' | 'assistant', content: string }`.
- Rust tauri::State is the wrong home — conversation context is ephemeral (session-only) and does not need SQLite durability. The MemoryDb pattern is for long-term learning data, not turn-by-turn chat context.
- Cloudflare Worker KV is the wrong home — KV is eventually consistent, requires a session ID scheme, and adds a network round-trip to every turn. The Worker is stateless by design; the app already owns message construction in `streamGuidance()`.

**Session boundary:** History clears on `onOverlayShown` reset (the existing reset block in onMount). This is intentional — each invocation of the overlay is a fresh session.

**New signal:** `conversationHistory: Message[]` in SidebarShell. Appended on every `onDone`. Reset in `onOverlayShown` handler.

### How to pass multi-turn context to Claude without bloating requests

Current `streamGuidance` sends `messages: [{ role: 'user', content: [image?, text] }]` — a single-turn array.

For multi-turn, change to: `messages: conversationHistory + currentTurn`. The `messages` array already passes through the Worker `/chat` route unchanged. No Worker change needed.

**Token budget discipline:**
- Summarize assistant turns after N exchanges (suggested: 3). Replace the oldest assistant message with a single-sentence summary.
- Keep screenshots only in the most recent user turn (prior turns: text only, image removed).
- This is a frontend concern only — `streamGuidance` receives the already-trimmed messages array.

**Modified:** `src/lib/ai.ts` — `StreamGuidanceOptions.messages` replaces the implicit single-turn construction. `SidebarShell.tsx` owns history accumulation and trimming.

**Confidence: HIGH** — Claude Messages API is already multi-turn; the Worker passes messages verbatim.

---

## Feature 3: Step Progress Tracking

### SolidJS signal vs SQLite persistence?

**Recommendation: SolidJS signal only. No SQLite persistence for step state.**

Rationale:
- Step completion is within-session state. The user closes the overlay, the task is done or abandoned. Persisting step positions to SQLite for a per-session ephemeral concept adds complexity with no recovery scenario.
- The existing `recordInteraction` call in `onDone` already handles the meaningful durable signal: "this task was completed."
- Step state surviving overlay hide/show is achievable cheaply: the `onOverlayShown` handler currently resets `streamingText` to `""`. Change this: only reset on **new submission**, not on every show. The signal persists across hide/show in the same Tauri process lifetime.

**Current problem:** `onOverlayShown` resets `streamingText` unconditionally. This means re-opening the overlay clears the previous guidance. For step tracking to survive hide/show, this reset must be conditional.

**Proposed rule:** Reset `streamingText` and step state only when the user explicitly submits a new intent. On re-open after a streaming result, restore to the last guidance with step state intact.

**New signals:** `stepStates: boolean[]` in SidebarShell (index-aligned to parsed steps from `streamingText`). Rendered in `GuidanceList` with checkmark affordance per step.

**Modified component:** `GuidanceList.tsx` — accept `stepStates` prop, render per-step checkbox/checkmark, emit `onStepToggle(index: number)` callback. No new Tauri IPC needed.

**Modified:** `SidebarShell.tsx` — conditional reset in `onOverlayShown`, `stepStates` signal, pass down to GuidanceList.

**Confidence: HIGH** — pure frontend state management, no IPC changes.

---

## Feature 4: App Detection

### Rust approach cross-platform

**Recommendation: `active-win-pos-rs` crate (v0.10.0, released 2026-03-13), wrapped in a new Tauri command `cmd_get_active_app`.**

The crate's `get_active_window()` returns an `ActiveWindow` struct with `app_name` (process name), `title` (window title), and `process_path`. This covers macOS (via NSWorkspace) and Windows (via GetForegroundWindow + process enumeration) in a single call with a unified API. It was updated 28 days before this research; actively maintained.

On macOS, reading the window title requires screen recording permission — which AI Buddy already requests. The `app_name` (process name) field is available without that permission.

**Alternative not recommended:** The `frontmost` crate (macOS-only, updated Feb 2026) uses NSWorkspace notifications — appropriate for continuous tracking, over-engineered for on-demand snapshot at intent time. Ruled out: macOS only, no Windows coverage.

**New Tauri command:** `cmd_get_active_app() -> Result<Option<String>, String>` in a new file `src-tauri/src/app_context.rs`. Returns just the app name string (no full path, no window title). Called from JS at overlay-show time.

**Integration point:**
1. In `onOverlayShown` handler in SidebarShell, call `getActiveApp()` (new tauri.ts wrapper).
2. Set `detectedApp` signal.
3. Pass to `QuickActions` component for contextual button selection.
4. Pass as `appContext` field to `recordInteraction` (the `app_context` column already exists in the interactions schema — it is always `null` today, this populates it).

**New:** `src-tauri/src/app_context.rs` + register in `lib.rs` + `getActiveApp()` in `tauri.ts`.

**Confidence: MEDIUM** — `active-win-pos-rs` is maintained and cross-platform, but integration with Tauri's permission model on macOS needs hands-on validation. macOS may surface an Accessibility permission dialog on first use of `get_active_window()`.

---

## Feature 5: Multi-Monitor Support

### Tauri v2 monitor and cursor APIs

Both the Rust backend and JS frontend have the needed APIs in Tauri v2 stable.

**Rust backend (HIGH confidence — from docs.rs):**
- `app_handle.cursor_position()` returns `Result<PhysicalPosition<f64>>`
- `app_handle.available_monitors()` returns `Result<Vec<Monitor>>`
- `app_handle.monitor_from_point(x, y)` returns `Result<Option<Monitor>>`

**JS frontend (HIGH confidence — from v2.tauri.app/reference):**
- `cursorPosition()` — physical pixels
- `availableMonitors()` — list of Monitor objects
- `monitorFromPoint(x, y)`
- `primaryMonitor()`

### Repositioning sequence for overlay before show

The existing `toggle_overlay` in `window.rs` uses `window.primary_monitor()` unconditionally. This must be replaced with cursor-based monitor detection.

**Proposed sequence (Rust, inside `toggle_overlay`):**

```rust
// 1. Get cursor position from AppHandle (requires AppHandle, not just WebviewWindow)
let cursor = app.cursor_position()?;

// 2. Get monitor containing cursor, fall back to primary
let monitor = app
    .monitor_from_point(cursor.x, cursor.y)?
    .or_else(|| window.primary_monitor().ok().flatten());

// 3. Position overlay at right edge of that monitor
if let Some(monitor) = monitor {
    let pos = monitor.position();
    let size = monitor.size();
    let scale = monitor.scale_factor();
    let x = pos.x + size.width as i32 - (300.0 * scale) as i32;
    let y = pos.y + (menu_bar_height * scale) as i32;
    window.set_position(PhysicalPosition::new(x, y))?;
    window.set_size(LogicalSize::new(300.0, height))?;
}
```

The current `toggle_overlay` signature takes only `&WebviewWindow`. To access `cursor_position()` it needs `AppHandle`. The function must be changed to take `(app: &AppHandle, window: &WebviewWindow)`. The call sites in `shortcut.rs` and `cmd_toggle_overlay` in `window.rs` must be updated accordingly.

The region-select window (`cmd_open_region_select`) has the same problem — it already takes `AppHandle` as a parameter, so cursor detection is a straightforward add there.

**Modified:** `src-tauri/src/window.rs` — both `toggle_overlay` and `cmd_open_region_select` functions. Signature change in `toggle_overlay` cascades to `shortcut.rs`.

**No new IPC needed** — this is purely a Rust-internal change to window positioning logic.

**Confidence: HIGH** — `AppHandle::cursor_position()` and `monitor_from_point` are in Tauri v2 stable docs.

---

## Feature 6: Response History

### In-session signal vs persisted SQLite?

**Recommendation: In-session SolidJS signal only. Do not persist to SQLite.**

Rationale:
- Response history (scroll back through previous guidance in the current session) is within-session UI state. The `interactions` table in SQLite already stores the guidance text permanently for learning purposes. Re-querying SQLite to populate a UI scroll view adds complexity without benefit.
- The `conversationHistory` signal (from Feature 2) already contains both user intents and assistant responses. Response history is a UI rendering of that signal.
- SQLite persistence would only matter if users need history across separate sessions — that is a v3 concern (and the SettingsScreen already has a skill profile view that provides cross-session context).

**Implementation:** `GuidanceList.tsx` currently renders only `streamingText` (the most recent response). For response history, `GuidanceList` should receive the full `conversationHistory` array and render all assistant turns with visual separators, scrolled to the most recent.

The two coexist: during streaming the current assistant turn is still accumulating in `streamingText`. Render `conversationHistory` (completed prior turns) first, then append the live `streamingText` buffer at the bottom.

**Modified component:** `GuidanceList.tsx` — accept `conversationHistory: Message[]` prop alongside `streamingText`. Render prior turns greyed or separated, live buffer at bottom.

**No new Tauri IPC or SQLite schema changes needed.**

**Confidence: HIGH** — pure frontend state.

---

## Feature 7: Inline Copy Buttons and "Try Another Way"

Not the primary research questions but relevant to build order:

**Inline copy buttons:** `GuidanceList` line renderer detects code fences or inline code in `streamingText`. Wrap detected code segments in a `<pre>` with a copy button. Pure frontend, no IPC. Lowest-risk addition; can land in any phase.

**"Try another way":** Calls `submitIntent(lastIntent() + " — try a different approach")` with `forceFullSteps = true` to bypass tier degradation. Rendered as a button in the post-streaming controls area. Pure frontend. Reuses the existing `handleShowFullSteps` pattern.

---

## Component Boundary Map

### New Files

| File | Type | Purpose |
|------|------|---------|
| `src/components/QuickActions.tsx` | SolidJS component | Action buttons, reads detectedApp, calls handleSubmit |
| `src-tauri/src/app_context.rs` | Rust module | App detection via active-win-pos-rs |

### Modified Files

| File | Change | Risk |
|------|--------|------|
| `src/components/SidebarShell.tsx` | Add conversationHistory, detectedApp, stepStates signals; conditional onOverlayShown reset; wire QuickActions | Medium — core state machine |
| `src/components/GuidanceList.tsx` | Accept conversationHistory + stepStates; render history; per-step checkmarks; copy buttons | Low — additive rendering changes |
| `src/lib/ai.ts` | StreamGuidanceOptions accepts messages array for multi-turn | Low — additive option, backward-compatible with single-turn fallback |
| `src/lib/tauri.ts` | Add getActiveApp() wrapper | Low — additive |
| `src-tauri/src/window.rs` | Cursor-based monitor detection in toggle_overlay and cmd_open_region_select; toggle_overlay gains AppHandle param | Medium — affects all overlay positioning and cascades to shortcut.rs |
| `src-tauri/src/shortcut.rs` | Update toggle_overlay call site to pass app handle | Low — mechanical change driven by window.rs signature |
| `src-tauri/src/lib.rs` | Register cmd_get_active_app | Low — additive |
| `Cargo.toml` | Add active-win-pos-rs = "0.10" | Low |

### Unchanged Files

| File | Reason Stable |
|------|---------------|
| `src-tauri/src/memory.rs` | app_context column already exists; populated by recordInteraction, no schema change |
| `src-tauri/src/voice/` | No changes to STT/TTS pipeline |
| `worker/src/index.ts` | /chat already passes messages array verbatim; /classify unchanged |
| `src-tauri/src/preferences.rs` | No new prefs for v2 features |
| `src-tauri/src/screenshot.rs` | Unchanged |

---

## Recommended Build Order (Minimizes Breaking Changes)

The order is driven by two constraints: (a) each feature should be testable in isolation, (b) features that modify the core state machine in SidebarShell should land after features that only add new modules.

**Phase 1 — Backend foundations (zero UI risk)**
1. App detection: add `app_context.rs`, register `cmd_get_active_app`, add `getActiveApp()` to tauri.ts. Wire to `recordInteraction`'s `appContext` arg — the SQLite column is already there, this just populates it.
2. Multi-monitor: refactor `window.rs` cursor-based positioning. Test on single-monitor first (behavior identical), then multi-monitor.

**Phase 2 — Conversation continuity (moderate state machine risk)**
3. Add `conversationHistory` signal to SidebarShell. Modify `streamGuidance` call to pass messages array. Change `onOverlayShown` reset to be conditional — this is the one change that touches existing behavior.
4. Update `GuidanceList` to render history (prior turns greyed, current turn live). This is additive — if conversationHistory is empty, behavior is identical to v1.

**Phase 3 — Step tracking and response history (GuidanceList additive)**
5. Add `stepStates` to SidebarShell. Update GuidanceList to render per-step checkmarks and copy buttons.
6. Response history scrolling falls out of Phase 2 GuidanceList changes — verify scroll behavior with multiple turns.

**Phase 4 — Action-first UI (new component, low risk)**
7. Add `QuickActions.tsx`. Wire `detectedApp` from app detection (Phase 1) to button selection logic. Add "Try another way" button to post-streaming controls.
8. Step-first system prompt enforcement: update `SYSTEM_PROMPT` in ai.ts — no numbered steps in preamble, numbered steps from line 1.

---

## Critical Integration Pitfalls

### Pitfall 1: onOverlayShown Unconditional Reset (HIGH RISK)
**What goes wrong:** The current reset in `onOverlayShown` clears `streamingText`, `errorMessage`, and `streamingText` on every overlay show. If conversationHistory and step state are added without changing this, history and steps evaporate on every hide/show toggle.
**Fix:** Make the reset conditional on new submission, not on overlay visibility. The reset block in `onOverlayShown` should only fire when `contentState() === "empty"` with no active session — or move the reset to `submitIntent` where it already partially occurs.
**Detection:** Regression immediately visible: hide overlay mid-guidance, re-open, observe empty state.

### Pitfall 2: messages Array Growth Unbounded
**What goes wrong:** Passing full conversationHistory to Claude on every turn will eventually hit the 4096 max_tokens ceiling or create expensive requests. Session conversations with screenshots grow quickly.
**Fix:** Implement message trimming in SidebarShell before passing to streamGuidance: remove screenshots from non-current turns, summarize after 3 assistant turns. This must be implemented in Phase 2, not deferred.
**Detection:** Monitor request body sizes in dev; Claude will return 400/context errors if not addressed.

### Pitfall 3: App Detection macOS Permission (MEDIUM RISK)
**What goes wrong:** `active-win-pos-rs` on macOS may trigger an Accessibility or Screen Recording permission prompt separate from the one AI Buddy already requests. If this happens at overlay-show time, it interrupts UX with a system dialog.
**Fix:** Call `get_active_window()` in a background task (tauri::async_runtime::spawn), not in the shortcut callback. Return only `app_name` (not window title) to minimize permission surface. Test on a clean macOS install with no prior permission grants before shipping.
**Detection:** Tauri permission prompt appearing on first app launch on a clean system.

### Pitfall 4: toggle_overlay Signature Cascade
**What goes wrong:** Changing `toggle_overlay` to take `(app: &AppHandle, window: &WebviewWindow)` cascades to `shortcut.rs` which calls it. If `shortcut.rs` is not updated in the same commit, compilation fails.
**Fix:** Update both files in the same change. The signature change is mechanical and low-risk, but must be coordinated.
**Detection:** Compile error — this one is impossible to miss.

### Pitfall 5: Region Select Multi-Monitor Coverage
**What goes wrong:** The region-select window uses `win.primary_monitor()` for sizing. On a multi-monitor setup, if the user triggers region-select from the overlay on a secondary monitor, the region-select window will cover the wrong screen.
**Fix:** Apply cursor-based monitor detection to `cmd_open_region_select`. Coordinate this change with the toggle_overlay refactor in Phase 1 step 2.

---

## Data Flow: v2 Full Request Cycle

```
[Shortcut pressed]
  → toggle_overlay(app, window) (Rust)
    → cursor_position() + monitor_from_point() → reposition overlay on active monitor
    → window.show() + emit("overlay-shown")
  → onOverlayShown (SolidJS)
    → getActiveApp() → detectedApp signal (fire-and-forget, no blocking)
    → conditional reset (only if no active session)
    → QuickActions renders contextual buttons based on detectedApp

[User clicks action OR types intent]
  → submitIntent(text)
    → reset streamingText, stepStates, errorMessage (here, not in onOverlayShown)
    → prepareGuidanceContext → /classify → tier + taskLabel
    → getMemoryContext (if tier > 1)
    → captureScreenshot OR captureRegion
    → build messages: trim(conversationHistory) + currentTurn (with screenshot)
    → streamGuidance(messages)
      → POST /chat (Claude SSE stream)
        → onToken: appends to live streamingText buffer
        → onDone: push { role: 'assistant', content: streamingText } to conversationHistory
                  recordInteraction(taskLabel, intent, guidance, tier, detectedApp)
                  playTts if enabled

[User checks off step]
  → stepStates signal updated (no IPC)

[User clicks "Try another way"]
  → submitIntent(lastIntent + " — try a different approach", forceFullSteps=true)

[Overlay hidden and re-shown]
  → onOverlayShown fires
  → conversationHistory and stepStates preserved (conditional reset)
  → detectedApp refreshed
```

---

## Confidence Assessment

| Area | Confidence | Basis |
|------|------------|-------|
| Quick actions integration | HIGH | Direct reuse of submitIntent; no state machine changes needed |
| Conversation continuity | HIGH | Claude Messages API multi-turn already supported; Worker passes messages verbatim |
| Step tracking (signals only) | HIGH | Pure frontend, no IPC |
| App detection cross-platform | MEDIUM | active-win-pos-rs v0.10.0 actively maintained; macOS permission interaction needs hands-on validation |
| Multi-monitor cursor detection | HIGH | AppHandle::cursor_position + monitor_from_point in Tauri v2 stable |
| Response history (frontend) | HIGH | Falls out of conversationHistory signal; additive GuidanceList change |

---

## Sources

- Tauri v2 window API (JS): https://v2.tauri.app/reference/javascript/api/namespacewindow/
- Tauri AppHandle Rust docs: https://docs.rs/tauri/latest/tauri/struct.AppHandle.html
- active-win-pos-rs crate (v0.10.0, 2026-03-13): https://github.com/dimusic/active-win-pos-rs
- active-win-pos-rs on crates.io: https://crates.io/crates/active-win-pos-rs
- frontmost crate (macOS-only): https://crates.io/crates/frontmost
- NSWorkspace frontmostApplication (Apple): https://developer.apple.com/documentation/appkit/nsworkspace/frontmostapplication
- Tauri monitor_from_point feature request: https://github.com/tauri-apps/tauri/issues/3057
- Windows GetForegroundWindow Rust bindings: https://microsoft.github.io/windows-docs-rs/doc/windows/Win32/UI/WindowsAndMessaging/fn.GetForegroundWindow.html
