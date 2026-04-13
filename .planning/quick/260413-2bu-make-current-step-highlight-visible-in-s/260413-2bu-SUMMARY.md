---
task_id: 260413-2bu
status: complete
completed: 2026-04-13
commit: 6cf2e29
files_modified:
  - src/styles/theme.css
  - src/components/StepChecklist.tsx
---

# Quick Task 260413-2bu: Make current-step highlight visible in StepChecklist

## One-liner

Introduced `--color-step-current` CSS variable (blue-tinted, theme-aware) to replace the imperceptible `--color-surface-secondary` (8% white) used for the active step background.

## What Changed

### `src/styles/theme.css`

Added `--color-step-current` to both color scheme blocks:
- Light mode: `rgba(0, 122, 255, 0.10)` — 10% blue tint matching `--color-accent` (`#007AFF`)
- Dark mode: `rgba(10, 132, 255, 0.15)` — 15% blue tint matching dark-mode accent (`#0A84FF`)

The stronger opacity in dark mode compensates for the lower contrast ceiling on dark surfaces.

### `src/components/StepChecklist.tsx`

Replaced `var(--color-surface-secondary)` with `var(--color-step-current)` on the current-step button background (line ~80).

## Why This Fix

`--color-surface-secondary` resolves to `rgba(255,255,255,0.08)` in dark mode — an 8% white overlay that is visually indistinguishable from the surrounding surface. Users had no visible indicator of which step was active. The new variable uses a blue tint that is clearly perceptible while remaining subtle enough not to distract from the step text.

## Deviations

None — executed exactly as specified.
