---
phase: 10-step-tracking-response-quality
plan: "03"
subsystem: sidebar-state-machine
tags: [SidebarShell, currentExchange, steps, StepChecklist, RawGuidanceText, SolidJS, session-history]
dependency_graph:
  requires: ["01", "02"]
  provides: [wired-step-lifecycle, wired-checklist-render]
  affects: []
tech_stack:
  added: []
  patterns: [SolidJS signal separation (currentExchange vs sessionHistory), post-stream parse at onDone, array spread for reactive toggle]
key_files:
  created: []
  modified:
    - src/components/SidebarShell.tsx
decisions:
  - "currentExchange signal separates active exchange from sessionHistory — onDone sets currentExchange, submitIntent moves it to history at next call start"
  - "steps reset to [] at start of submitIntent (D-13) — same moment currentExchange moves to history"
  - "SessionFeed receives empty string for streamingText when contentState !== 'streaming' — prevents duplicate render of guidance during done state"
  - "StepChecklist/RawGuidanceText rendered inside the SessionFeed Show block — inherits the same visibility gate (session has content or is active)"
  - "onToggle uses prev.map array spread pattern — required for SolidJS For reconciliation with createSignal arrays"
metrics:
  duration: "8m"
  completed: "2026-04-13T23:18:47Z"
  tasks_completed: 2
  files_created: 0
  files_modified: 1
---

# Phase 10 Plan 03: SidebarShell Wiring — currentExchange + Steps Lifecycle + JSX Layout Summary

SidebarShell fully wired with `currentExchange` and `steps` signal lifecycle (D-05, D-13); JSX updated to render `StepChecklist` or `RawGuidanceText` fallback below `SessionFeed` after streaming completes (D-06), satisfying all 6 Phase 10 requirements (STEP-01 through RESP-03).

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add currentExchange + steps signals and update lifecycle callbacks (D-05, D-13) | 9e0bfa2 | src/components/SidebarShell.tsx |
| 2 | Update JSX layout — SessionFeed props + StepChecklist/RawGuidanceText render (D-06) | 7efa77c | src/components/SidebarShell.tsx |

## What Was Built

**src/components/SidebarShell.tsx** — wiring-only changes (no new components):

**Task 1 — Signal lifecycle (D-05, D-13):**
- Added imports: `parseSteps`, `Step`, `StepChecklist`, `RawGuidanceText`
- Added `currentExchange` signal (`SessionExchange | null`) — active exchange separated from `sessionHistory`
- Added `steps` signal (`Step[]`) — populated at `onDone`, reset at `submitIntent`
- `submitIntent` start: if `currentExchange()` non-null, move to `sessionHistory` (3-turn cap), clear to null, reset `steps` to `[]`
- `onDone`: replaced `setSessionHistory(...)` push with `setCurrentExchange(completedExchange)` + `setSteps(parseSteps(accumulatedText))` — steps parsed post-stream only (D-01)
- `handleNewTask`: added `setCurrentExchange(null)` and `setSteps([])` alongside existing `setSessionHistory([])`

**Session exchange lifecycle after changes:**

| Moment | currentExchange | sessionHistory | steps |
|--------|-----------------|----------------|-------|
| submitIntent called | → null (prev moved to history) | appended (cap 3) | → [] |
| streaming | null | unchanged | [] |
| onDone | → set from accumulatedText | unchanged | → parseSteps result |
| handleNewTask | → null | → [] | → [] |

**Task 2 — JSX layout (D-06):**
- `SessionFeed` `streamingText` prop: now passes `contentState() === "streaming" ? streamingText() : ""` — empty string when not actively streaming, preventing prior guidance from re-rendering in SessionFeed during "done" state
- Added `<Show when={contentState() === "done"}>` block immediately inside the SessionFeed Show wrapper:
  - `steps().length > 0` → renders `<StepChecklist steps={steps()} onToggle={...} />`
  - `steps().length === 0` → renders `<RawGuidanceText text={currentExchange()?.guidance ?? ""} />` (D-06a fallback)
- `onToggle` handler uses `prev.map((step, i) => i === index ? { ...step, completed: !step.completed } : step)` — SolidJS array spread pattern for correct reactivity

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None. All signals are wired end-to-end: `parseSteps` produces `Step[]`, `StepChecklist` receives live `steps()`, `RawGuidanceText` receives live `currentExchange()?.guidance`. No mock data, no hardcoded values flowing to UI.

## Threat Surface

No new network endpoints, auth paths, or trust boundary changes introduced. Threat register items for this plan:

| Threat ID | Status |
|-----------|--------|
| T-10-03-01 | Mitigated — 3-turn cap enforced in submitIntent: `updated.length > 3 ? updated.slice(updated.length - 3) : updated` |
| T-10-03-02 | Accepted — currentExchange set only from accumulatedText (Claude response), not user-injectable |
| T-10-03-03 | Accepted — step toggle is in-memory only, no audit trail needed |
| T-10-03-04 | Accepted — parseSteps is O(n) on line count; Claude max_tokens=4096 bounds input |
| T-10-03-05 | Accepted — sessionHistory lives in SolidJS signal only, never serialized |

## Self-Check: PASSED

- src/components/SidebarShell.tsx: FOUND
- Commit 9e0bfa2: FOUND
- Commit 7efa77c: FOUND
- `setCurrentExchange` matches: 4 (declaration, submitIntent move, onDone set, handleNewTask clear) — CONFIRMED
- `setSteps` matches: 5 (declaration, submitIntent reset, onDone set, handleNewTask clear, onToggle) — CONFIRMED
- `parseSteps` import + call in onDone: CONFIRMED
- Old `setSessionHistory` in onDone: 0 matches — CONFIRMED REMOVED
- `contentState() === "done"` in JSX: 2 matches (degradation notice Show + new StepChecklist Show) — CONFIRMED
- `StepChecklist`: import + JSX usage — CONFIRMED
- `RawGuidanceText`: import + JSX usage — CONFIRMED
- `streamingText={contentState() === "streaming" ? streamingText() : ""}`: CONFIRMED
- TypeScript errors: 7 (all pre-existing unlisten* warnings, 0 new from this plan) — CONFIRMED
- Unit tests: 7/7 PASS — CONFIRMED
