---
phase: 10-step-tracking-response-quality
plan: "01"
subsystem: ai-response-parsing
tags: [parseSteps, system-prompt, tdd, green, vitest]
dependency_graph:
  requires: [W0]
  provides: [parseSteps-function, strict-system-prompt]
  affects: [10-02, 10-03]
tech_stack:
  added: []
  patterns: [TDD GREEN phase — tests written in W0 now passing, pure function parser]
key_files:
  created:
    - src/lib/parseSteps.ts
  modified:
    - src/lib/ai.ts
decisions:
  - "parseSteps uses trimStart().startsWith('1.') compliance check before any line parsing"
  - "Regex /^\\d+\\.\\s+(.+)$/ skips code fences and non-step lines without special handling"
  - "SYSTEM_PROMPT export keyword preserved — referenced by test utilities and future consumers"
  - "TIER_SUFFIX and context injection logic in streamGuidance() left entirely unchanged"
metrics:
  duration: "4m"
  completed: "2026-04-13T23:14:30Z"
  tasks_completed: 2
  files_created: 1
  files_modified: 1
---

# Phase 10 Plan 01: parseSteps() Implementation + Strict System Prompt Summary

`parseSteps()` pure function with Step interface GREEN across all 7 unit tests; SYSTEM_PROMPT replaced with strict step-first format requiring "1." on line 1 with no preamble.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create src/lib/parseSteps.ts (GREEN the tests) | 62dfd7a | src/lib/parseSteps.ts |
| 2 | Replace SYSTEM_PROMPT in src/lib/ai.ts | 6554aad | src/lib/ai.ts |

## What Was Built

**src/lib/parseSteps.ts** — Pure parser function implementing the D-02 algorithm:
- Exports `Step` interface (`label: string`, `completed: boolean`)
- Exports `parseSteps(text: string): Step[]`
- Compliance check: `text.trimStart().startsWith("1.")` — returns `[]` on failure (triggers RawGuidanceText fallback per D-06a)
- Line parser: splits on `\n`, filters empty lines, matches `/^\d+\.\s+(.+)$/`
- Non-matching lines (code fences, blank lines) silently skipped
- Empty-after-parse case also returns `[]`
- All 7 Vitest unit tests GREEN

**src/lib/ai.ts** — SYSTEM_PROMPT constant replaced with D-11 strict format:
- Starts with "You are a task execution assistant."
- Enforces "1." on first line, no intro, no screen description, no context explanation
- Requires ONE actionable instruction per step with visible UI element references
- Mandates markdown code blocks for terminal commands/snippets
- Vague intent → ask ONE clarifying question as step 1
- All surrounding logic preserved: `TIER_SUFFIX`, `appContext` injection, `memoryContext` injection, `streamGuidance()` function body

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None. `parseSteps.ts` is a complete implementation, not a stub. `ai.ts` SYSTEM_PROMPT is the final production value.

## Threat Surface

No new network endpoints, auth paths, or trust boundary changes introduced. Threat register items T-10-01-01 through T-10-01-03 all accepted per plan (prompt is not a secret, parseSteps has no side effects, export is not a disclosure risk).

## Self-Check: PASSED

- src/lib/parseSteps.ts: FOUND
- src/lib/ai.ts: FOUND (SYSTEM_PROMPT updated)
- Commit 62dfd7a: FOUND
- Commit 6554aad: FOUND
- All 7 parseSteps unit tests: PASS
- "Start your response with" in ai.ts: CONFIRMED (line 6)
- "You are AI Buddy" in ai.ts: NOT FOUND (good)
- TIER_SUFFIX in ai.ts: CONFIRMED (lines 25 and 55)
