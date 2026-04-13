---
phase: quick
plan: 260412-x4i
subsystem: frontend
tags: [parseSteps, ai-prompt, scroll, clarifying-questions, uat-fix]
dependency_graph:
  requires: []
  provides: [isClarifyingQuestion, inline-backtick-steps, sidebar-scroll-fix, clarifying-question-prose-render]
  affects: [SidebarShell, SessionFeed, parseSteps, SYSTEM_PROMPT]
tech_stack:
  added: []
  patterns: [tdd-red-green, inline-backtick-commands, scroll-delegation]
key_files:
  created: []
  modified:
    - src/lib/ai.ts
    - src/lib/parseSteps.ts
    - src/lib/parseSteps.test.ts
    - src/components/SidebarShell.tsx
    - src/components/SessionFeed.tsx
decisions:
  - "SYSTEM_PROMPT now instructs inline backticks (not code blocks) for terminal commands — parseSteps regex captures full step label including backtick content"
  - "isClarifyingQuestion heuristic: single step ending with '?' renders as RawGuidanceText, not StepChecklist"
  - "Scroll delegation: SessionFeed is natural-height, .sidebar-content owns overflow-y:auto — contentAreaRef used for auto-scroll"
metrics:
  duration: "~8 minutes"
  completed: "2026-04-12"
  tasks_completed: 2
  files_modified: 5
---

# Quick Task 260412-x4i: Fix Phase 10 UAT Gaps — Multi-line Parse, Scroll, Clarifying Questions

**One-liner:** Closed three Phase 10 UAT failures: inline-backtick step capture (GAP-01), sidebar scroll delegation to outer container (GAP-02), and prose render for clarifying question responses (GAP-03).

## Tasks Completed

| Task | Commit | Description |
|------|--------|-------------|
| 1 — SYSTEM_PROMPT + isClarifyingQuestion | 22f3fc2 | Updated prompt to inline backticks; exported isClarifyingQuestion heuristic; added 5 new tests (12 total passing) |
| 2 — Scroll fix + clarifying question branch | 88cf7fa | Removed SessionFeed internal scroll; moved scroll target to contentAreaRef on .sidebar-content; added isClarifyingQuestion render branch in SidebarShell |

## What Was Fixed

### GAP-01: Multi-line step bodies discarded (HIGH)
**Root cause:** SYSTEM_PROMPT instructed ```` ``` ```` code blocks inside numbered steps. `parseSteps` regex `/^\d+\.\s+(.+)$/` skips non-matching lines — the command on a separate fence line was lost.

**Fix:** SYSTEM_PROMPT now instructs inline backticks (`e.g. "Run \`git branch\` to see branches"`). The step label now contains the full text including the inline command, and `parseSteps` captures it in a single line match.

### GAP-02: Session history scroll broken (HIGH)
**Root cause:** `SessionFeed` had `flex: "1"` and `overflow-y: "auto"` making it the scroll container. `StepChecklist` is rendered as a sibling below `SessionFeed` in the same flex column — outside `SessionFeed`'s scroll area, unreachable by scrolling.

**Fix:** Removed `flex: "1"` and `overflow-y: "auto"` from `SessionFeed`'s root div. It is now a natural-height flex child. The outer `.sidebar-content` div in `SidebarShell` owns `overflow-y: auto` and `flex: 1`. Added `contentAreaRef` on `.sidebar-content` and updated the `onToken` auto-scroll to use `contentAreaRef.scrollTop = contentAreaRef.scrollHeight`.

### GAP-03: Clarifying questions rendered as StepChecklist (MEDIUM)
**Root cause:** AI occasionally responds to vague intents with a single clarifying question (e.g. "Which file are you trying to open?"). `parseSteps` captures this as a single Step, and the render path checks `steps().length > 0` → renders `StepChecklist` — a checkbox UI for a question makes no sense.

**Fix:** New `isClarifyingQuestion(steps)` export in `parseSteps.ts`: returns `true` when `steps.length === 1` and the label ends with `"?"`. Render branch in `SidebarShell` updated to `steps().length > 0 && !isClarifyingQuestion(steps())` — clarifying questions fall through to `RawGuidanceText`.

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None.

## Threat Flags

None — no new network endpoints, auth paths, or trust boundary surface introduced.

## Self-Check: PASSED

All 5 modified files confirmed present. Both task commits (22f3fc2, 88cf7fa) confirmed in git log. All 12 vitest tests pass.
