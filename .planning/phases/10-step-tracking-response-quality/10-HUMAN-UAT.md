---
status: diagnosed
phase: 10-step-tracking-response-quality
source: [10-VERIFICATION.md]
started: 2026-04-12T23:22:00Z
updated: 2026-04-13T00:00:00Z
---

## Current Test

Human testing completed 2026-04-13. 3 gaps found.

## Tests

### 1. Checklist renders after streaming
expected: After AI response streaming completes, StepChecklist component renders below SessionFeed with numbered steps highlighted correctly
result: PASS — checklist renders and is interactive

### 2. Non-linear step toggle
expected: Clicking step 3 without completing steps 1/2 moves the isCurrent() highlight to step 3 correctly; no linear constraint enforced
result: PASS — non-linear toggle works

### 3. Copy button on command steps
expected: Copy button appears on command-prefixed steps (git, npm, etc.) and navigator.clipboard works in Tauri WebView window focus context
result: FAIL — steps show "To see all available branches, run:" with nothing after; the actual command (e.g. `git branch`) is on the next line which parseSteps discards. Multi-line steps not captured.

### 4. Session history scroll
expected: Scroll container layout shows prior exchanges above current checklist; overflow-y:auto enables scrollback through session history
result: FAIL — prior exchanges not visible; scroll does not reach them (may be there but scroll container does not allow access)

### 5. Step-first AI response
expected: Live Claude API call returns "1." on the first line with no preamble sentence before the numbered list
result: FAIL — SYSTEM_PROMPT forces numbered format even for clarifying questions, producing steps like "1. What specific git operation do you want to perform?" — checklist renders for clarifying questions, not just guidance steps

## Summary

total: 5
passed: 2
issues: 3
pending: 0
skipped: 0
blocked: 0

## Gaps

- status: failed
  id: GAP-01
  description: parseSteps discards commands on lines following "run:" — multi-line step bodies not captured
  affected: src/lib/parseSteps.ts, src/lib/ai.ts (SYSTEM_PROMPT)
  fix: Either (a) update SYSTEM_PROMPT to put command inline "1. List branches: `git branch`" or (b) extend parseSteps to capture continuation lines after a step
  severity: high

- status: failed
  id: GAP-02
  description: Prior session exchanges not reachable via scroll — scroll container cuts off above the checklist
  affected: src/components/SidebarShell.tsx (scroll container layout)
  fix: Ensure the scroll container wraps both sessionHistory and currentExchange/checklist, not just the checklist area
  severity: high

- status: failed
  id: GAP-03
  description: SYSTEM_PROMPT forces numbered list format even for clarifying questions — StepChecklist renders for Q&A, not just actionable steps
  affected: src/lib/ai.ts (SYSTEM_PROMPT), src/components/SidebarShell.tsx (render condition)
  fix: Either (a) update SYSTEM_PROMPT to allow clarifying questions as prose, only using numbered steps for guidance, or (b) add a heuristic in SidebarShell to detect when steps are actually a question and fall back to RawGuidanceText
  severity: medium
