# Domain Pitfalls: AI Buddy v2.0 — Adding Features to an Existing Tauri App

**Domain:** Cross-platform AI desktop assistant (Tauri v2 + SolidJS + Rust)
**Researched:** 2026-04-10
**Scope:** Pitfalls specific to v2.0 feature additions. v1.0 pitfalls retained in a separate section for reference.
**Overall Confidence:** MEDIUM-HIGH (core issues verified via active GitHub issues, official docs, and SolidJS issue tracker)

---

## v2.0 Critical Pitfalls

These are the mistakes most likely to cause regressions in the working v1.0 system or require significant rework on v2 features.

---

### Pitfall V2-1: Async Classification Arrival After State Has Already Changed

**What goes wrong:** In `submitIntent`, the app calls `prepareGuidanceContext(intent)` to get tier/taskLabel before starting the stream. If the user submits a new query before the classification resolves (rapid successive submissions), or presses the Close/hide shortcut while classification is pending, the classification result arrives and mutates `currentTier` / `taskLabel` for the wrong query or into an already-aborted request.

**Specific code risk in `SidebarShell.tsx`:**
The existing `abortController?.abort()` call fires before classification begins. But `prepareGuidanceContext` is a Tauri IPC call — it does not accept an AbortSignal. The abort only cancels the downstream fetch, not the classification. The `ctx` from a cancelled request will still arrive and call `setCurrentTier()`, corrupting UI state for the subsequent query.

**Why it happens:** SolidJS signals accessed inside `async` functions do not re-read reactively across `await` boundaries. The `contentState()` read inside `onToken` callback was already closed over when the async function started. A stale `contentState` read on line `if (contentState() === "loading")` can fail to transition if the signal was mutated by a concurrent action.

**Consequences:** Step tracker shows the tier from the previous query. "Show full steps" button appears on results where tier was actually 1. In a follow-up conversation, `memoryContext` gets fetched but injected into the wrong request.

**Prevention:**
- Gate classification result application on a request ID. Increment a `requestId` counter on every `submitIntent` call. Close over the ID at the start. After `await prepareGuidanceContext()`, check if the closed-over ID still matches the current ID signal; if not, discard and return.
- Add this guard before every await result is applied to signals:
  ```typescript
  const requestId = ++requestCounter;
  const ctx = await prepareGuidanceContext(intent);
  if (requestId !== currentRequestId()) return; // stale, abort
  setCurrentTier(ctx.tier);
  ```
- Keep the classification IPC call timeout short (2-3s max). Fall back to tier 1 on timeout.

**Detection:** Submit two queries in rapid succession (type, Enter, immediately type again, Enter). Inspect `currentTier` signal — it should reflect the second query's tier, not the first.

**Phase relevance:** Any phase that modifies `submitIntent` or adds async steps before streaming begins.

---

### Pitfall V2-2: Conversation Continuity Context Window Bloat

**What goes wrong:** Multi-turn conversation means each follow-up appends previous messages to the Claude API request body. The current `streamGuidance` always sends a single-turn `messages` array. Adding history means: screenshot (base64 JPEG, ~50-300KB as base64) + guidance text (~500-2000 tokens) multiplied by every turn in the session. A 10-turn session with screenshots at each turn can reach 100,000+ input tokens — 10-40x the single-turn cost.

**Specific risk for this codebase:** The current `streamGuidance` in `ai.ts` builds `userContent` as a plain array with a single screenshot + text block. Naively appending to a `messages` history array while keeping screenshots in each turn is the most common mistake.

**Why it happens:** Claude's Messages API requires the full conversation history on every call (no server-side session state). Screenshot base64 strings are 4x larger than the original binary, and the Claude API counts every character toward input tokens.

**Consequences:**
- API costs grow superlinearly with session length
- Latency increases as the token count grows
- Context window hits the 200K limit for long sessions, causing hard failures
- Privacy risk: conversation history (including screenshots embedded as base64) is sent to Anthropic on every turn

**Prevention:**
- Never include screenshots from previous turns in the `messages` history. Only the current turn gets a screenshot. Prior turns get text-only assistant messages + user text.
- Cap history depth. For a guidance tool, 3-5 turns of context is sufficient. Truncate oldest turns first.
- Keep the session context local. Do not persist `messages` history between overlay open/close cycles unless the user explicitly continues a task. The current `onOverlayShown` reset pattern is correct — preserve it.
- Strip or summarize long guidance responses before putting them in history. If Claude returned 1200 tokens, summarize to "User asked how to X; guidance provided numbered steps 1-6" before appending to history.

**Privacy note:** Each API call sends the conversation to Anthropic. If the conversation contains sensitive screen content, every follow-up retransmits that content. This is the correct tradeoff for the app's value prop, but it must be disclosed in the privacy policy and the history depth cap enforces a bound on exposure.

**Detection:** Log `messages` array size (in characters, not tokens) before each API call. Alert in dev mode if it exceeds 50,000 characters.

**Phase relevance:** Conversation continuity phase. Must be designed in from the start, not added as an afterthought.

---

### Pitfall V2-3: App Detection — macOS Requires Accessibility Permission, Not Screen Recording

**What goes wrong:** Getting the frontmost application name on macOS using `NSWorkspace.sharedWorkspace().frontmostApplication` does NOT require Accessibility permission for the app bundle name and process name alone. However, getting the window title (which is needed to detect "VS Code — my-project" vs just "VS Code") DOES require Accessibility API access, which requires explicit `kAXTrustedCheckOptionPrompt` / Accessibility permission granted in System Preferences.

The `active-win-pos-rs` crate documents this explicitly: the `title` property always returns an empty string on macOS unless Screen Recording permission is enabled — but the app bundle name and process ID are available without any special permission.

**Why it happens:** macOS separates "what app is in front" (public NSWorkspace API, no special permission) from "what is the focused window/document" (Accessibility API, requires permission). Developers conflate the two and either request unnecessary permissions or fail silently when window title is empty.

**Consequences:**
- App detection works for matching "VS Code" but not "VS Code — untitled.py" without the right permission
- If the app requests Accessibility permission without a clear explanation, macOS shows a confusing system dialog at an unexpected moment, breaking user trust
- On Windows, `GetForegroundWindow` → `GetWindowText` → `GetWindowThreadProcessId` → `OpenProcess` → `GetModuleFileNameEx` chain: if any step fails (UAC-elevated target process), it fails silently and returns NULL/empty

**Windows-specific silent failures:**
- `GetForegroundWindow()` returns NULL when no window has focus (e.g., user is on the desktop, or a DirectX exclusive fullscreen app has focus)
- `GetWindowText` returns empty for many UWP apps (Windows Store apps use a different windowing model)
- Process name resolution fails for elevated processes if the Tauri app is not also elevated (access denied, no error surfaced)

**Prevention:**
- Use `NSWorkspace` for bundle name detection only (no special permission). Treat window title as best-effort, available only if Accessibility permission is already granted (for screen capture — the user has likely already approved it).
- On macOS, use the `frontmost` crate (NSWorkspace notification observer) or `active-win-pos-rs`. Accept that `title` may be empty and design the app detection feature to work with bundle name alone.
- On Windows, wrap the entire detection chain in a `Result<>` and default to "Unknown" with a short retry rather than hanging. Log failures at debug level.
- Build app detection as a best-effort enhancement, not a hard dependency. If detection fails, show no pre-suggested actions rather than crashing or showing wrong ones.
- Add a test case: frontmost app detection should never panic or hang the main thread. Call it from a spawned tokio task.

**Detection:** Test app detection with: (1) the desktop focused (no app), (2) a System Preferences window focused, (3) a UAC dialog open on Windows, (4) a Terminal.app window open on macOS with a Python script running.

**Phase relevance:** App detection phase. Validate permission model before building any UI on top of app detection results.

---

### Pitfall V2-4: Multi-Monitor Window Positioning — Mixed Physical/Logical Coordinate Bug

**What goes wrong:** The existing `toggle_overlay` in `window.rs` uses `window.primary_monitor()` hardcoded. This is wrong for multi-monitor: the overlay always opens on the primary monitor regardless of where the user is working. The v2 feature is "overlay opens on the active monitor via cursor-based detection."

The Tauri API provides `available_monitors()` and `cursor_position()` but has a documented bug (GitHub issue #7890, still open as of 2026-04): on macOS with mixed-DPI multi-monitor setups (Retina MacBook + non-Retina external), monitor physical positions mix scaled and unscaled coordinates. The primary monitor's offset is correct, but secondary monitor's reported `PhysicalPosition.x` uses the scaled width of the primary monitor as its origin, not the actual physical pixel offset.

**Concrete example from the GitHub issue:**
- MacBook Pro (3600×2388 physical → scaled to 1800×1169): reports `PhysicalPosition { x: 0, y: 0 }`
- External 3440×1440 at 1x: reports `PhysicalPosition { x: 1800, y: -271 }` — the x=1800 is the MacBook's _logical_ width, not the physical boundary

This makes `monitor_from_point(cursor_x, cursor_y)` unreliable on this common hardware configuration.

**Additional known issue:** `current_monitor()` on a newly created window can return the wrong monitor or `None` if called before the window is fully positioned. Calling it immediately after `set_position` is not safe.

**Why it happens:** The underlying `tao` crate (Tauri's windowing layer) delegates to CoreGraphics on macOS. CGDirectDisplayID coordinate system differs from the logical coordinate system in a way that `tao` does not consistently reconcile.

**Consequences:**
- Overlay opens on the wrong monitor
- Calculated x position lands the overlay off-screen (off the right edge or to the left of the monitor's visible area)
- `set_size(LogicalSize)` combined with `set_position(PhysicalPosition)` — one is logical, one is physical — causes wrong sizing on non-1.0 scale monitors (current `window.rs` already has this mixed-unit pattern on lines 26-36)

**Prevention:**
- For cursor-based active monitor detection, use `available_monitors()` to enumerate all monitors. Iterate and find the monitor whose `PhysicalRect` (position + size) contains the cursor's physical position. Do NOT use `current_monitor()` or `monitor_from_point` from the JS API.
- Choose one coordinate system and be explicit. Use `PhysicalPosition` + `PhysicalSize` everywhere, or use `LogicalPosition` + `LogicalSize` everywhere. Never mix within the same window operation.
- The existing `window.rs:34-38` mixed-unit pattern is a pre-existing bug: `set_position(PhysicalPosition { x, y })` followed by `set_size(LogicalSize { 300.0, height })`. This will position incorrectly on 2x displays. Fix this when adding multi-monitor support.
- Add an integration test: on a single-monitor 2x display, verify the overlay right-aligns to the screen edge. If it's off by `window_width * (scale - 1)` pixels, the unit mixing bug is present.
- Graceful fallback: if monitor detection produces a position outside the union of all monitor bounds, fall back to primary monitor.

**Detection:** Connect a MacBook Pro to an external 1080p monitor. Move the mouse to the external monitor. Trigger the overlay. Verify it opens on the external monitor, right-aligned, not on the MacBook screen.

**Phase relevance:** Multi-monitor phase. The mixed-unit pre-existing bug in `window.rs` should be fixed in the same phase, not separately.

---

### Pitfall V2-5: Step Tracker Broken by AI Output Variability During Streaming

**What goes wrong:** Step progress tracking requires knowing "how many total steps are there" before the stream completes, so the tracker can show step 1 of N. But Claude's step count is only knowable after streaming ends. During streaming, the step parser sees partial text — "1. Open the File" before "menu\n2. Click..." arrives — so a naive split-on-newline parser will create phantom steps mid-stream.

The current `GuidanceList.tsx` already splits on newlines and renders them live. Adding a step tracker that shows `Step X of N` to this is the specific failure mode: `N` is unknown until the stream ends, so early renders show "Step 1 of ?" or "Step 1 of 3" that jumps to "Step 1 of 7" as more steps arrive.

**Why it happens:** AI output is non-deterministic in length. Claude may output 3 steps or 12 steps for similar intents. The system prompt says "number every step" but tier 3 responses don't use numbered lists ("hints only — one or two sentences"). Parsing logic that works for tier 1 will produce zero steps for tier 3.

**Additional failure modes:**
- Claude outputs `**1. Open File Menu**` (markdown bold around the step) — a plain `line.startsWith("1.")` check misses this
- Claude outputs steps with sub-bullets: `1. Open File\n   - Use Ctrl+O shortcut` — the sub-bullet is a separate line that the tracker counts as an extra step
- Tier 2 responses may use prose with numbered references ("First do X, then do Y") rather than a numbered list — the regex `^\d+\.` incorrectly matches "2024. That was the year..." in a context line

**Consequences:**
- Step counter flickers during streaming (count changes as tokens arrive)
- Clicking "Step 3" highlights the wrong line because the parser counted sub-bullets as steps
- Tier 3 hints show "0 steps found" in the tracker
- Copy buttons inside step text areas are attached to the wrong node if the step list re-renders with different keying during stream

**Prevention:**
- Do not show total step count until `onDone` fires. During streaming, show "Step X of ..." (ellipsis). Only resolve to "Step X of N" after the stream is complete.
- Parse steps from the final completed text in `onDone`, not from streaming chunks. Use the final `streamingText()` signal to build the step model once.
- The step parser must handle: numbered lines, bold-wrapped numbered lines (`**1. ...**`), and must skip sub-bullets (lines that start with whitespace before a `-` or `*`).
- Guard against tier 3 (hints-only) responses: if the tier is 3 or if no numbered steps are detected, hide the step tracker entirely rather than showing "0 steps."
- Assign stable step IDs from the parsed final list — do not use array index as React/Solid key because re-parses during streaming will produce different arrays.

**Detection:** Stream a response for a complex 8-step task. Watch the step counter during streaming — it should not flicker. After `onDone`, verify the count matches the visual number of numbered items.

**Phase relevance:** Step tracking phase. Build the step parser against the final text only; do not attempt live step counting during stream.

---

### Pitfall V2-6: Breaking the Existing Streaming Flow by Modifying contentState Transitions

**What goes wrong:** `contentState` in `SidebarShell.tsx` is a six-state machine: `"empty" | "loading" | "streaming" | "error" | "listening" | "selecting"`. The existing transitions are carefully designed — notably, `contentState === "streaming"` is the gate for `GuidanceList` to render. The transition from `"loading"` to `"streaming"` happens inside the `onToken` callback.

**v2 features that are likely to break this:**

1. **Action-first quick buttons:** If quick actions are rendered in the `"empty"` state and trigger `submitIntent`, they must respect the same abort-and-replace pattern. If a quick action button is clicked while a stream is in progress, the existing abort logic fires. But if the button renders inside a `Show when={contentState() === "empty"}` block that disappears the moment `loading` is set, the button click event may fire before the state update propagates, causing a double submission.

2. **Conversation continuity:** Adding a `"history"` or `"follow-up"` state risks fragmenting the `GuidanceList` visibility condition (`contentState() === "streaming"`) into multiple branches. If a developer adds `|| contentState() === "follow-up"` without also guarding the abort controller, the abort-on-new-submit protection breaks.

3. **Response history scroll:** Persisting previous guidance requires either (a) keeping `streamingText` non-empty after completion, or (b) storing completed responses in a separate array. Option (a) breaks the existing empty state logic (`streamingText().length > 0` is used to condition the tier degradation notice on line 420). Option (b) is correct but requires care: do not use `streamingText` for history.

4. **"Try another way" feature:** This calls `submitIntent` with the same `lastIntent` but a different system prompt. If the new stream sets `streamingText("")` at the top of `submitIntent` (current line 208), it clears the displayed guidance before the new stream starts, causing a visible flash to empty state.

**Why it happens:** SolidJS reactivity updates synchronously within a tick. A batch of signal writes in `submitIntent` (lines 207-214) fires all renders before the async work starts. Adding one more signal write (e.g., pushing to a history array) in the wrong order causes unexpected intermediate renders.

**Consequences:**
- Flash of empty state between "try another way" submissions
- Double-submission if quick action buttons are inside `Show` blocks
- `GuidanceList` renders stale text from a previous response while new stream is loading
- Abort controller not activated for history/follow-up state paths

**Prevention:**
- Treat `contentState` as a formal state machine. Before adding any new state, draw the full transition diagram including: which states allow user input, which states show GuidanceList, and which states allow abort. Do not add a new state without mapping all transitions.
- Use SolidJS `batch()` to make all signal mutations in `submitIntent` atomic. Wrap lines 207-214 in `batch(() => { ... })` to prevent intermediate renders.
- History array for previous responses must be separate from `streamingText`. On `onDone`, push a snapshot to a `completedResponses` array and do NOT clear `streamingText` — the completed text stays until the next `submitIntent` call.
- Gate quick action buttons on `contentState() === "empty" && !isStreaming()` where `isStreaming` is a derived signal, not a raw state check.

**Detection:** Using the browser devtools timeline or SolidJS devtools, verify that `submitIntent` produces exactly one re-render cycle for the loading transition, not two or three.

**Phase relevance:** Every v2 phase that touches `SidebarShell` or `GuidanceList`. The state machine audit should happen before any feature work begins.

---

## Pre-Existing Bugs to Fix in v2

These are not new pitfalls but bugs in the v1.0 codebase that will compound with v2 features if not addressed.

### Bug 1: Mixed Physical/Logical Units in window.rs

**Location:** `window.rs` lines 26-38. `set_position` uses `PhysicalPosition` but `set_size` uses `LogicalSize`. On a 2x scale display, this positions correctly but sizes incorrectly — the window will be half the intended size on macOS Retina.

**Fix:** Use `LogicalPosition` + `LogicalSize` consistently, or `PhysicalPosition` + `PhysicalSize` consistently. The simplest fix: convert everything to logical units using the monitor's `scale_factor()`.

### Bug 2: primary_monitor() Hardcoded for Overlay Positioning

**Location:** `window.rs` line 21 — `window.primary_monitor()`. Multi-monitor support requires cursor-based monitor detection. This is the architectural change for the multi-monitor phase.

### Bug 3: GuidanceList Lines() Calls scrollToBottom() as a Side Effect Inside a Reactive Derivation

**Location:** `GuidanceList.tsx` lines 24-29. The `lines()` derived value calls `scrollToBottom()` inside it. This is a side effect inside a reactive computation — a known SolidJS anti-pattern. It will cause multiple `scrollToBottom` calls per render if `lines()` is accessed more than once, and it fires during reconciliation, not after DOM update. This becomes a problem when step tracker reads `lines()` to compute step count.

**Fix:** Move `scrollToBottom()` to a `createEffect(() => { lines(); scrollToBottom(); })` — read `lines()` as a dependency trigger only, call the scroll imperatively after the render.

---

## v1.0 Critical Pitfalls (Retained for Reference)

The original pitfalls from v1.0 research remain relevant and are not superseded by v2 additions.

### Pitfall 1: macOS Screen Recording Permission Breaks on App Update

Every new signed binary = new code signature hash = permission revoked silently. Build permission check + repair flow. See v1.0 PITFALLS.md for full detail.

### Pitfall 2: macOS Private API Requirement Locks Out App Store

`macOSPrivateApi: true` permanently disqualifies from Mac App Store. Documented decision; direct distribution is the path.

### Pitfall 3: Overlay Invisible Over Fullscreen Apps

NSWindowLevel override required for fullscreen app visibility. Test against Figma fullscreen, Final Cut Pro.

### Pitfall 4: CPU Polling for Click-Through

60fps Rust cursor poll for `setIgnoreCursorEvents`. Add idle detection at 10fps when cursor stationary.

### Pitfall 5: xcap Active Bugs

Hang on macOS (#209), memory leak on M4 (#203). Abstract the capture interface for swap-out. Pin version.

### Pitfall 6: Voice Latency Stack

825ms–2100ms total. Requires streaming STT + streaming Claude + streaming TTS from first integration.

### Pitfall 7: Claude Vision Hallucination on Compact UI

Small icons misidentified. Use directional language; require region selection for precise guidance.

### Pitfall 8: Learning Memory Schema Lock-In

No migrations = data loss on schema change. Use rusqlite migrations + event sourcing from first schema.

### Pitfall 9: API Proxy Without Per-User Rate Limiting

Installation token + Cloudflare WAF rate limit required before public access.

### Pitfall 10: WebView2 Not Pre-Installed on Windows 10

Bundle WebView2 bootstrapper in NSIS installer.

---

## Phase-Specific Warnings for v2.0

| v2 Phase Topic | Likely Pitfall | Mitigation |
|---|---|---|
| Action-first UI + classification | Stale ctx from cancelled classification (V2-1) | Request ID guard before applying any classification result |
| Action-first UI buttons | Double-submit from `Show` block disappearing (V2-6) | Derive `isStreaming` signal; gate buttons on it |
| Conversation continuity | Screenshot base64 in every history turn bloats context (V2-2) | Text-only history for prior turns; cap at 3-5 turns |
| Conversation continuity | History persists to next task session (V2-2) | Reset history array on `overlay-shown` event, same as other state |
| App detection (macOS) | Accessibility permission requested unexpectedly (V2-3) | Bundle name only via NSWorkspace; title is best-effort |
| App detection (Windows) | NULL return from GetForegroundWindow silently (V2-3) | Wrap full detection chain in Result; default to "Unknown" |
| Multi-monitor overlay | Mixed physical/logical units off-screen (V2-4) | Fix existing mixed-unit bug in window.rs first |
| Multi-monitor overlay | current_monitor() returning None or wrong monitor (V2-4) | Use available_monitors() + cursor position range check |
| Step tracking | Flicker during streaming as step count changes (V2-5) | Parse step model from final text only, after onDone |
| Step tracking | Sub-bullets counted as steps (V2-5) | Parser must skip lines starting with whitespace + list marker |
| Step tracking | Tier 3 hints have no numbered steps (V2-5) | Hide tracker when tier === 3 or no steps detected |
| Try another way | Flash to empty state between submissions (V2-6) | Do not clear streamingText until new onToken fires |
| Any SidebarShell change | Undocumented contentState transition breaks abort (V2-6) | Map full state machine before adding any new state |
| GuidanceList step parser | scrollToBottom side effect in reactive derivation (Bug 3) | Move to createEffect; fix before step tracker reads lines() |

---

## Sources

- SolidJS stale signal in async: https://github.com/solidjs/solid/issues/2180
- SolidJS pain points and pitfalls: https://vladislav-lipatov.medium.com/solidjs-pain-points-and-pitfalls-a693f62fcb4c
- Tauri multi-monitor physical position bug (macOS): https://github.com/tauri-apps/tauri/issues/7890
- Tauri initial window position as Physical bug (Windows, Tauri 2.1): https://github.com/tauri-apps/tauri/issues/11718
- Tauri multi-window multi-monitor: https://github.com/tauri-apps/tauri/issues/14019
- Tauri cursor_position / monitor_from_point feature: https://github.com/tauri-apps/tauri/issues/3057
- active-win-pos-rs (macOS title requires Screen Recording): https://github.com/dimusic/active-win-pos-rs
- frontmost crate (NSWorkspace app tracking): https://crates.io/crates/frontmost
- macos-accessibility-client: https://crates.io/crates/macos-accessibility-client
- Claude API context windows: https://platform.claude.com/docs/en/build-with-claude/context-windows
- Claude API token cost optimization: https://dev.to/whoffagents/claude-api-cost-optimization-caching-batching-and-60-token-reduction-in-production-3n49
- DPI and scaling in Tauri/tao: https://deepwiki.com/tauri-apps/tao/8.3-dpi-and-scaling
- Tauri dpi reference: https://v2.tauri.app/reference/javascript/api/namespacedpi/
