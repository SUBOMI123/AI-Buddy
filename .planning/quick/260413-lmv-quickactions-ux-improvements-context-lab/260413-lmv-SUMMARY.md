---
phase: quick
plan: 260413-lmv
subsystem: ui
tags: [quickactions, ux, placeholder, region-indicator]
dependency_graph:
  requires: []
  provides: [context-label-above-quickactions, region-indicator, sharper-button-labels, tighter-grid-spacing, updated-input-placeholder]
  affects: [src/components/QuickActions.tsx, src/components/TextInput.tsx, src/components/SidebarShell.tsx]
tech_stack:
  added: []
  patterns: [conditional-render-based-on-prop, calc-css-token-scaling]
key_files:
  created: []
  modified:
    - src/components/QuickActions.tsx
    - src/components/TextInput.tsx
    - src/components/SidebarShell.tsx
decisions:
  - Used a wrapping flex column div in QuickActions rather than a sibling component so the label and grid are co-located
  - Used calc(var(--space-lg) * 0.85) to tighten vertical grid padding without introducing new CSS tokens
metrics:
  duration: ~5 minutes
  completed: 2026-04-13T20:36:54Z
  tasks_completed: 2
  tasks_total: 2
  files_modified: 3
---

# Quick Plan 260413-lmv: QuickActions UX Improvements Summary

**One-liner:** Context-aware label above QuickActions grid with region indicator dot, sharper button labels, tighter grid padding, and updated TextInput placeholder.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Update QuickActions — context label, region indicator, sharper labels, tighter spacing | 602d042 | src/components/QuickActions.tsx |
| 2 | Update TextInput placeholder + wire hasRegion in SidebarShell | f03a28f | src/components/TextInput.tsx, src/components/SidebarShell.tsx |

## Changes Made

### QuickActions.tsx
- Added `hasRegion?: boolean` to `QuickActionsProps`
- Updated button display labels: "Fix issue", "Explain this", "Improve this", "Ask about this" — QUICK_PRESETS key references ("Fix", "Explain", "Optimize") unchanged
- Added context label block above the grid: "What do you want to do?" (no region) or accent dot + "Region selected" (hasRegion true)
- Tightened grid padding: `calc(var(--space-lg) * 0.85) var(--space-md)` (vertical), button padding: `var(--space-xs) var(--space-md)`
- Wrapped return in flex column div to contain label + grid

### TextInput.tsx
- Non-listening placeholder changed from "Ask me anything about what's on your screen..." to "Or type your own task..."
- Listening placeholder ("Listening...") unchanged

### SidebarShell.tsx
- Added `hasRegion={!!selectedRegion()}` prop to the QuickActions JSX in the empty-state Show block

## Deviations from Plan

None — plan executed exactly as written.

## Verification

TypeScript compilation: zero new errors (only pre-existing TS6133 unused-variable warnings in SidebarShell.tsx unrelated to these changes).

## Self-Check: PASSED

- src/components/QuickActions.tsx — FOUND (602d042)
- src/components/TextInput.tsx — FOUND (f03a28f)
- src/components/SidebarShell.tsx — FOUND (f03a28f)
