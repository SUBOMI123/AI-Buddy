# Technology Stack

**Project:** AI Buddy v2.0
**Researched:** 2026-04-10
**Scope:** Additions only — covers new v2 capabilities. Existing validated stack (Tauri v2, SolidJS, Rust, xcap, cpal, AssemblyAI, ElevenLabs, rusqlite, Cloudflare Worker/Hono) is unchanged.

---

## v2 Stack Additions by Feature

### 1. App Detection — Identify the Active Window's App Name

**Requirement:** Know which app is in focus when the overlay opens (VS Code, Figma, Terminal, etc.) to pre-suggest relevant quick actions.

**Recommended crate:** `active-win-pos-rs` v0.10.0

| Field | Value |
|-------|-------|
| Crate | `active-win-pos-rs` |
| Version | 0.10.0 (released March 13, 2026) |
| Platforms | macOS, Windows, Linux |
| Returns | `ActiveWindow` struct with `app_name`, `title`, `process_id`, `process_path`, `window_id`, `position` |
| macOS permission | Requires Screen Recording permission — already granted for xcap screenshots in v1 |
| Windows permission | None required |

**Why active-win-pos-rs over x-win:**
`x-win` v5.6.1 is feature-rich (supports all open windows, icon retrieval) but that breadth adds unnecessary complexity. `active-win-pos-rs` does exactly one thing — return the active window — with a simpler API. For the app detection use case (just the name), the lighter crate is the correct choice.

**Why NOT to use Tauri's built-in APIs for this:**
Tauri does not expose a built-in "get focused app" API. The `AppHandle` provides `cursor_position()` and `monitor_from_point()` for monitor geometry but nothing for window ownership. App detection needs an external crate.

**Cargo.toml addition:**
```toml
active-win-pos-rs = "0.10"
```

**Integration pattern:** New `#[tauri::command] fn cmd_get_active_app() -> Option<String>` in a new `app_context.rs` module. Call `get_active_window()` from `active_win_pos_rs`, extract `app_name`. Expose to frontend via `invoke("cmd_get_active_app")`. Call this in the `overlay-shown` event handler in SidebarShell before rendering quick actions.

**Confidence:** MEDIUM — crate is actively maintained (latest release March 2026). On macOS, `title` returns empty without Screen Recording but `app_name`/`process_path` return correctly regardless. Behavior on macOS Sequoia not explicitly confirmed in docs but consistent with platform implementation pattern.

---

### 2. Multi-Monitor Support — Position Overlay on Active Monitor

**Requirement:** When the global shortcut fires, open the overlay on whichever monitor the cursor is currently on — not always the primary monitor.

**No new crate required.** Tauri v2's built-in `AppHandle` already provides:

| Method | What it does |
|--------|-------------|
| `app_handle.cursor_position()` | Returns `PhysicalPosition<f64>` of current cursor, relative to desktop origin |
| `app_handle.monitor_from_point(x, y)` | Returns `Option<Monitor>` for the monitor containing that point |
| `monitor.position()` | Returns `PhysicalPosition<i32>` — top-left of that monitor |
| `monitor.size()` | Returns `PhysicalSize<u32>` |
| `monitor.scale_factor()` | Returns `f64` DPI scale |

These are stable APIs in Tauri 2.10.3 (confirmed in `docs.rs/tauri/latest/tauri/struct.AppHandle.html`).

**Integration pattern:** Modify `window.rs::toggle_overlay()`. Replace the current `window.primary_monitor()` lookup with:
1. `app.cursor_position()` → `(cx, cy)`
2. `app.monitor_from_point(cx, cy)` → `active_monitor`
3. Position the overlay at the right edge of `active_monitor` using the same PhysicalPosition math already in `toggle_overlay`.

The existing `cmd_open_region_select` also uses `primary_monitor()` and needs the same update.

**Known pitfall:** Tauri's coordinate origin on multi-monitor setups is the top-left of the main/primary monitor (macOS, Windows), not the active monitor. PhysicalPosition values from other monitors will be negative or large positive numbers relative to this origin. The existing set_position logic already uses PhysicalPosition correctly — just substituting `active_monitor` for `primary_monitor` is sufficient.

**Confidence:** HIGH — these are stable Tauri v2 APIs with clear documentation. The coordinate system behavior is explicitly documented and already handled in the current window.rs math.

---

### 3. Clipboard Access — Inline Copy Buttons

**Requirement:** "Copy" buttons in rendered guidance output (code snippets, terminal commands) write text to the system clipboard.

**Recommended plugin:** `@tauri-apps/plugin-clipboard-manager` v2.3.2 (official Tauri plugin)

| Component | Value |
|-----------|-------|
| npm package | `@tauri-apps/plugin-clipboard-manager` v2.3.2 |
| Rust crate | `tauri-plugin-clipboard-manager` (add to Cargo.toml) |
| Tauri install | `npm run tauri add clipboard-manager` |
| Permission needed | `clipboard-manager:allow-write-text` in capabilities config |

**Why NOT to use `navigator.clipboard.writeText` directly:**
Tauri's WebView triggers a native OS security dialog when `navigator.clipboard` APIs are called from the WebView context. This is an open issue (Tauri #12007). The official plugin bypasses this via Rust IPC, no dialog.

**Integration pattern:**
- Rust side: register `tauri_plugin_clipboard_manager::Builder::new().build()` in `lib.rs::setup`
- Frontend: `import { writeText } from "@tauri-apps/plugin-clipboard-manager"` — call from a SolidJS click handler on the copy button
- Permissions: add `clipboard-manager:allow-write-text` to `src-tauri/capabilities/default.json`

No new Rust command needed — the plugin exposes the JS API directly.

**Confidence:** HIGH — official Tauri plugin, v2.3.2 is current (verified via npm), writeText is a stable primitive with clear documentation.

---

### 4. Conversation Continuity — Multi-Turn Claude Context

**Requirement:** Follow-up questions stay in the same task context. User says "I'm stuck on step 2" without re-explaining the original task.

**No new library required.** This is a data structure and call-site change to the existing `streamGuidance` function in `src/lib/ai.ts`.

**Pattern:** Claude's Messages API is stateless — the client accumulates history and sends it with each request. The existing `streamGuidance` function sends a single-message array:
```typescript
messages: [{ role: "user", content: userContent }]
```

For conversation continuity, change this to a `messages` parameter that callers build up:
```typescript
messages: MessageParam[]  // full history: [user, assistant, user, assistant, ...]
```

**Data structure (SolidJS front-end):** Use a `createStore` array in SidebarShell (not a signal) to hold message history. `createStore` with a `For` loop prevents full re-renders and scroll-position resets when new messages are appended — a known SolidJS pitfall for chat interfaces.

```typescript
// MessageParam compatible with Claude Messages API
interface MessageParam {
  role: "user" | "assistant";
  content: string | ContentBlock[];
}

const [messages, setMessages] = createStore<MessageParam[]>([]);
```

**Conversation reset:** Clear the store when the overlay is hidden (on `overlay-hidden` event) OR when the user explicitly starts a new task. Do not persist conversation history across sessions — this is in-session only.

**Image handling in history:** Claude's Messages API accepts image blocks in user turns only. For conversation continuity, include the screenshot only in the first turn; subsequent follow-up turns are text-only. Sending a screenshot on every follow-up is wasteful and increases latency.

**Context size management:** In-session history is bounded naturally — users close the overlay between tasks. No truncation logic needed for v2. If sessions grow very long, truncate to last N turns (max_tokens budget is 4096 output + history input).

**Confidence:** HIGH — Claude Messages API multi-turn pattern is well-documented (platform.claude.com/docs/en/api/messages). SolidJS createStore for message arrays is validated pattern.

---

### 5. Step Progress Tracking — Persistent State Across Hide/Show

**Requirement:** When the user hides the overlay mid-task and re-opens it, the current step highlight and checkmarks are preserved.

**No new library required.** This is a state management pattern using existing SolidJS primitives.

**Pattern:** Steps are derived from the AI response text (parsed numbered list). Step state (current/completed) lives in a `createStore` in SidebarShell:

```typescript
interface StepState {
  currentStep: number;      // 0-indexed
  completedSteps: Set<number>;
}
const [stepState, setStepState] = createStore<StepState>({
  currentStep: 0,
  completedSteps: new Set()
});
```

The store persists across hide/show cycles naturally — SolidJS component state survives `window.hide()` because the WebView is not destroyed (Tauri keeps the WebView alive in a hidden window). No localStorage or Tauri Store plugin needed for this.

**Reset logic:** Reset stepState when:
- A new AI response begins streaming (new task)
- The conversation history is cleared
- The user clicks "Start over"

**Confidence:** HIGH — Tauri's hide/show model keeps the WebView alive. SolidJS stores persist. No library needed.

---

### 6. Response History — In-Session Scroll-Back

**Requirement:** User can scroll back through previous guidance exchanges in the current session.

**No new library required.** Response history is the same `messages` store from Conversation Continuity (item 4 above). The history array holds all turns; the UI renders all of them in a scrollable list.

**Pattern:** The `messages` store doubles as display history and Claude API payload. Each exchange appends `{ role: "user", content: ... }` and `{ role: "assistant", content: ... }` to the same store. `<For each={messages}>` renders them as a scrollable history.

**Important:** This means the conversation continuity store and the response history display are the same data structure — not two separate stores. Building them separately would create sync bugs.

**Confidence:** HIGH — same store, no additional technology.

---

### 7. Action-First UI — Quick Actions and AI-Suggested Actions

**Requirement:** Display quick action buttons on overlay open. Classify the selection type when a screen region is selected (text, image, code, UI element) and suggest relevant AI actions asynchronously.

**No new library required.** This is a prompt engineering + UI pattern.

**Classification approach:** When a region screenshot arrives, send it to Claude with a lightweight classification prompt (separate from the main guidance call):
```
"Identify what type of content is visible in this screenshot selection.
Reply with one word: code | text | ui | image | error | other"
```

Run this as a non-streaming `fetch` call (not SSE) to the existing `/chat` endpoint with `max_tokens: 10`. The result drives which suggested actions to show (e.g., "code" → "Explain this code", "Debug this", "Add comments").

**Quick action button data:** Hardcoded action labels keyed by app context and selection type. No library — a TypeScript `const` map:
```typescript
const APP_ACTIONS: Record<string, string[]> = {
  "Code Editor": ["Explain selected code", "Fix this error", "Write a test"],
  "Terminal": ["Explain this command", "Fix this error"],
  // ...
};
```

**Async render pattern in SolidJS:** Use a `createResource` tied to the selection screenshot for the AI-suggested actions. The quick action buttons render immediately from the static map; the AI suggestions appear when the resource resolves.

**Confidence:** HIGH (no new tech) — classification via Claude with `max_tokens: 10` is a standard pattern. `createResource` is SolidJS core API.

---

## Summary of v2 Stack Additions

| Capability | Addition | Type | Version |
|-----------|----------|------|---------|
| App detection | `active-win-pos-rs` | Rust crate | 0.10.0 |
| Multi-monitor overlay | Tauri `AppHandle::cursor_position` + `monitor_from_point` | Built-in Tauri API | Tauri 2.10.3 (already available) |
| Clipboard (copy buttons) | `@tauri-apps/plugin-clipboard-manager` | Official Tauri plugin | 2.3.2 (npm) + Rust peer |
| Conversation continuity | `createStore` message array | SolidJS pattern | No new dependency |
| Step progress tracking | `createStore` step state | SolidJS pattern | No new dependency |
| Response history | Same message store as conversation | SolidJS pattern | No new dependency |
| Action-first UI | Claude classification prompt + static map | Prompt engineering + TypeScript | No new dependency |

**Net new dependencies: 2**
1. `active-win-pos-rs = "0.10"` (Rust — app detection)
2. `tauri-plugin-clipboard-manager` (official Tauri plugin — clipboard)

---

## What NOT to Add

| Avoided Addition | Why |
|-----------------|-----|
| `tauri-plugin-positioner` | Handles fixed locations (TopRight, TrayLeft) — not cursor-aware active monitor placement. The built-in `cursor_position` + `monitor_from_point` APIs do the job without a plugin. |
| `x-win` crate | More capable than needed (all windows, icons). `active-win-pos-rs` is focused and lighter for the active-window-name-only use case. |
| `@tauri-apps/plugin-store` | Not needed for in-session state. SolidJS stores survive hide/show cycles in the hidden WebView. Tauri Store writes to disk — wrong tool for ephemeral session data. |
| `navigator.clipboard` (web API) | Triggers OS security dialog in Tauri WebView context. Use the official plugin instead. |
| Separate conversation store + history store | One store serves both. Two stores create sync bugs. |
| `@solid-primitives/storage` with `makePersisted` | Step state and conversation history are intentionally session-scoped, not persisted. `makePersisted` would survive app restart — wrong behavior. |

---

## Cargo.toml Changes

Add to `src-tauri/Cargo.toml` `[dependencies]`:

```toml
# v2: App detection (app-aware quick actions, CORE-06)
active-win-pos-rs = "0.10"

# v2: Clipboard plugin (copy buttons in guidance output)
tauri-plugin-clipboard-manager = "2"
```

Register in `lib.rs`:
```rust
.plugin(tauri_plugin_clipboard_manager::Builder::new().build())
```

---

## npm Changes

```bash
npm run tauri add clipboard-manager
# or manually:
npm install @tauri-apps/plugin-clipboard-manager
```

Add to `src-tauri/capabilities/default.json`:
```json
"permissions": [
  "clipboard-manager:allow-write-text"
]
```

---

## Confidence Assessment

| Area | Level | Reason |
|------|-------|--------|
| Multi-monitor (Tauri built-ins) | HIGH | `cursor_position`, `monitor_from_point` are documented stable APIs in Tauri 2.10.3. Coordinate math is already proven in window.rs. |
| Clipboard plugin | HIGH | Official Tauri plugin, v2.3.2 verified on npm. writeText is stable. |
| App detection (active-win-pos-rs) | MEDIUM | v0.10.0 released March 2026 — actively maintained. macOS title behavior is a known limitation (empty without Screen Recording) but `app_name` works. Screen Recording permission already granted for xcap. |
| Conversation continuity | HIGH | Claude Messages API multi-turn is well-documented. SolidJS createStore for chat arrays is a validated community pattern. |
| Step state persistence | HIGH | Tauri keeps WebView alive across hide/show — no special mechanism needed. Confirmed by existing overlay behavior in v1. |
| Action classification | MEDIUM | Low-token Claude classification calls are a standard pattern; latency of non-streaming call for short responses is untested in this app. Needs validation in implementation. |

---

## Sources

- active-win-pos-rs GitHub: https://github.com/dimusic/active-win-pos-rs
- active-win-pos-rs crates.io: https://crates.io/crates/active-win-pos-rs
- x-win docs.rs: https://docs.rs/x-win/latest/x_win/
- Tauri v2 AppHandle API: https://docs.rs/tauri/latest/tauri/struct.AppHandle.html
- Tauri clipboard plugin: https://v2.tauri.app/plugin/clipboard/
- Tauri clipboard npm: https://www.npmjs.com/package/@tauri-apps/plugin-clipboard-manager
- Tauri positioner plugin: https://v2.tauri.app/plugin/positioner/
- Tauri multi-monitor cursor issue: https://github.com/tauri-apps/tauri/issues/3057
- navigator.clipboard in Tauri (security dialog issue): https://github.com/tauri-apps/tauri/issues/12007
- Claude Messages API multi-turn: https://platform.claude.com/docs/en/api/messages
- SolidJS Stores: https://docs.solidjs.com/concepts/stores
- SolidJS createStore for messages (Vercel AI issue): https://github.com/vercel/ai/issues/2002
