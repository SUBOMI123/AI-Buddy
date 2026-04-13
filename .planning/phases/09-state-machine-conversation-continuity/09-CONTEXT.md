# Phase 9: State Machine + Conversation Continuity - Context

**Gathered:** 2026-04-12
**Status:** Ready for planning

<domain>
## Phase Boundary

SidebarShell gains in-memory session state: a history of prior exchanges rendered as a flat chronological feed, multi-turn context passed to Claude via a messages array, a task header anchored to the first intent of each session, and an explicit "New task" reset control. The overlay preserves this state across hide/show cycles; it clears only on explicit reset or app restart.

New capabilities (QuickActions, step checklist, copy buttons) are NOT in scope — those belong to Phases 10–11.

</domain>

<decisions>
## Implementation Decisions

### Session Reset (SESS-03)

- **D-01:** Session reset is triggered exclusively by an explicit "New task" user action — no automatic detection, no AI classification, no keyword heuristics.
- **D-02:** The "New task" control is a small text link placed directly below the task header (not in the header icon row, not near the input field). Spatial proximity to the task header communicates "this resets the current task".

### History Display (SESS-02)

- **D-03:** Prior exchanges render as a flat chronological feed above the current response — user intent as a small label, guidance text below it, stacked in order. No collapse, no tabs.
- **D-04:** Prior exchanges (not the current one) are rendered in `var(--color-text-secondary)` to distinguish them from the active response. No dividers or font size changes.
- **D-05:** When a new response starts streaming, the panel auto-scrolls to the bottom so the latest response is always visible.

### Task Header (TASK-01)

- **D-06:** The task header text is the user's raw first intent for the session, truncated at ~50 characters with an ellipsis. No AI-generated title, no extra API call.
- **D-07:** The task header appears as soon as the user submits their first intent (on the transition to "loading" state). It persists through all follow-ups and is cleared only when "New task" is clicked. It is NOT shown in the empty/idle state.

### Context Structure (SESS-01)

- **D-08:** Prior turns are sent to Claude as a Claude-native messages array: `[{role: "user", content: intent_text}, {role: "assistant", content: guidance_text}, ...]`. Text-only for prior turns — no screenshots in history (current turn screenshot still sent as usual).
- **D-09:** Cap at last 3 prior turns (6 messages: 3 user + 3 assistant). When the cap is exceeded, drop the oldest turn. Token-budget counting is not required.
- **D-10:** Session history (the conversation array) lives in SolidJS signals and persists in-memory across overlay hide/show cycles. It is NOT serialized to localStorage. It clears on app restart or explicit "New task" reset.

### State Machine Fix

- **D-11:** `onOverlayShown` currently resets all state unconditionally. It must be changed to only reset transient UI state (loading/streaming/error states, STT errors) — never the session history or task header. Session state persists across hide/show.

### Claude's Discretion

- Exact visual styling/spacing for the task header strip (font size, padding, background) — stay consistent with existing design tokens.
- Whether to show a turn count or any other metadata on prior exchanges — omit if uncertain.
- Scroll behavior implementation detail: whether to use a `ref` + `scrollIntoView` or `scrollTop = scrollHeight`.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements
- `.planning/REQUIREMENTS.md` §Session — SESS-01, SESS-02, SESS-03
- `.planning/REQUIREMENTS.md` §Task Anchoring — TASK-01

### Existing Code
- `src/components/SidebarShell.tsx` — primary file being modified; contains state machine, onOverlayShown handler, submitIntent function
- `src/lib/ai.ts` — streamGuidance must accept a `conversationHistory` parameter; messages array format documented here
- `src/components/GuidanceList.tsx` — current response renderer; may need to become a session feed renderer

### Prior Phase Decisions (from STATE.md)
- Phase 8 decision: `onOverlayShown` must become conditional — do not reset session state, only transient UI state
- Research note: Screenshots in conversation history = token bloat — prior turns text-only; cap at 3-5 turns (D-09 locks this at 3)

No external specs — requirements fully captured in decisions above.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `ContentState` type (`SidebarShell.tsx:36`) — extend with no new states needed for Phase 9; existing states cover session display
- `streamingText` signal — will become part of a session exchange object instead of a standalone string
- `lastIntent` signal — will anchor the task header (D-06)
- `GuidanceList` component — currently takes a flat `streamingText` string; will need to be adapted or wrapped for session feed rendering

### Established Patterns
- SolidJS `createSignal` for all reactive state — continue this pattern for session history array
- Fire-and-forget pattern (`getActiveApp()`) — same pattern appropriate for any non-blocking session bookkeeping
- `abortController` pattern for in-flight request cancellation — session history should NOT be cleared when a request is aborted (only when explicitly reset)
- `var(--color-text-secondary)` already used for degradation notice and screenshot-failed notice — use for prior exchange text (D-04)

### Integration Points
- `streamGuidance` in `src/lib/ai.ts` needs a new optional `conversationHistory?: Array<{role: "user"|"assistant", content: string}>` parameter
- The Worker at `/chat` endpoint already accepts a `messages` array — prior turns slot into that array before the current user message
- `onOverlayShown` callback (line 112) is the change point for D-11

</code_context>

<specifics>
## Specific Ideas

- The task header + "New task" link form a mini-strip at the top of the content area (below the settings row, above the scrollable feed). Treat them as a single atomic UI element that shows/hides together.
- The flat feed means `GuidanceList` (or a new `SessionFeed` component) renders an array of `{intent, guidance}` objects, where all but the last are muted secondary color, and the last one is the active streaming response.
- "New task" as a text link (not a button with border) keeps the panel minimal — consistent with the "Show full steps" link pattern already in the codebase.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 09-state-machine-conversation-continuity*
*Context gathered: 2026-04-12*
