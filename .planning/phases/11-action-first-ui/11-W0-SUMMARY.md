---
phase: 11-action-first-ui
plan: W0
subsystem: lib
tags: [tdd, presets, constants, pure-functions]
dependency_graph:
  requires: []
  provides: [quickActionPresets module]
  affects: [QuickActions.tsx, SidebarShell.tsx]
tech_stack:
  added: []
  patterns: [TDD red-green, pure-function module, vitest unit tests]
key_files:
  created:
    - src/lib/quickActionPresets.ts
    - src/lib/quickActionPresets.test.ts
  modified: []
decisions:
  - "buildTryAnotherPrompt uses String.replace (not replaceAll) — TRY_ANOTHER_SUFFIX appears at most once so single replace is correct and simpler"
  - "empty string base returns TRY_ANOTHER_SUFFIX unchanged (leading space preserved — callers trim if needed)"
metrics:
  duration_seconds: 52
  completed_date: "2026-04-13"
  tasks_completed: 2
  files_changed: 2
requirements_satisfied: [ACTN-01, ACTN-03]
---

# Phase 11 Plan W0: quickActionPresets TDD Scaffold — Summary

**One-liner:** Pure-function module with QUICK_PRESETS, TRY_ANOTHER_SUFFIX, and buildTryAnotherPrompt with anti-compounding strip-then-append logic; 8 Vitest unit tests green.

## What Was Built

Extracted quick action preset strings and the "Try another way" suffix logic into a testable pure-function module (`src/lib/quickActionPresets.ts`) using TDD red-green sequence.

### Module Exports

- `QUICK_PRESETS` — Record with Fix/Explain/Optimize D-03 preset strings; Ask key intentionally absent
- `TRY_ANOTHER_SUFFIX` — em-dash suffix string for "Try another way" prompt modification
- `buildTryAnotherPrompt(base)` — strips prior suffix before re-appending (prevents compound prompts on repeated taps)

### Test Coverage (8 cases)

1. QUICK_PRESETS["Fix"] exact string match
2. QUICK_PRESETS["Explain"] exact string match
3. QUICK_PRESETS["Optimize"] exact string match
4. QUICK_PRESETS has no "Ask" key
5. TRY_ANOTHER_SUFFIX contains em-dash, not hyphen
6. TRY_ANOTHER_SUFFIX exact value match
7. buildTryAnotherPrompt appends suffix to unsuffixed base
8. buildTryAnotherPrompt does not double the suffix (anti-compound)
9. buildTryAnotherPrompt returns same result for already-suffixed input
10. buildTryAnotherPrompt("") returns TRY_ANOTHER_SUFFIX

## TDD Sequence

- **RED commit** `667a6b7`: `test(11-W0): add failing tests for quickActionPresets (RED)` — 9 tests failing (module not found)
- **GREEN commit** `90f44ea`: `feat(11-W0): implement quickActionPresets module (GREEN)` — 25 tests passing, 0 regressions

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — module exports compile-time constants and a pure function; no data flows stub.

## Threat Flags

None — module is pure compile-time constants with no user data input surface.

## Self-Check: PASSED

- `src/lib/quickActionPresets.ts` — FOUND
- `src/lib/quickActionPresets.test.ts` — FOUND
- Commit `667a6b7` — FOUND (RED)
- Commit `90f44ea` — FOUND (GREEN)
- `npm test` — 25 passed, 0 failed
