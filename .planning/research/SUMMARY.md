# Project Research Summary

**Project:** AI Buddy v2.0
**Domain:** AI-powered desktop task-completion overlay (Tauri v2 + SolidJS + Rust)
**Researched:** 2026-04-10
**Confidence:** MEDIUM-HIGH

## Executive Summary

AI Buddy v2.0 adds seven UX capabilities onto a working v1.0 Tauri overlay: action-first UI with quick action buttons, step progress tracking, conversation continuity (multi-turn Claude context), app/context detection, "try another way" fallback, multi-monitor overlay positioning, and in-session response history. The research confirms that only two new Rust crates are needed (`active-win-pos-rs = "0.10"` for app detection and `tauri-plugin-clipboard-manager` for copy buttons); all other capabilities are achievable through SolidJS signal/store patterns and built-in Tauri v2 APIs already in the app. This is a feature-density milestone, not a technology overhaul.

The recommended build order places backend infrastructure first (app detection module + multi-monitor cursor-based positioning), then state machine work in SidebarShell (conversation continuity, conditional reset), then additive UI rendering (step tracker, response history), and finally the new-component work (QuickActions, "try another way" button, inline copy buttons). This order is driven by a concrete dependency chain: QuickActions needs `detectedApp`; "try another way" needs conversation session context; step tracker needs conversation continuity's conditional reset to survive hide/show cycles.

The dominant risk in v2.0 is the SidebarShell state machine. The existing `contentState` six-state machine has two pre-existing bugs (mixed physical/logical units in window.rs; `scrollToBottom` as a side effect inside a reactive derivation in GuidanceList) that will compound with every v2 addition. Both must be fixed before any v2 feature work begins on those files. The second critical risk is context window bloat from naive multi-turn conversation history — screenshots must never be included in non-current turns, and history must be capped at 3-5 turns with assistant response summarization.

---

## Key Findings

### Recommended Stack — v2 Additions Only

The validated v1.0 stack (Tauri 2.10.3, SolidJS, Rust, xcap, cpal, AssemblyAI, ElevenLabs, rusqlite, Cloudflare Worker/Hono) is unchanged. v2 adds only:

**Net new dependencies: 2**

| Dependency | Type | Version | Purpose |
|------------|------|---------|---------|
| `active-win-pos-rs` | Rust crate | 0.10.0 | Active window app name detection (macOS + Windows cross-platform) |
| `tauri-plugin-clipboard-manager` | Official Tauri plugin | 2.3.2 | Copy buttons in guidance output (bypasses Tauri WebView clipboard security dialog) |

**Built-in Tauri v2 APIs used (no new dependency):**
- `AppHandle::cursor_position()` + `monitor_from_point()` — multi-monitor overlay positioning (Tauri 2.10.3, stable)

**Explicitly avoided:**
- `tauri-plugin-positioner` — fixed positions only, not cursor-aware
- `x-win` crate — over-engineered for active-window-name-only use case
- `@tauri-apps/plugin-store` — wrong tool for in-session ephemeral state (SolidJS stores survive Tauri hide/show cycles natively)
- `navigator.clipboard` — triggers macOS security dialog in Tauri WebView

---

### Expected Features

**Table stakes (absence feels broken):**
- Fixed quick action buttons on overlay open ("What is this?", "How do I [last intent]?", freeform input)
- Step numbering and current step highlight visible in guidance response
- Completed step checkmarks (click to mark, passive tracking)
- "Try another way" explicit button on every response
- Multi-monitor overlay on active monitor (cursor-based, not always primary)
- Inline copy buttons for code snippets and terminal commands
- Session continuity within task — follow-up questions stay in context

**Differentiators (competitive advantage):**
- AI-suggested async action buttons (2-3 inferred from screenshot content via fast non-streaming Claude call)
- App/context detection — pre-suggested actions keyed to frontmost app (VS Code, Figma, Terminal)
- Step replay — click any step to re-read/re-hear (essential for voice mode)
- Response history scrollback within session
- AI-detected failure signals leading to proactive alternative approach in response

**Defer to v3+:**
- Custom saved actions ("My prompts")
- Action history / recently used
- Cross-session memory (opt-in, beyond existing LEARN-01 SQL interactions table)
- AI-detected failure signals trigger (ship explicit "try another way" button first; build detection after observing real failure patterns)

**Anti-features to avoid:**
- Step gating (locking sequential progression)
- Per-step "Mark done" confirmation click required
- Chat thread as primary navigation surface (use "task session" mental model)
- Opening overlay on primary monitor always
- More than 6 action buttons visible at once
- "Try another way" that regenerates the same steps with different wording

---

### Architecture Approach

All v2 features integrate into the existing architecture without structural changes. The `contentState` state machine in SidebarShell does not need new states. The Cloudflare Worker `/chat` route already passes the `messages` array verbatim to Claude — no Worker changes needed for conversation continuity. The `app_context` column in the `interactions` SQLite table already exists and is always `null` today; app detection simply populates it.

**Two new files only:**
1. `src/components/QuickActions.tsx` — SolidJS component reading `detectedApp` signal, rendering contextual buttons, calling `handleSubmit`
2. `src-tauri/src/app_context.rs` — Rust module wrapping `active-win-pos-rs`, exposing `cmd_get_active_app` Tauri command

**Modified files and their risk level:**
- `SidebarShell.tsx` — MEDIUM risk (core state machine); adds `conversationHistory`, `detectedApp`, `stepStates` signals; critical change: conditional `onOverlayShown` reset
- `GuidanceList.tsx` — LOW risk (additive rendering); receives `conversationHistory` + `stepStates` props, renders history, per-step checkmarks, copy buttons
- `window.rs` — MEDIUM risk (affects all overlay positioning); replaces `primary_monitor()` with cursor-based monitor detection; also fixes pre-existing mixed-unit bug
- `ai.ts` — LOW risk (additive); `StreamGuidanceOptions.messages` replaces implicit single-turn construction; backward-compatible
- `shortcut.rs` — LOW risk (mechanical); updates `toggle_overlay` call site to pass `AppHandle`
- `tauri.ts`, `lib.rs`, `Cargo.toml` — LOW risk (additive registration)

**Unchanged:** `memory.rs`, `voice/`, `worker/src/index.ts`, `preferences.rs`, `screenshot.rs`

---

### Critical Pitfalls

**Top 5 for v2.0 — ordered by likelihood of causing regressions:**

1. **SidebarShell state machine fragmentation (V2-6)** — Adding v2 features without mapping all `contentState` transitions first will break the abort controller, cause double-submissions from quick action buttons inside `Show` blocks, and produce visible flash-to-empty-state on "try another way". Fix: audit state machine and add `batch()` around signal mutations in `submitIntent` before any SidebarShell changes. Move `onOverlayShown` reset to be conditional on `contentState() === "empty"` with no active session.

2. **Context window bloat from screenshot history (V2-2)** — Naively appending full conversation history including base64 JPEG screenshots from every turn to Claude API calls will cause superlinear cost growth, increased latency, and hard failures at the 200K token limit. A 10-turn session with screenshots hits 100K+ input tokens. Fix: text-only history for all prior turns; screenshot only in the current turn; cap at 3-5 turns with assistant response summarization. Must be built in from the start of conversation continuity work.

3. **Step tracker parsing unreliable during streaming (V2-5)** — Building step count from live streaming tokens causes flickering (count changes as tokens arrive), phantom steps from sub-bullets, and broken step IDs. Claude's step count is only knowable after `onDone`. Fix: parse step model from final `streamingText` in `onDone` only; show "Step X of ..." during streaming; hide tracker entirely for tier 3 hint responses.

4. **Multi-monitor mixed physical/logical coordinate units (V2-4)** — The existing `window.rs` already mixes `set_position(PhysicalPosition)` with `set_size(LogicalSize)` — a pre-existing bug that causes incorrect sizing on Retina displays. The Tauri `monitor_from_point` API has a documented macOS bug with mixed-DPI setups where secondary monitor PhysicalPosition.x uses the primary monitor's logical width as origin. Fix: use `available_monitors()` + cursor position range check instead of `monitor_from_point`; convert everything to one coordinate system; fix the pre-existing unit mixing bug in the same commit.

5. **Stale classification context applied to wrong request (V2-1)** — When users submit queries in rapid succession, `prepareGuidanceContext` (a Tauri IPC call that cannot be aborted) resolves for the first query and mutates `currentTier`/`taskLabel` after the second query has already started. Fix: request ID guard — increment a counter in `submitIntent`, close over the ID before `await prepareGuidanceContext()`, discard the result if the ID no longer matches.

**Pre-existing bugs to fix before v2 feature work:**
- `GuidanceList.tsx`: `scrollToBottom()` called as side effect inside reactive derivation `lines()` — move to `createEffect`
- `window.rs`: mixed physical/logical units in `set_position` / `set_size` — fix in multi-monitor phase

---

## Implications for Roadmap

### Phase 1: Backend Foundations
**Rationale:** Zero UI risk. Establishes Rust modules and corrects pre-existing window.rs bugs before any state machine work. App detection must exist before QuickActions can read `detectedApp`. Multi-monitor fix is architecturally isolated to window.rs + shortcut.rs.
**Delivers:** `cmd_get_active_app` Tauri command; cursor-based overlay positioning on active monitor; `app_context` column populated in SQLite interactions; mixed-unit window.rs bug fixed.
**Addresses:** Multi-monitor overlay (table stakes), app detection foundation (differentiator enabler)
**Avoids:** V2-4 (mixed units), V2-3 (macOS permission — validate on clean install here)
**Research flag:** MEDIUM — `active-win-pos-rs` macOS permission interaction needs hands-on validation on a clean macOS install before building any UI on top of it.

### Phase 2: State Machine Stabilization + Conversation Continuity
**Rationale:** SidebarShell is the highest-risk file in v2. Audit and stabilize the state machine before adding conversation history, which requires the most sensitive change: making `onOverlayShown` reset conditional. All subsequent phases depend on the `conversationHistory` signal being correct.
**Delivers:** `conversationHistory` signal in SidebarShell; multi-turn Claude API calls; conditional `onOverlayShown` reset (history + step state survive hide/show); `batch()` wrapping `submitIntent` signal mutations; request ID guard for stale classification.
**Addresses:** Conversation continuity (table stakes), response history foundation
**Avoids:** V2-6 (state machine fragmentation), V2-2 (context bloat — history trimming must be built here), V2-1 (stale ctx request ID guard)

### Phase 3: Step Tracking + Response History
**Rationale:** Both features are pure additive changes to GuidanceList. They depend on Phase 2's `conversationHistory` signal and conditional reset. Building them after Phase 2 means they are provably isolated — if GuidanceList breaks, the state machine is not the cause.
**Delivers:** Per-step checkmarks with click-to-mark; current step highlight; step count visible after `onDone`; response history scrollback through prior turns in session; `scrollToBottom` side effect moved to `createEffect` (pre-existing bug fix).
**Addresses:** Step progress tracking (table stakes), completed step checkmarks (table stakes), response history scrollback (differentiator)
**Avoids:** V2-5 (step parser built against final text only, not streaming tokens)

### Phase 4: Action-First UI
**Rationale:** Lowest architectural risk — adds one new component (QuickActions). Depends on Phase 1's `detectedApp` signal and Phase 2's conversation session model for "try another way". Can be built and tested in isolation; if it breaks, the blast radius is limited to the empty-state branch of SidebarShell JSX.
**Delivers:** `QuickActions.tsx` component with context-sensitive fixed buttons; async AI-suggested action buttons (fast non-streaming Claude classification call); "try another way" button on post-streaming controls; inline copy buttons in GuidanceList code fences; step-first system prompt enforcement.
**Addresses:** Fixed quick action buttons (table stakes), AI-suggested actions (differentiator), "try another way" (table stakes), inline copy buttons (table stakes), app-aware prompting (differentiator)
**Avoids:** V2-6 (buttons gated on derived `isStreaming` signal, not raw `Show when={contentState() === "empty"}`)

### Phase Ordering Rationale

- Backend-first (Phase 1) because app detection and multi-monitor are self-contained Rust modules with no SolidJS surface area. Failures are compile errors, not subtle runtime bugs.
- State machine audit before history features (Phase 2) because the conditional `onOverlayShown` reset is the single highest-risk change in v2. Getting it wrong breaks all subsequent phases.
- Step tracker after conversation history (Phase 3) because step state survival across hide/show depends on the conditional reset being in place. Building step tracker first would require duplicating the reset logic and merging it later.
- Action UI last (Phase 4) because it has the most user-visible surface area but the smallest architectural footprint. Deferring it reduces the blast radius during the risky Phase 2 state machine work.

### Research Flags

Phases needing deeper research during planning:
- **Phase 1 (App Detection):** `active-win-pos-rs` macOS permission model needs hands-on validation on a clean macOS install. The crate claims `app_name` works without Screen Recording but `title` requires it — confirm this does not trigger an unexpected Accessibility permission dialog on first run.
- **Phase 2 (Conversation Continuity):** Token budget math should be validated empirically. Log `messages` array character count before each API call in dev mode; confirm the 3-5 turn + screenshot-stripping strategy stays well under 200K context limit with realistic usage patterns.

Phases with standard patterns (skip additional research):
- **Phase 3 (Step Tracking):** Pure SolidJS signal work. Pattern is well-documented; no external dependencies.
- **Phase 4 (Action UI):** New component with established patterns from Raycast and Notion AI research. The fast Claude classification call (`max_tokens: 10`) follows standard API usage.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack (v2 additions) | HIGH | Only 2 new dependencies, both on official/stable release channels. All other v2 capabilities use existing primitives. |
| Features | HIGH | Six feature questions researched with reference implementations (Raycast, Notion AI, GitHub Copilot, Wispr Flow, Cursor). Classification into table stakes vs differentiators well-supported by multiple sources. |
| Architecture | HIGH | Integration points mapped to specific file and line locations in the existing codebase. No speculative components — every change is additive or a targeted modification of identified code. |
| Pitfalls | MEDIUM-HIGH | Core Tauri bugs (V2-4 multi-monitor DPI, V2-3 macOS permissions) confirmed via active GitHub issues. SolidJS async pitfalls (V2-1, V2-6) confirmed via SolidJS issue tracker and community sources. Context bloat (V2-2) is a well-understood Claude API concern. |

**Overall confidence:** MEDIUM-HIGH

### Gaps to Address

- **`active-win-pos-rs` macOS permission surface:** Research confirms `app_name` works without special permissions, but behavior on macOS Sequoia (15.x) with the specific Tauri permission model is not explicitly documented. Validate with a clean install before building QuickActions on top of it.
- **`toggle_overlay` AppHandle signature propagation:** The cascade from `window.rs` to `shortcut.rs` is mechanical but must be done atomically. Confirm there are no other call sites for `toggle_overlay` beyond `shortcut.rs` and `cmd_toggle_overlay`.
- **Step parser regex against real Claude output:** The step parser design assumes Claude outputs `^\d+\. ` prefixed lines when given a step-first system prompt. Validate the system prompt reliably produces this structure across tier 1, 2, and 3 before building the parser.
- **ElevenLabs per-step audio segment mapping (step replay):** Step replay with TTS re-reading requires mapping a step index to an audio segment boundary. This is deferred to Phase 3 but the data structure for step-to-TTS mapping should be stubbed in the Phase 3 step state model to avoid a schema change later.

---

## Sources

### Primary (HIGH confidence)
- Tauri v2 AppHandle API: https://docs.rs/tauri/latest/tauri/struct.AppHandle.html
- Tauri clipboard plugin: https://v2.tauri.app/plugin/clipboard/
- active-win-pos-rs crates.io: https://crates.io/crates/active-win-pos-rs
- Claude Messages API multi-turn: https://platform.claude.com/docs/en/api/messages
- SolidJS Stores: https://docs.solidjs.com/concepts/stores
- Tauri multi-monitor DPI bug (#7890): https://github.com/tauri-apps/tauri/issues/7890

### Secondary (MEDIUM confidence)
- Raycast AI floating window actions: https://manual.raycast.com/ai
- Notion AI inline toolbar design: https://www.notion.com/blog/the-design-thinking-behind-notion-ai
- GitHub Copilot inline chat: https://docs.github.com/en/copilot/reference/chat-cheat-sheet
- AI failure recovery design: https://clearly.design/articles/ai-design-4-designing-for-ai-failures
- Context window UX: https://www.digestibleux.com/p/context-window-ais-invisible-ux-challenge
- Tauri overlay v2 (Manasight 2026): https://blog.manasight.gg/why-i-chose-tauri-v2-for-a-desktop-overlay/

### Tertiary (informational)
- PatternFly Wizard design guidelines: https://www.patternfly.org/components/wizard/design-guidelines/
- SolidJS stale signal in async: https://github.com/solidjs/solid/issues/2180
- DPI and scaling in Tauri/tao: https://deepwiki.com/tauri-apps/tao/8.3-dpi-and-scaling

---
*Research completed: 2026-04-10*
*Ready for roadmap: yes*
