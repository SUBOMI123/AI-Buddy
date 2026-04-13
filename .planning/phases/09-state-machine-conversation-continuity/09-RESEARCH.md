# Phase 9: State Machine + Conversation Continuity - Research

**Researched:** 2026-04-12
**Domain:** SolidJS state management, multi-turn Claude API, frontend session feeds
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Session reset is triggered exclusively by an explicit "New task" user action — no automatic detection, no AI classification, no keyword heuristics.
- **D-02:** The "New task" control is a small text link placed directly below the task header (not in the header icon row, not near the input field).
- **D-03:** Prior exchanges render as a flat chronological feed above the current response — user intent as a small label, guidance text below it, stacked in order. No collapse, no tabs.
- **D-04:** Prior exchanges (not the current one) are rendered in `var(--color-text-secondary)`. No dividers or font size changes.
- **D-05:** When a new response starts streaming, the panel auto-scrolls to the bottom so the latest response is always visible.
- **D-06:** The task header text is the user's raw first intent for the session, truncated at ~50 characters with an ellipsis. No AI-generated title, no extra API call.
- **D-07:** The task header appears as soon as the user submits their first intent (on the transition to "loading" state). It persists through all follow-ups and is cleared only when "New task" is clicked. It is NOT shown in the empty/idle state.
- **D-08:** Prior turns are sent to Claude as a Claude-native messages array: `[{role: "user", content: intent_text}, {role: "assistant", content: guidance_text}, ...]`. Text-only for prior turns — no screenshots in history (current turn screenshot still sent as usual).
- **D-09:** Cap at last 3 prior turns (6 messages: 3 user + 3 assistant). When the cap is exceeded, drop the oldest turn. Token-budget counting is not required.
- **D-10:** Session history lives in SolidJS signals, persists in-memory across overlay hide/show cycles. NOT serialized to localStorage. Clears on app restart or explicit "New task" reset.
- **D-11:** `onOverlayShown` currently resets all state unconditionally. It must be changed to only reset transient UI state (loading/streaming/error states, STT errors) — never the session history or task header.

### Claude's Discretion

- Exact visual styling/spacing for the task header strip (font size, padding, background) — stay consistent with existing design tokens.
- Whether to show a turn count or any other metadata on prior exchanges — omit if uncertain.
- Scroll behavior implementation detail: whether to use a `ref` + `scrollIntoView` or `scrollTop = scrollHeight`.

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SESS-01 | Follow-up queries resolved using structured task context (current intent + last guidance steps + selected region) — not full conversation history | D-08/D-09: messages array with 3-turn cap; `conversationHistory` param added to `streamGuidance` |
| SESS-02 | Previous guidance exchanges in the current session are scrollable above the current response | New `SessionFeed` component renders `sessionHistory` array; D-03/D-04/D-05 dictate layout and scroll |
| SESS-03 | Session context resets when user submits a new unrelated intent — old task context does not bleed into a new task | D-01: explicit "New task" reset only; D-11: `onOverlayShown` must NOT reset session state |
| TASK-01 | Task header displays at top of panel summarizing current task and persists across follow-ups until session resets | `TaskHeaderStrip` component; anchored to `lastIntent` signal; shows on first submit, hides on reset |
</phase_requirements>

---

## Summary

Phase 9 is a pure frontend SolidJS + TypeScript change. No new Rust dependencies, no new Cloudflare Worker routes, and no new npm packages are required. All changes are confined to `src/components/SidebarShell.tsx`, `src/lib/ai.ts`, and a new `SessionFeed` component (replacing or wrapping `GuidanceList`).

The core data structure is a `sessionHistory` signal — an array of `{intent: string, guidance: string}` exchange objects stored in SolidJS reactive state. This array serves two purposes: rendering the historical feed in the UI and building the `messages` array sent to Claude. The current `streamingText` signal transitions into the "active" exchange slot until `onDone` fires, at which point the completed exchange is appended to the history array and `streamingText` resets.

The most critical behavioral change is the `onOverlayShown` handler (line 112 of SidebarShell.tsx). It currently resets ALL state unconditionally. It must be made conditional: transient states (`loading`, `streaming`, `error`) are reset, but `sessionHistory` and `lastIntent` are never touched. This is the state machine fix locked in D-11 and the v2 Research decision recorded in STATE.md.

**Primary recommendation:** Implement in two clearly separated tasks — (1) the `streamGuidance` API change with history parameter, and (2) the SidebarShell state machine + SessionFeed UI changes. The API change is a pure function signature extension with full backward compatibility.

---

## Standard Stack

### Core (no new dependencies required)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| solid-js | ^1.9.3 (already installed) | `createSignal`, `For`, `Show`, component model | Project is SolidJS — all reactive state uses this. `For` handles array rendering efficiently. [VERIFIED: package.json] |
| TypeScript | ~5.6.2 (already installed) | Type-safe exchange objects and signal types | Project standard — non-negotiable. [VERIFIED: package.json] |

**No new packages needed.** [VERIFIED: codebase inspection — all required primitives already present]

### Supporting Patterns (from existing codebase)

| Pattern | Source | Usage in Phase 9 |
|---------|--------|-----------------|
| `createSignal<T[]>` with setter spreading | SidebarShell.tsx (all existing signals) | `sessionHistory` array signal |
| `For` over signal-derived array | Used in GuidanceList.tsx | Render prior exchanges |
| `Show` conditional rendering | Used throughout SidebarShell.tsx | TaskHeaderStrip visibility gate |
| `ref` capture on container div | GuidanceList.tsx:11 `containerRef` | Auto-scroll in SessionFeed |
| `var(--color-text-secondary)` | theme.css + existing usage in SidebarShell | Prior exchange muted color |
| `var(--color-accent)` text link button | SidebarShell.tsx:490 "Show full steps" | "New task" link exact pattern |

---

## Architecture Patterns

### Recommended Data Model

```typescript
// New type — session exchange object
interface SessionExchange {
  intent: string;      // user's raw text for this turn
  guidance: string;    // complete guidance text (only set after onDone fires)
}

// New signal in SidebarShell
const [sessionHistory, setSessionHistory] = createSignal<SessionExchange[]>([]);
// lastIntent already exists (line 45) — repurpose as task header anchor
```

[ASSUMED] — SolidJS `createSignal` with array type is the standard pattern for this codebase; `createStore` (SolidJS fine-grained store) is not used anywhere in the project and would be inconsistent.

### Component Structure

```
SidebarShell.tsx
  ├── TaskHeaderStrip (new inline or extracted component)
  │     ├── task header text (lastIntent(), truncated to 50 chars)
  │     └── "New task" button (text link, color-accent)
  └── SessionFeed (new component — replaces/wraps GuidanceList)
        ├── For each sessionHistory() → PriorExchangeItem (muted secondary)
        └── ActiveExchange (current streamingText, color-text-primary)
```

### Pattern 1: sessionHistory as flat append-only array with cap enforcement

**What:** Each completed exchange (after `onDone`) is appended to `sessionHistory`. Cap at 3 entries — drop oldest when exceeded.

**When to use:** In `onDone` callback inside `submitIntent`.

```typescript
// Source: CONTEXT.md D-09, verified against existing onDone pattern in SidebarShell.tsx:334
onDone: () => {
  if (thisGen !== submitGen) return;
  // Append completed exchange to history
  const completedExchange: SessionExchange = {
    intent: lastIntent(),
    guidance: accumulatedText,
  };
  setSessionHistory((prev) => {
    const updated = [...prev, completedExchange];
    // Cap at 3 prior turns (D-09)
    return updated.length > 3 ? updated.slice(updated.length - 3) : updated;
  });
  // ... existing TTS and recordInteraction calls unchanged
}
```

### Pattern 2: Building conversationHistory for Claude API

**What:** Convert `sessionHistory` to Anthropic messages array format before the API call.

**When to use:** In `submitIntent`, before calling `streamGuidance`.

```typescript
// Source: CONTEXT.md D-08, verified against worker/src/index.ts messages array passthrough
const conversationHistory = sessionHistory().flatMap((exchange) => [
  { role: "user" as const, content: exchange.intent },
  { role: "assistant" as const, content: exchange.guidance },
]);
// Pass to streamGuidance — new optional parameter
```

**Worker validation:** The `/chat` endpoint already accepts and proxies `body.messages` array directly to Anthropic. Prepending prior turns before the current user message is a pure frontend concern — worker needs no changes. [VERIFIED: worker/src/index.ts:149-165]

### Pattern 3: streamGuidance signature extension (backward-compatible)

**What:** Add optional `conversationHistory` parameter.

**When to use:** In `src/lib/ai.ts`.

```typescript
// Source: existing StreamGuidanceOptions interface in src/lib/ai.ts:29
export interface StreamGuidanceOptions {
  // ... existing fields unchanged ...
  // New optional field (D-08)
  conversationHistory?: Array<{ role: "user" | "assistant"; content: string }>;
}
```

**Messages array construction inside `streamGuidance`:**
```typescript
// Prior turns (text-only) + current turn (screenshot + intent)
const messages = [
  ...(opts.conversationHistory ?? []).map((turn) => ({
    role: turn.role,
    content: turn.content,  // text string only for prior turns
  })),
  { role: "user" as const, content: userContent },  // userContent already has screenshot
];
```

[VERIFIED: worker/src/index.ts accepts any messages array shape and passes through — no worker changes needed]

### Pattern 4: onOverlayShown conditional reset (D-11)

**What:** Change the overlay-shown handler from unconditional full reset to conditional transient-only reset.

**Current code (SidebarShell.tsx:112-126):**
```typescript
const unlisten = await onOverlayShown(async () => {
  setContentState("empty");        // PROBLEM: always resets
  setErrorMessage("");
  setStreamingText("");
  abortController?.abort();
  abortController = null;
  // ...
});
```

**Target behavior (per UI-SPEC.md Interaction Contracts table):**
```typescript
const unlisten = await onOverlayShown(async () => {
  // Only reset transient states — never session history or lastIntent
  if (["loading", "streaming", "error"].includes(contentState())) {
    setContentState("empty");
    setStreamingText("");
    abortController?.abort();
    abortController = null;
  }
  setErrorMessage("");     // always clear
  setSttError("");         // always clear
  // sessionHistory and lastIntent: NOT touched
  setDetectedApp(null);
  getActiveApp().then((app) => setDetectedApp(app)).catch(() => setDetectedApp(null));
  if (inputRef && !needsPermission()) inputRef.focus();
});
```

[VERIFIED: current handler at SidebarShell.tsx:112; UI-SPEC.md state table specifies exact per-signal behavior]

### Pattern 5: Auto-scroll trigger

**What:** Scroll session feed to bottom when streaming starts (first token received).

**When to use:** In `onToken` callback, when transitioning from `"loading"` to `"streaming"`.

```typescript
// Source: UI-SPEC.md auto-scroll contract; existing pattern in GuidanceList.tsx:13-21
onToken: (text) => {
  accumulatedText += text;
  if (contentState() === "loading") {
    setContentState("streaming");
    // Trigger auto-scroll: containerRef is on SessionFeed
    // Use scrollTop = scrollHeight (simpler than scrollIntoView for this case)
    sessionFeedRef?.scrollTop = sessionFeedRef?.scrollHeight ?? 0;
  }
  setStreamingText(accumulatedText);
},
```

Note: `sessionFeedRef` needs to be lifted from `SessionFeed` up to `SidebarShell` OR the scroll trigger fires via a SolidJS effect watching `contentState()` transition. The ref-lifting approach avoids prop drilling of an imperative handle.

### Pattern 6: "New task" reset

**What:** Click handler that wipes all session state and focuses input.

**When to use:** Attached to the "New task" button in TaskHeaderStrip.

```typescript
// Source: UI-SPEC.md "New task" Reset contract
const handleNewTask = () => {
  abortController?.abort();
  abortController = null;
  setSessionHistory([]);
  setLastIntent("");
  setStreamingText("");
  setContentState("empty");
  setErrorMessage("");
  // sttError, screenshotFailed optionally cleared too for cleanliness
  setSttError("");
  setScreenshotFailed(false);
  setTimeout(() => inputRef?.focus(), 0);
};
```

### TaskHeaderStrip: Inline vs Extracted Component

Two valid approaches:

1. **Inline JSX in SidebarShell** — simpler, avoids prop threading. Preferred given phase scope.
2. **Extracted `TaskHeaderStrip` component** — cleaner if it grows in Phase 10/11.

Given UI-SPEC.md describes it as an "atomic UI element" and the existing codebase inlines similar small UI strips (degradation notice at SidebarShell.tsx:469), **inline JSX is the right choice for Phase 9**.

### SessionFeed: New Component vs Adapting GuidanceList

`GuidanceList` currently takes a single `streamingText: string`. Phase 9 needs it to render an array of exchanges.

Options:
1. **Create a new `SessionFeed` component** that accepts `sessionHistory` + `streamingText` + `ttsEnabled`. GuidanceList remains for any backward compatibility. Clean separation.
2. **Modify GuidanceList in place** — risk of breaking existing behavior, messier props.

**Recommendation:** Create `SessionFeed.tsx`. It wraps the same rendering logic as GuidanceList but iterates over `sessionHistory()` for prior exchanges, then renders the active `streamingText` below. SidebarShell replaces `<GuidanceList>` with `<SessionFeed>` in the streaming and "empty-with-history" states.

**SessionFeed visibility:** The feed should render whenever `sessionHistory().length > 0 || contentState() === "streaming" || contentState() === "loading"`. This ensures history remains visible between queries (i.e., when `contentState === "empty"` but there is prior session data).

### Anti-Patterns to Avoid

- **Clearing `sessionHistory` on abort:** `abortController.abort()` must NOT clear session history — only "New task" and app restart do this. The existing WR-01 guard (`thisGen !== submitGen`) handles abort races. [VERIFIED: CONTEXT.md D-10; STATE.md abort pattern]
- **Storing screenshots in sessionHistory:** Prior turns are text-only. Screenshots in history would bloat tokens. The current turn always gets a fresh screenshot. [VERIFIED: CONTEXT.md D-08; STATE.md v2 Research decision]
- **Using localStorage for session persistence:** D-10 explicitly prohibits this. In-memory only.
- **Auto-detecting "new task" intent:** D-01 locks this as explicit-only. No AI classification.
- **Sending `lastIntent` separately:** It is already the first entry in `sessionHistory[0].intent` — no duplication needed.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Array state with SolidJS | Custom reactive wrapper | `createSignal<SessionExchange[]>` with functional updater | SolidJS signals support any type including arrays; functional setter `prev => [...]` is the idiomatic append pattern |
| Scroll-to-bottom | Intersection Observer, animation frames | `containerRef.scrollTop = containerRef.scrollHeight` | Direct assignment is synchronous and sufficient for this use case; matches GuidanceList.tsx existing scroll pattern |
| Conversation history truncation | LRU cache, linked list | `.slice(length - 3)` on append | 3-item cap is trivially expressed as a slice — no library needed |
| Message format conversion | Custom serializer | `.flatMap()` inline | The messages format is simple text — one line of transformation |

---

## Common Pitfalls

### Pitfall 1: Clearing session history on abort/abort+resubmit

**What goes wrong:** `abortController?.abort()` is called both in `onOverlayShown` and at the start of each `submitIntent`. If session history is cleared anywhere near these abort points, a user who submits a follow-up quickly loses their history.

**Why it happens:** The abort path is close to the state reset path in `submitIntent` (lines 244-249).

**How to avoid:** Only clear `sessionHistory` and `lastIntent` in `handleNewTask`. The abort path and `onOverlayShown` path must never touch these two signals.

**Warning signs:** Session disappears when user presses Enter while a request is in-flight.

### Pitfall 2: SessionFeed invisible when contentState returns to "empty"

**What goes wrong:** The existing `Show when={contentState() === "streaming"}` gate around GuidanceList means GuidanceList is hidden when streaming ends. If SessionFeed uses the same gate, history disappears between turns.

**Why it happens:** Phase 8 code shows content only during active states — nothing needed to persist across queries before Phase 9.

**How to avoid:** SessionFeed's `Show` condition must include `sessionHistory().length > 0` as an OR condition so it remains visible while idle between queries. The EmptyState must similarly only show when `sessionHistory().length === 0 && contentState() === "empty"`.

**Warning signs:** History disappears as soon as the response finishes streaming.

### Pitfall 3: Double-appending to sessionHistory from onDone

**What goes wrong:** The WR-01 generation guard (`if (thisGen !== submitGen) return`) already prevents stale `onDone` from executing, but if `onDone` fires before `accumulatedText` is fully populated (race condition), history gets appended with empty guidance.

**Why it happens:** `accumulatedText` is a closure variable — it accumulates in `onToken`. `onDone` fires after `[DONE]` from the SSE stream. The existing `accumulatedText` local variable pattern (SidebarShell.tsx:313) is specifically designed to avoid this. [VERIFIED: comment at SidebarShell.tsx:311-314]

**How to avoid:** Use the same local `accumulatedText` variable (already in place) when building the `SessionExchange` object in `onDone`. Do not read `streamingText()` signal.

**Warning signs:** Empty guidance text in session history for the most recent exchange.

### Pitfall 4: TaskHeaderStrip showing in empty/idle state

**What goes wrong:** If the `Show` condition only checks `lastIntent().length > 0`, it will show the task header from a previous session even after app restart if `lastIntent` is not properly initialized.

**Why it happens:** `lastIntent` is already declared as `createSignal("")` (SidebarShell.tsx:45) — it starts empty. But the `Show` condition should also require `contentState() !== "empty" || sessionHistory().length > 0`.

**How to avoid:** Per D-07 and UI-SPEC.md: `Show when={lastIntent().length > 0}`. Since `lastIntent` is only set in `submitIntent` and cleared in `handleNewTask`, and it initializes as `""`, the empty check is sufficient. No state leakage across restarts (in-memory only).

**Warning signs:** Task header flashes empty or shows stale task name.

### Pitfall 5: onToken scroll triggering before containerRef is assigned

**What goes wrong:** `sessionFeedRef` ref is assigned asynchronously after the component mounts. If `onToken` fires before the ref is assigned (extremely unlikely but possible on first submit), scroll fails silently.

**Why it happens:** SolidJS ref assignment happens synchronously on mount, before any user interaction. In practice, `onToken` only fires after user submits + API call initiates — always after mount.

**How to avoid:** Guard with `if (sessionFeedRef)` before assigning `scrollTop`. This is the same pattern GuidanceList already uses (`if (containerRef)` at line 14).

---

## Code Examples

Verified patterns from existing codebase:

### Existing "Show full steps" link pattern (exact model for "New task" link)

```typescript
// Source: SidebarShell.tsx:485-503 — "Show full steps" button
<button
  onClick={handleShowFullSteps}
  style={{
    border: "none",
    background: "transparent",
    color: "var(--color-accent)",
    "font-size": "var(--font-size-label)",
    cursor: "pointer",
    padding: "0",
    "text-decoration": "underline",
    "min-height": "44px",
    display: "inline-flex",
    "align-items": "center",
  }}
>
  Show full steps
</button>
```

"New task" follows the identical pattern — same styles, different label.

### Existing scrollToBottom pattern (model for SessionFeed)

```typescript
// Source: GuidanceList.tsx:13-21
const scrollToBottom = () => {
  if (containerRef) {
    const isNearBottom =
      containerRef.scrollHeight - containerRef.scrollTop - containerRef.clientHeight < 40;
    if (isNearBottom) {
      containerRef.scrollTop = containerRef.scrollHeight;
    }
  }
};
```

Phase 9 uses `scrollTop = scrollHeight` unconditionally (per UI-SPEC.md D-05) rather than the proximity check, because auto-scroll on new response start is always desired.

### Existing text truncation approach (no utility needed)

```typescript
// Inline truncation — no lodash/utility needed
const truncatedIntent = (intent: string) =>
  intent.length > 50 ? intent.slice(0, 50) + "…" : intent;
```

### Existing color-text-secondary usage (model for prior exchange muting)

```typescript
// Source: SidebarShell.tsx:457-466 — screenshot fallback notice
<div
  style={{
    "font-size": "var(--font-size-label)",
    "line-height": "var(--line-height-label)",
    color: "var(--color-text-secondary)",
    padding: "var(--space-sm) 0",
  }}
>
  Screen capture unavailable -- guidance may be less specific
</div>
```

---

## Integration Points (complete map)

| File | Change Type | What Changes |
|------|-------------|-------------|
| `src/lib/ai.ts` | Additive | Add `conversationHistory?` to `StreamGuidanceOptions`; prepend prior turns to `messages` array before current user turn |
| `src/components/SidebarShell.tsx` | Modify | Add `sessionHistory` signal; fix `onOverlayShown`; update `submitIntent` (history append in `onDone`); add `handleNewTask`; replace `<GuidanceList>` with `<SessionFeed>` |
| `src/components/SessionFeed.tsx` | New file | Session feed renderer — props: `sessionHistory`, `streamingText`, `ttsEnabled`, `ref` callback |
| `src/components/GuidanceList.tsx` | No change | Kept as-is for now; SessionFeed duplicates what's needed |
| `worker/src/index.ts` | No change | Already accepts and proxies arbitrary messages array |

---

## State Machine Transition Table (complete for Phase 9)

Source: UI-SPEC.md Interaction Contracts, SidebarShell.tsx

| Signal | On `submitIntent` | On `onDone` | On `onOverlayShown` | On `handleNewTask` |
|--------|------------------|------------|--------------------|--------------------|
| `contentState` | `"loading"` | unchanged (stays `"streaming"`) | Conditional: if `loading/streaming/error` → `"empty"` | `"empty"` |
| `streamingText` | `""` | unchanged | Conditional: if transient → `""` | `""` |
| `sessionHistory` | unchanged | Append completed exchange (cap 3) | **Never reset** | `[]` |
| `lastIntent` | Set to submitted intent | unchanged | **Never reset** | `""` |
| `errorMessage` | `""` | unchanged | Always `""` | `""` |
| `sttError` | `""` | unchanged | Always `""` | `""` |
| `abortController` | Abort old, new created | unchanged | Conditional: if transient → abort + null | Abort + null |
| `detectedApp` | unchanged | unchanged | `null` → fire `getActiveApp()` | unchanged |

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Node.js built-in `node:test` + `node:assert/strict` |
| Config file | none — invoked directly via `npx tsx --test` |
| Quick run command | `cd /Users/subomi/Desktop/AI-Buddy/worker && npm test` |
| Full suite command | `cd /Users/subomi/Desktop/AI-Buddy/worker && npm test` |

[VERIFIED: worker/package.json test script]

### Phase Requirements → Test Map

Phase 9 changes are entirely frontend (SolidJS TypeScript). No automated test framework is set up for the frontend (no vitest, no jest — package.json has no test script). Tests for this phase are **manual-only** per the existing project pattern.

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SESS-01 | Prior turns sent as messages array to Claude | manual | — (no frontend test framework) | N/A |
| SESS-02 | History feed renders above current response; scrolls to bottom | manual | — | N/A |
| SESS-03 | "New task" resets session; hide/show preserves session | manual | — | N/A |
| TASK-01 | Task header shows on first submit, persists through follow-ups, clears on reset | manual | — | N/A |

### Sampling Rate

- **Per task:** Manual spot-check as described in verification steps
- **Phase gate:** All 4 success criteria from phase description pass manually before `/gsd-verify-work`

### Wave 0 Gaps

- Frontend test framework (vitest) is not installed — out of scope for Phase 9. Phase 9 adds no new worker routes, so existing worker tests cover worker behavior.
- No Wave 0 test files to create.

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Not touched in Phase 9 |
| V3 Session Management | yes — limited | In-memory only; no server-side session; no token reuse risk |
| V4 Access Control | no | Not touched |
| V5 Input Validation | yes | `lastIntent` is user text — already capped at 50 chars display; full text still sent to Claude (existing validation at worker `/chat` applies) |
| V6 Cryptography | no | Not touched |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Session history content injection | Spoofing / Tampering | History is text-only from the app itself — no external input populates it; `guidance` text comes from Claude API response (already validated by worker) |
| Token bloat via unlimited history | Denial of Service (self) | D-09 hard cap at 3 prior turns — no budget counting needed |
| XSS via rendered guidance text | Tampering | SolidJS JSX escapes text by default when rendering as text nodes; guidance text renders as `{line}` text content, not `innerHTML` [ASSUMED — standard SolidJS behavior] |

---

## Environment Availability

Step 2.6: SKIPPED — Phase 9 is purely frontend TypeScript/SolidJS changes with no new external dependencies or CLI tools. No new npm packages, no new Rust crates, no new services.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `createSignal<T[]>` with functional setter is the correct SolidJS pattern for an array that triggers re-renders | Standard Stack / Architecture | Low — this is fundamental SolidJS; if wrong, `createStore` is the alternative, but it's unused in this codebase |
| A2 | SolidJS JSX text rendering escapes HTML by default (no XSS from guidance text rendered as `{line}`) | Security Domain | Low — standard framework behavior; verified by SolidJS docs in training; not re-verified via Context7 this session |
| A3 | Worker `/chat` endpoint will correctly handle a multi-turn messages array (not just single-element) | Integration Points | Very low — verified by reading worker code: it passes `body.messages` directly to Anthropic without modification |

---

## Open Questions

1. **SessionFeed ref lifting**
   - What we know: Auto-scroll requires a ref on the SessionFeed container div. The scroll trigger fires in `onToken` inside `SidebarShell.submitIntent`.
   - What's unclear: Whether to lift the ref (pass a `ref` prop to SessionFeed) or trigger scroll via a SolidJS `createEffect` watching `contentState()` transition inside SessionFeed itself.
   - Recommendation: Use a `ref` callback prop on SessionFeed — e.g., `<SessionFeed ref={(el) => { sessionFeedRef = el; }} .../>`. This keeps scroll logic co-located with where the trigger fires (`onToken` in SidebarShell), consistent with how `inputRef` is handled.

2. **GuidanceList retention**
   - What we know: GuidanceList is currently used in the streaming Show block. SessionFeed replaces it.
   - What's unclear: Whether to delete GuidanceList immediately or keep it as a dead file.
   - Recommendation: Keep GuidanceList as-is in Phase 9 (do not delete). It can be cleaned up in a later refactor phase. Avoids accidental breakage if any other code references it.

---

## Sources

### Primary (HIGH confidence)
- `src/components/SidebarShell.tsx` — current state machine, signal declarations, onOverlayShown handler, submitIntent structure [VERIFIED: read in full]
- `src/lib/ai.ts` — StreamGuidanceOptions interface, messages array construction, worker fetch [VERIFIED: read in full]
- `src/components/GuidanceList.tsx` — scroll pattern, For/Show patterns, containerRef [VERIFIED: read in full]
- `worker/src/index.ts` — /chat endpoint messages array passthrough [VERIFIED: read in full]
- `src/styles/theme.css` — all design tokens [VERIFIED: read in full]
- `.planning/phases/09-state-machine-conversation-continuity/09-CONTEXT.md` — all locked decisions [VERIFIED: read in full]
- `.planning/phases/09-state-machine-conversation-continuity/09-UI-SPEC.md` — component specs, interaction contracts [VERIFIED: read in full]

### Secondary (MEDIUM confidence)
- None required — all critical patterns verified directly in codebase

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new dependencies; all patterns present in codebase
- Architecture: HIGH — all patterns derived from verified existing code and locked decisions
- Pitfalls: HIGH — derived from reading actual code and known SolidJS signal semantics
- Integration: HIGH — worker code verified; API contract confirmed

**Research date:** 2026-04-12
**Valid until:** 2026-05-12 (stable stack — 30 days)
