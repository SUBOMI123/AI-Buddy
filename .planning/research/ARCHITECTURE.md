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

---

---

# Architecture Patterns: Deploy & Distribution (v3.0)

**Domain:** Tauri v2 desktop app — code signing, notarization, auto-update, Cloudflare Worker KV, CI release pipeline
**Researched:** 2026-04-13
**Overall confidence:** HIGH (Tauri updater, KV provisioning, macOS signing flow) / MEDIUM (Windows EV options, entitlements edge cases for screen capture)

---

## System Overview

The deploy & distribution milestone adds three new infrastructure layers on top of the existing app:

```
┌─────────────────────────────────────────────────────────────────┐
│                     EXISTING (v1.0 + v2.0)                      │
│  Tauri v2 app (src-tauri/)  ←→  SolidJS frontend (src/)         │
│  tauri-plugin-updater already in Cargo.toml                     │
│  Cloudflare Worker/Hono (worker/) — built, not yet deployed     │
└─────────────────────────────────────────────────────────────────┘
           ↕ IPC               ↕ HTTPS proxy
┌─────────────────┐    ┌──────────────────────────────────────────┐
│  UPDATE LAYER   │    │           NEW INFRA LAYER                │
│  (new)          │    │                                          │
│ GitHub Releases │    │  Cloudflare Worker (production)          │
│  latest.json    │    │  KV namespace: RATE_LIMIT (live ID)      │
│  .tar.gz / .exe │    │  Secrets: ANTHROPIC + ASSEMBLYAI +       │
│  .sig files     │    │          ELEVENLABS + APP_HMAC_SECRET     │
└─────────────────┘    └──────────────────────────────────────────┘
           ↑
┌──────────────────────────────────────────────────────────────────┐
│                    CI RELEASE PIPELINE (new)                     │
│  .github/workflows/release.yml                                   │
│  tauri-apps/tauri-action@v0                                      │
│  Matrix: macos-latest (aarch64), macos-13 (x86_64), windows-latest │
│  Signs → notarizes → packages → uploads → publishes latest.json │
└──────────────────────────────────────────────────────────────────┘
```

---

## Component Boundaries: New vs Modified

| Component | Responsibility | Communicates With | Status |
|-----------|---------------|-------------------|--------|
| `src-tauri/tauri.conf.json` | App identity, updater endpoint URL + pubkey | tauri-plugin-updater at runtime | Modified — fill 2 PRODUCTION REQUIRED fields + add `createUpdaterArtifacts` |
| `src-tauri/entitlements.plist` | macOS capability declarations (mic, JIT) | Apple notarization pipeline | Reviewed — currently sufficient for Hardened Runtime without App Sandbox |
| `worker/wrangler.toml` | Binds KV namespace ID to RATE_LIMIT binding | Cloudflare KV at runtime | Modified — replace placeholder ID |
| `worker/src/index.ts` | Reads `c.env.RATE_LIMIT` with graceful fallback | Cloudflare KV | No change needed |
| GitHub Releases | Hosts signed binaries + `latest.json` update manifest | tauri-plugin-updater polls on app startup | New — created by CI |
| `.github/workflows/release.yml` | Builds, signs, notarizes, packages, publishes | GitHub Releases, Apple notarization | New file |
| Ed25519 signing keypair | Signs updater artifacts | `TAURI_SIGNING_PRIVATE_KEY` in CI | New — generated once locally, never committed |

---

## Data Flow

### Update Check Flow

```
App starts
  → tauri-plugin-updater polls:
    GET https://github.com/<user>/<repo>/releases/latest/download/latest.json
  ← 200 with JSON { version, platforms: { "darwin-aarch64": { url, signature } } }
  → plugin compares current_version vs latest version
  → if newer: downloads artifact at url
  → verifies Ed25519 signature against pubkey embedded in app binary
  → if valid: installs and relaunches
  → if no update: 204 No Content or version match → no action
```

### Release Pipeline Flow

```
git tag v0.2.0 && git push --tags
  → GitHub Actions release.yml triggers on push to tag "v*"

  Parallel matrix jobs:

  → macos-latest (aarch64-apple-darwin):
      cargo tauri build --target aarch64-apple-darwin
      Bundler produces:
        AI Buddy_0.2.0_aarch64.dmg
        AI Buddy_0.2.0_aarch64.app.tar.gz
        AI Buddy_0.2.0_aarch64.app.tar.gz.sig  (Ed25519, via TAURI_SIGNING_PRIVATE_KEY)
      Sign with Developer ID Application cert (APPLE_CERTIFICATE + APPLE_SIGNING_IDENTITY)
      Notarize via APPLE_ID + APPLE_PASSWORD + APPLE_TEAM_ID (xcrun notarytool, ~5-15 min)
      Staple ticket to DMG (xcrun stapler — Tauri automates this)

  → macos-13 (x86_64-apple-darwin):
      same steps, different --target

  → windows-latest:
      cargo tauri build
      Bundler produces:
        AI Buddy_0.2.0_x64-setup.exe
        AI Buddy_0.2.0_x64-setup.exe.sig
        AI Buddy_0.2.0_x64_en-US.msi
      Optional: sign via trusted-signing-cli or relic (can be deferred for closed beta)

  tauri-action aggregates all artifacts into a draft GitHub Release
  tauri-action generates + uploads latest.json (includeUpdaterJson: true)
  Manually publish the draft → users' apps detect update within next check cycle
```

### Cloudflare Worker KV Provisioning Flow

```
One-time local setup (from worker/ directory):

  1. npx wrangler kv namespace create RATE_LIMIT
     outputs: id = "abc123def456..."
     (this ID is not a secret — safe to commit)

  2. Edit worker/wrangler.toml:
     replace placeholder id with real namespace ID

  3. Set secrets (encrypted, stored in Cloudflare — not in wrangler.toml):
     npx wrangler secret put ANTHROPIC_API_KEY
     npx wrangler secret put ASSEMBLYAI_API_KEY
     npx wrangler secret put ELEVENLABS_API_KEY
     npx wrangler secret put APP_HMAC_SECRET

  4. npx wrangler deploy
     Worker live at: https://ai-buddy-proxy.<subdomain>.workers.dev

  5. Validate:
     curl https://ai-buddy-proxy.<subdomain>.workers.dev/health
     Expected: {"status":"ok","version":"1.0.0"}

  6. Update WORKER_BASE_URL in Rust backend to production URL
     (find the hardcoded or configured URL in src-tauri/src/lib.rs)
```

---

## Section 1: Tauri Updater Plugin

**Confidence: HIGH** — Verified against official Tauri v2 docs.

### Current State

`tauri-plugin-updater = "2"` is already in `Cargo.toml`. No dependency change needed.

### What Needs to Change in tauri.conf.json

Two PRODUCTION REQUIRED banners must be resolved, and one new field added:

```jsonc
{
  "bundle": {
    "active": true,
    "createUpdaterArtifacts": true,    // ADD — tells bundler to produce .tar.gz + .sig files
    "targets": "all",
    "icon": [...]
  },
  "plugins": {
    "updater": {
      // REPLACE endpoint placeholder:
      "endpoints": [
        "https://github.com/<user>/<repo>/releases/latest/download/latest.json"
      ],
      // REPLACE pubkey placeholder (paste output from signer generate):
      "pubkey": "dW50cnVzdGVkIGNvbW1lbnQ6..."
    }
  }
}
```

Using GitHub Releases as the update server eliminates the need for a custom `releases.aibuddy.app` server. `tauri-action` generates and uploads `latest.json` automatically when `includeUpdaterJson: true` is set in the CI workflow.

### Keypair Generation (run once, locally, before any release)

```bash
cargo tauri signer generate -w ~/.tauri/ai-buddy.key
# Prints to stdout:
#   Public key: dW50cnVzdGVkIGNvbW1lbnQ6...  ← paste into tauri.conf.json pubkey field
#   Private key written to ~/.tauri/ai-buddy.key  ← store as CI secret, never commit
```

WARNING: If the private key is lost, existing users cannot receive future auto-updates. Back it up.

### latest.json Format (generated by tauri-action, for reference)

```json
{
  "version": "0.2.0",
  "notes": "What changed in this release",
  "pub_date": "2026-04-15T00:00:00Z",
  "platforms": {
    "darwin-aarch64": {
      "signature": "<content of .app.tar.gz.sig file — injected by tauri-action>",
      "url": "https://github.com/<user>/<repo>/releases/download/v0.2.0/AI.Buddy_0.2.0_aarch64.app.tar.gz"
    },
    "darwin-x86_64": {
      "signature": "<content of .app.tar.gz.sig file>",
      "url": "https://github.com/<user>/<repo>/releases/download/v0.2.0/AI.Buddy_0.2.0_x64.app.tar.gz"
    },
    "windows-x86_64": {
      "signature": "<content of -setup.exe.sig file>",
      "url": "https://github.com/<user>/<repo>/releases/download/v0.2.0/AI.Buddy_0.2.0_x64-setup.exe"
    }
  }
}
```

`tauri-action` injects signature content and download URLs. Manual editing is not required for normal releases.

### TAURI_SIGNING_PRIVATE_KEY in CI

The private key content (not the file path) goes into GitHub Actions secrets. During `cargo tauri build`, the bundler reads it to sign each artifact.

```yaml
env:
  TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}
  TAURI_SIGNING_PRIVATE_KEY_PASSWORD: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY_PASSWORD }}
```

---

## Section 2: Cloudflare Worker KV Provisioning

**Confidence: HIGH** — Verified against Cloudflare official docs.

### What Needs to Change

Only `worker/wrangler.toml` needs editing. `worker/src/index.ts` already handles the KV binding correctly with a graceful fallback (`try { if (c.env.RATE_LIMIT) { ... } } catch { // KV not available }`).

Current placeholder in wrangler.toml:
```toml
[[kv_namespaces]]
binding = "RATE_LIMIT"
id = "REPLACE-WITH-OUTPUT-OF: npx wrangler kv namespace create RATE_LIMIT"
```

After provisioning:
```toml
[[kv_namespaces]]
binding = "RATE_LIMIT"
id = "abc123def456..."    # real ID from wrangler kv namespace create
```

The namespace ID is not a secret. It is safe to commit to git alongside wrangler.toml. Secrets (API keys) are never in wrangler.toml — they are set via `wrangler secret put`.

### Post-Deploy: Update Worker URL in App

After `npx wrangler deploy`, locate where `WORKER_BASE_URL` or the proxy URL is set in `src-tauri/src/lib.rs` and update it to the production Worker URL. If the URL is hardcoded, this requires a new app build. If configurable via tauri.conf.json metadata or a build-time env var, no rebuild needed (verify existing implementation).

---

## Section 3: macOS Code Signing and Notarization

**Confidence: HIGH** (signing/notarization flow) / MEDIUM (entitlements edge cases for screen capture runtime behavior)

### Prerequisites

- Apple Developer account ($99/year) — required for Developer ID certificate
- Code signing must be performed on macOS hardware (can be a GitHub-hosted `macos-latest` runner)

### Certificate Types

For distribution outside the App Store (AI Buddy's path):
- **Developer ID Application** certificate — enables Gatekeeper bypass after notarization
- NOT "Apple Distribution" (that's App Store only)

### Entitlements Assessment for AI Buddy

Current `src-tauri/entitlements.plist`:
```xml
<key>com.apple.security.device.audio-input</key><true/>         <!-- microphone -->
<key>com.apple.security.cs.allow-unsigned-executable-memory</key><true/>  <!-- WebView JIT -->
```

**App Sandbox decision:** AI Buddy MUST NOT use `com.apple.security.app-sandbox`. The sandbox blocks xcap from accessing screen content of other apps. Hardened Runtime (no sandbox) is correct for a Developer ID app distributed outside the App Store. Notarization works without the sandbox entitlement on this distribution path.

**Screen Recording permission:** xcap triggers the macOS TCC Screen Recording permission dialog at runtime. This is NOT an entitlement — it is a user-granted permission managed by System Settings → Privacy → Screen Recording. No plist change needed.

**Network entitlement:** Under Hardened Runtime without sandbox, outbound network calls (reqwest to Cloudflare Worker) work without `com.apple.security.network.client`. This entitlement is only required under App Sandbox.

**Current entitlements.plist is correct as-is** for the Hardened Runtime + Developer ID distribution path.

### Environment Variables for CI

**Code signing:**
```
APPLE_CERTIFICATE              base64-encoded .p12 file (export from Keychain)
APPLE_CERTIFICATE_PASSWORD     password used when exporting the .p12
APPLE_SIGNING_IDENTITY         e.g. "Developer ID Application: Your Name (TEAMID)"
                               find with: security find-identity -v -p codesigning
KEYCHAIN_PASSWORD              any string — used to create a temporary CI keychain
```

**Notarization (Apple ID method — recommended for solo developer):**
```
APPLE_ID        your Apple developer account email
APPLE_PASSWORD  app-specific password from appleid.apple.com (NOT your account password)
APPLE_TEAM_ID   10-character team ID from developer.apple.com/account → Membership
```

**Notarization (App Store Connect API method — better for teams):**
```
APPLE_API_ISSUER      Issuer ID from App Store Connect → Users → Integrations
APPLE_API_KEY         Key ID
APPLE_API_KEY_PATH    file path to downloaded .p8 private key
```

### Notarization and Stapling

When the above env vars are set during `cargo tauri build`, Tauri automates:
1. Signs `.app` bundle with Developer ID certificate
2. Creates `.dmg` installer
3. Submits DMG to Apple's notarization service (`xcrun notarytool submit --wait`)
4. On approval: staples the notarization ticket (`xcrun stapler staple`) into the DMG

The resulting DMG is notarized and stapled — distributable directly. No manual `xcrun` commands needed.

**Expected build time:** 15-20 min compile + 5-15 min Apple notarization processing = ~20-35 min per macOS target.

**Known issue:** Post-update, macOS may revoke the Screen Recording permission and require the user to re-grant it. This is a known Tauri/macOS behavior. Inform beta users in release notes.

---

## Section 4: Windows Code Signing

**Confidence: MEDIUM** — EV landscape changed post-June 2023; options verified but provider-specific setup varies.

### Background

Since June 2023, Microsoft requires code signing keys on HSMs. Old exportable `.pfx` workflows are obsolete for new certificates. Three practical options exist:

**Option 1: Microsoft Azure Trusted Signing (recommended if eligible)**
- Cost: $9.99/month (5,000 signatures)
- SmartScreen: Immediate reputation (no warning dialog)
- Eligibility: US/Canada organizations with 3+ years of business history. Individual developers in US/Canada may qualify. International developers are not yet eligible (as of 2026-04-13).
- Integration: `trusted-signing-cli` + `signCommand` in `tauri.conf.json`
- Env vars: `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`, `AZURE_TENANT_ID`, plus endpoint/account/certificate profile

**Option 2: Azure Key Vault + OV Certificate (via DigiCert or Sectigo)**
- Cost: $200-400/year cert + ~$5-10/month Azure Key Vault
- SmartScreen: Warning initially; builds reputation over time
- Works for developers outside US/Canada
- Integration: `relic` open-source signing tool + `signCommand` in `tauri.conf.json`
- Env vars: `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`, `AZURE_TENANT_ID`, plus relic config file

**Option 3: No Windows signing (acceptable for closed beta)**
- SmartScreen shows "Windows protected your PC" warning; users click "More info → Run anyway"
- Zero cost, zero setup time
- Appropriate for a recruited closed beta where users are briefed
- Must upgrade to Option 1 or 2 before public launch

**Recommendation for v3.0 closed beta:** Start with Option 3. Add Option 1 or 2 as a follow-up phase before public launch.

### tauri.conf.json for Option 1 (Azure Trusted Signing)

```jsonc
{
  "bundle": {
    "windows": {
      "signCommand": "trusted-signing-cli -e https://<endpoint>.codesigning.azure.net -a <account-name> -c <cert-profile-name> %1"
    }
  }
}
```

### tauri.conf.json for Option 2 (Azure Key Vault + relic)

```jsonc
{
  "bundle": {
    "windows": {
      "signCommand": "relic sign --config relic.conf --file %1"
    }
  }
}
```

---

## Section 5: CI Release Pipeline

**Confidence: HIGH** — `tauri-apps/tauri-action` is official and actively maintained.

### File to Create

`.github/workflows/release.yml` — this file does not exist yet.

### Trigger

Tag pushes trigger releases. Commit to main does not trigger a release.

```yaml
on:
  push:
    tags:
      - 'v*'
```

### Runner Matrix

Two macOS runners are required — Tauri cannot cross-compile between Apple Silicon and Intel targets. Each must build on its native architecture.

| Runner | Target | Notes |
|--------|--------|-------|
| `macos-latest` | `aarch64-apple-darwin` | GitHub switched to Apple Silicon in late 2024 |
| `macos-13` | `x86_64-apple-darwin` | Last GitHub-hosted Intel macOS runner |
| `windows-latest` | `x86_64-pc-windows-msvc` | Standard Windows runner |

### GitHub Secrets Required

Set in repo Settings → Secrets → Actions:

| Secret Name | Value |
|-------------|-------|
| `TAURI_SIGNING_PRIVATE_KEY` | Content of `~/.tauri/ai-buddy.key` |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | Password from keygen (empty string if none) |
| `APPLE_CERTIFICATE` | `base64 -i certificate.p12` output |
| `APPLE_CERTIFICATE_PASSWORD` | .p12 export password |
| `APPLE_SIGNING_IDENTITY` | `"Developer ID Application: Name (TEAMID)"` |
| `KEYCHAIN_PASSWORD` | Any random string |
| `APPLE_ID` | Apple developer account email |
| `APPLE_PASSWORD` | App-specific password from appleid.apple.com |
| `APPLE_TEAM_ID` | 10-character team ID |
| `AZURE_CLIENT_ID` | (add when Windows signing is enabled) |
| `AZURE_CLIENT_SECRET` | (add when Windows signing is enabled) |
| `AZURE_TENANT_ID` | (add when Windows signing is enabled) |

### Workflow Skeleton

```yaml
name: Release

on:
  push:
    tags:
      - 'v*'

permissions:
  contents: write   # Required for tauri-action to create GitHub releases

jobs:
  release:
    strategy:
      fail-fast: false
      matrix:
        include:
          - platform: macos-latest
            args: --target aarch64-apple-darwin
          - platform: macos-13
            args: --target x86_64-apple-darwin
          - platform: windows-latest
            args: ''
    runs-on: ${{ matrix.platform }}
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: lts/*
          cache: npm

      - name: Setup Rust
        uses: dtolnay/rust-toolchain@stable
        with:
          targets: ${{ matrix.platform == 'macos-latest' && 'aarch64-apple-darwin' || matrix.platform == 'macos-13' && 'x86_64-apple-darwin' || '' }}

      - uses: swatinem/rust-cache@v2

      - name: Install frontend dependencies
        run: npm install

      - name: Build and release
        uses: tauri-apps/tauri-action@v0
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}
          TAURI_SIGNING_PRIVATE_KEY_PASSWORD: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY_PASSWORD }}
          APPLE_CERTIFICATE: ${{ secrets.APPLE_CERTIFICATE }}
          APPLE_CERTIFICATE_PASSWORD: ${{ secrets.APPLE_CERTIFICATE_PASSWORD }}
          APPLE_SIGNING_IDENTITY: ${{ secrets.APPLE_SIGNING_IDENTITY }}
          KEYCHAIN_PASSWORD: ${{ secrets.KEYCHAIN_PASSWORD }}
          APPLE_ID: ${{ secrets.APPLE_ID }}
          APPLE_PASSWORD: ${{ secrets.APPLE_PASSWORD }}
          APPLE_TEAM_ID: ${{ secrets.APPLE_TEAM_ID }}
        with:
          tagName: ${{ github.ref_name }}
          releaseName: "AI Buddy ${{ github.ref_name }}"
          releaseBody: |
            Download the installer for your platform below.
          releaseDraft: true          # Review before publishing — publishing activates auto-updates
          prerelease: false
          includeUpdaterJson: true    # Generates and uploads latest.json automatically
          args: ${{ matrix.args }}
```

### Build Time Estimates

| Job | Step | Duration |
|-----|------|---------|
| macOS aarch64 | Rust compile (cold) | 15-20 min |
| macOS aarch64 | Apple notarization | 5-15 min |
| macOS x86_64 | Rust compile (cold) | 15-20 min |
| macOS x86_64 | Apple notarization | 5-15 min |
| Windows x86_64 | Rust compile (cold) | 10-15 min |
| **Total (parallel)** | | **~35-50 min** |

Subsequent runs with `swatinem/rust-cache` reduce to 5-10 min per platform.

---

## Patterns to Follow

### Pattern 1: Deploy Worker Before First App Release

The Cloudflare Worker must be live and validated (`GET /health` returns 200) before the first signed build is distributed. If the Worker is down when the app binary is distributed, every user gets connection errors from day one.

### Pattern 2: Use Draft Releases

`releaseDraft: true` in tauri-action creates a draft that requires manual publishing. This allows verifying that `latest.json` is present, all platform artifacts uploaded, and release notes are correct before auto-updates activate for existing users.

### Pattern 3: Tag Version Must Match tauri.conf.json and Cargo.toml

Version in `tauri.conf.json` and `Cargo.toml` must match the git tag (e.g., both at `0.2.0` when tagging `v0.2.0`). Mismatch causes the updater to malfunction — the app reports being on a different version than what users downloaded.

### Pattern 4: Separate Worker Deployment from App Release

Worker deployment (wrangler deploy) and app release (GitHub tag) are independent operations with independent CI. Do not couple them in a single workflow. Worker can be deployed and rolled back without a new app release.

### Pattern 5: Version the Changelog Before Tagging

Write `CHANGELOG.md` entries before pushing the tag. `tauri-action` allows populating `releaseBody` from a changelog file or inline text. Do this before tagging to avoid drafts with empty release notes.

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Self-Hosted Update Server for Closed Beta

**What:** Running a custom HTTP server at `releases.aibuddy.app` to serve `update.json`
**Why bad:** Unnecessary operational overhead. GitHub Releases handles static file serving with high availability and CDN. `tauri-action` generates `latest.json` automatically.
**Instead:** Use `https://github.com/<user>/<repo>/releases/latest/download/latest.json`. Migrate to a custom server only if GitHub Release asset bandwidth becomes a cost concern at scale.

### Anti-Pattern 2: App Sandbox on a Screen Capture App

**What:** Adding `com.apple.security.app-sandbox: true` to entitlements.plist
**Why bad:** xcap requires unrestricted window enumeration. The sandbox denies this. The app will notarize successfully but fail silently at screen capture runtime.
**Instead:** Use Hardened Runtime without App Sandbox. Valid for Developer ID distribution outside the App Store.

### Anti-Pattern 3: Committing Secrets to wrangler.toml

**What:** Putting `ANTHROPIC_API_KEY = "sk-ant-..."` directly in wrangler.toml
**Why bad:** wrangler.toml is committed to git. All API keys become public.
**Instead:** `npx wrangler secret put ANTHROPIC_API_KEY`. The KV namespace `id` is safe to commit; secrets are not.

### Anti-Pattern 4: Skipping Stapling

**What:** Distributing a notarized DMG without running `xcrun stapler staple`
**Why bad:** Without the staple, Gatekeeper requires an internet connection to verify notarization on first launch. In offline or restricted network environments the app is blocked.
**Instead:** Tauri automates stapling when notarization env vars are set. No manual step needed.

### Anti-Pattern 5: Using macos-latest for Both macOS Targets

**What:** Setting both macOS matrix entries to `macos-latest`
**Why bad:** `macos-latest` is now Apple Silicon. Both jobs run on aarch64 hardware. The x86_64 build is cross-compiled rather than native, and may produce incorrect binaries or fail to sign properly.
**Instead:** Use `macos-latest` for aarch64 and `macos-13` for x86_64 (the last Intel GitHub-hosted macOS runner).

---

## Build Order: Phase Dependencies

The critical path has hard dependencies that determine phase sequencing:

```
Phase A: Cloudflare Worker → Production
  Provision KV namespace, set secrets, wrangler deploy, validate /health
  Must complete first — app cannot function without the proxy

Phase B: macOS Signing Setup (can start in parallel with A)
  Apple Developer account + Developer ID cert + notarization credentials
  Generate Ed25519 keypair + paste pubkey into tauri.conf.json
  Store all secrets in GitHub Actions

Phase C: tauri.conf.json Finalization
  Requires Phase B (needs pubkey)
  Add createUpdaterArtifacts: true
  Set endpoint to GitHub Releases latest.json URL
  Verify version in tauri.conf.json and Cargo.toml are consistent

Phase D: GitHub Actions Release Workflow
  Requires Phase B + C (needs secrets and updated config)
  Create .github/workflows/release.yml
  Test with a prerelease tag (v0.2.0-beta.1) before cutting real release

Phase E: First Release Tag
  Requires Phase A + D (Worker live, CI ready)
  git tag v0.2.0 && git push --tags
  Monitor CI run, verify draft release artifacts, publish draft

Phase F: Closed Beta Distribution
  Requires Phase E
  Share DMG download link from GitHub Releases
  Monitor Worker logs for auth/rate-limit issues

Windows signing (Option 1 or 2):
  Independent of Phase A-F
  Can be deferred entirely for closed beta
  Must complete before public launch
```

---

## Scalability Considerations

| Concern | Closed Beta (< 100 users) | Public Beta (1K users) | Launch (10K+ users) |
|---------|--------------------------|----------------------|---------------------|
| Update delivery | GitHub Releases (free) | GitHub Releases (may hit bandwidth limits) | CDN or CrabNebula Cloud |
| Worker KV rate limiting | Eventually consistent KV is sufficient | Consider Durable Objects for strict enforcement | Migrate to Durable Objects |
| Worker secrets rotation | Manual `wrangler secret put` | Same, add key rotation schedule | Automate via Cloudflare API |
| macOS CI build time | 35-50 min GitHub-hosted | Same | Self-hosted Apple Silicon runner saves ~15 min |
| App update delivery | Auto-update via latest.json | Same | Same (update server is just GitHub) |

---

## Open Questions for Phase Execution

1. **`WORKER_BASE_URL` location in Rust source** — Identify the exact location in `src-tauri/src/lib.rs` where the Cloudflare Worker URL is currently set. This determines whether a code change + rebuild is needed when switching from local dev to production Worker URL, or whether it is configurable at build time.

2. **CSP update for production Worker** — Current `tauri.conf.json` CSP is `default-src 'self'; style-src 'self' 'unsafe-inline'`. Production Worker calls go to `https://ai-buddy-proxy.<subdomain>.workers.dev`. If fetch calls originate from the WebView (not Rust), the CSP needs `connect-src` to include the Worker URL. Verify whether API calls go through Rust (no CSP issue) or WebView fetch (CSP issue).

3. **Windows signing eligibility** — Confirm whether the developer/entity qualifies for Azure Trusted Signing (US/Canada requirement). If not, plan the OV + Azure Key Vault path instead.

4. **Screen Recording permission post-update** — Verify on a test machine whether macOS revokes Screen Recording permission after an auto-update installs a new version. If it does, add a post-update notice in the app informing users to re-grant permission.

5. **tauri-plugin-updater version compatibility with latest.json format** — The search results note that `latest.json` format changed in `tauri-plugin-updater` 2.10.0 (new `{os}-{arch}-{installer}` keys). Verify the version of `tauri-plugin-updater` in `Cargo.toml` is >= 2.10.0 before configuring the endpoint. Run `cargo update tauri-plugin-updater` if needed.

---

## Sources

- Tauri updater plugin (v2): https://v2.tauri.app/plugin/updater/
- Tauri macOS code signing: https://v2.tauri.app/distribute/sign/macos/
- Tauri Windows code signing: https://v2.tauri.app/distribute/sign/windows/
- Tauri GitHub Actions pipeline: https://v2.tauri.app/distribute/pipelines/github/
- tauri-apps/tauri-action (official): https://github.com/tauri-apps/tauri-action
- Cloudflare KV get started: https://developers.cloudflare.com/kv/get-started/
- Cloudflare wrangler configuration: https://developers.cloudflare.com/workers/wrangler/configuration/
- Cloudflare KV namespaces: https://developers.cloudflare.com/kv/concepts/kv-namespaces/
- Azure Trusted Signing for desktop apps: https://melatonin.dev/blog/code-signing-on-windows-with-azure-trusted-signing/
- Apple notarization reference: https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution
- tauri-action updater discussion: https://github.com/orgs/tauri-apps/discussions/10206
- Auto-updater with GitHub Releases (community): https://thatgurjot.com/til/tauri-auto-updater/
