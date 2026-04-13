# Phase 9: State Machine + Conversation Continuity - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-12
**Phase:** 09-state-machine-conversation-continuity
**Areas discussed:** Session reset trigger, History display, Task header, Context structure

---

## Session Reset Trigger

| Option | Description | Selected |
|--------|-------------|----------|
| Explicit button only | User sees a 'New task' or 'Reset' control. No automatic detection. Predictable, no false positives. | ✓ |
| Claude classifies it | Each submission classified by Claude as continuation vs new task. Adds latency + cost, risk of false positives. | |
| Keyword heuristic | Detect follow-up language vs new-task language. Fast but brittle. | |

**User's choice:** Explicit button only

| Option | Description | Selected |
|--------|-------------|----------|
| Small link below task header | Visible but unobtrusive. Natural proximity to the task header. | ✓ |
| Icon button in header row | Compact icon alongside settings gear. Always visible, competes with other controls. | |
| Only in input area | Subtle link near the text input, close to where users form queries. | |

**User's choice:** Small link below task header

---

## History Display

| Option | Description | Selected |
|--------|-------------|----------|
| Flat chronological feed | Prior exchanges stack above current response in order, like a chat thread. Simple, familiar. | ✓ |
| Collapsed stack with expand | Prior exchanges collapsed to single-line summaries; tap to expand. Adds friction. | |
| Separate history tab/panel | History lives behind a second tab. Breaks linear flow. | |

**User's choice:** Flat chronological feed

| Option | Description | Selected |
|--------|-------------|----------|
| Muted / secondary text color | Prior exchanges in var(--color-text-secondary). Minimal, consistent with codebase patterns. | ✓ |
| Divider lines between exchanges | Horizontal rules between each exchange. More visual noise in narrow panel. | |
| Slightly reduced font size | Prior exchanges at smaller scale. Could make older steps hard to read. | |

**User's choice:** Muted / secondary text color

| Option | Description | Selected |
|--------|-------------|----------|
| Auto-scroll to bottom on new response | When streaming starts, scroll to show new response. Standard chat behavior. | ✓ |
| Stay at current scroll position | Don't jump. User scrolls themselves. Better if actively reading prior steps. | |

**User's choice:** Auto-scroll to bottom on new response

---

## Task Header

| Option | Description | Selected |
|--------|-------------|----------|
| Raw user intent, truncated | User's first intent capped at ~50 chars with ellipsis. Instant, zero cost, accurate. | ✓ |
| AI-generated title | Post-response call to generate a short title. More polished, adds latency + API cost. | |
| First N words of intent | Take first 6-8 words. Could cut awkwardly mid-word. | |

**User's choice:** Raw user intent, truncated

| Option | Description | Selected |
|--------|-------------|----------|
| Appears on first submit, cleared on reset only | Header appears on first submit, persists through follow-ups, cleared by 'New task' only. | ✓ |
| Appears only while streaming/after response | Not shown on initial loading state — flash-in moment. | |
| Always visible even in empty state | Shows placeholder 'No active task'. Could be confusing. | |

**User's choice:** Appears on first submit, cleared on session reset only

---

## Context Structure

| Option | Description | Selected |
|--------|-------------|----------|
| Claude messages array | [{role, content}] array, text-only for prior turns. Native Claude format — best coherence. | ✓ |
| System prompt injection | Prior turns as a text block in the system prompt. Less structured. | |
| Last response only | Only immediately preceding turn. Minimal tokens, loses multi-step context. | |

**User's choice:** Claude messages array

| Option | Description | Selected |
|--------|-------------|----------|
| Last 3 turns | Cap at 3 prior exchanges (6 messages). Safe floor from STATE.md research. | ✓ |
| Last 5 turns | More context, doubles token overhead. | |
| Token-budget-based | Keep turns until budget exhausted. Most precise, adds complexity. | |

**User's choice:** Last 3 turns

| Option | Description | Selected |
|--------|-------------|----------|
| Persist across hide/show, reset on app restart | In-memory signals only. Satisfies SESS-02 directly. | ✓ |
| Persist across hide/show + localStorage | Serialized to disk. Adds complexity, privacy concerns. | |
| Reset on each overlay open | Current (broken) behavior — violates SESS-02. | |

**User's choice:** Persist across hide/show, reset on app restart

---

## Claude's Discretion

- Exact visual styling/spacing for task header strip
- Whether to show turn count or other metadata on prior exchanges
- Scroll implementation detail (ref + scrollIntoView vs scrollTop)

## Deferred Ideas

None.
