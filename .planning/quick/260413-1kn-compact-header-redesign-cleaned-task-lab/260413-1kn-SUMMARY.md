---
phase: quick
plan: 260413-1kn
subsystem: ui
tags: [header, stepchecklist, polish, ux]
dependency_graph:
  requires: []
  provides: [compact-header-redesign, remove-step-border, copy-button-contrast]
  affects: [SidebarShell, StepChecklist]
tech_stack:
  added: []
  patterns: [inline-style SolidJS, cleanLabel helper, conditional Show blocks]
key_files:
  created: []
  modified:
    - src/components/SidebarShell.tsx
    - src/components/StepChecklist.tsx
decisions:
  - "Standalone gear header conditioned on lastIntent().length === 0 so gear is always reachable regardless of session state"
  - "cleanLabel placed as a plain function inside the component (not a module export) — single-use helper"
  - "border-left kept as 3px solid transparent on current step to prevent layout reflow"
metrics:
  duration: ~10 minutes
  completed: "2026-04-13T06:10:44Z"
  tasks_completed: 2
  files_modified: 2
---

# Quick 260413-1kn: Compact Header Redesign + Cleaned Task Label Summary

**One-liner:** Replaced stacked two-element task header with a compact 38px single row showing cleaned label + Plus button + gear; removed blue left-border accent from current step; copy button now uses primary color at rest.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Compact single-row header in SidebarShell | 483ad81 | src/components/SidebarShell.tsx |
| 2 | Remove left-border from current step + stronger copy button | 0672648 | src/components/StepChecklist.tsx |

## Changes Made

### Task 1 — SidebarShell.tsx

- Added `Plus` import from `lucide-solid`
- Added `cleanLabel(raw)` helper: strips trailing `?`/`.`, capitalizes first character, truncates to 40 chars with ellipsis
- Replaced two-element stacked header (`<p>` task text + underlined "New task" button) with a single `38px` flex row:
  - `<span>` showing `Working on: {cleanLabel(lastIntent())}` — flex: 1, truncates with ellipsis
  - `<button>` with `<Plus size={14} />` — calls `handleNewTask`, tooltip "New task"
  - `<button>` with `<Settings size={14} />` — calls `setShowSettings(true)`, same row
- Standalone gear-only header now wrapped in `<Show when={lastIntent().length === 0}>` so it only appears in empty state

### Task 2 — StepChecklist.tsx

- `border-left` on step button changed from conditional `3px solid var(--color-accent)` (current) / `3px solid transparent` (others) to unconditional `3px solid transparent` — background highlight remains for current step identification
- Copy button base `color` changed from `var(--color-text-secondary)` to `var(--color-text-primary)`
- `onMouseLeave` handler now restores to `var(--color-text-primary)` (previously restored to secondary)

## Deviations from Plan

None — plan executed exactly as written.

## Verification

- `npx tsc --noEmit` passes with same 7 pre-existing `TS6133` errors (declared-but-never-read unlisten vars in SidebarShell) that existed before this plan. No new errors introduced.
- All success criteria met: compact single row, cleanLabel, + button and gear in same row, no blue left bar on current step, copy icon visible at rest.

## Known Stubs

None.

## Threat Flags

None. The `cleanLabel(lastIntent())` render path uses SolidJS text interpolation (no innerHTML) — XSS-safe per T-1kn-01 analysis in the plan.

## Self-Check: PASSED

- [x] `src/components/SidebarShell.tsx` modified and committed (483ad81)
- [x] `src/components/StepChecklist.tsx` modified and committed (0672648)
- [x] Both commits exist in git log
