---
phase: 11-action-first-ui
plan: 02
type: summary
wave: 2
status: complete
commit: 7103191
---

# Plan 11-02 Summary: TryAnotherWay component

## Tasks completed

| Task | Status | Commit |
|------|--------|--------|
| T1: Create TryAnotherWay.tsx | ✓ | 7103191 |
| T2: Wire into SidebarShell | ✓ | 7103191 |

## What was built

- `src/components/TryAnotherWay.tsx` — inline text-button, no signals, no icons; hover shifts color from `--color-text-secondary` to `--color-text-primary`
- `src/components/SidebarShell.tsx` — three additions:
  1. `import { TryAnotherWay } from "./TryAnotherWay"`
  2. `import { buildTryAnotherPrompt } from "../lib/quickActionPresets"`
  3. `handleTryAnotherWay` handler (strips prior suffix, calls `submitIntent`)
  4. `<TryAnotherWay onRetry={handleTryAnotherWay} />` inside `Show when={contentState() === "done"}`

## Verification

- `npx tsc --noEmit` — no errors on new code (pre-existing TS6133 unlisten vars unrelated)
- `npm test` — 25/25 passed
- Button auto-hides during loading: `Show when={contentState() === "done"}` wrapper handles it without extra logic
- No suffix doubling: `buildTryAnotherPrompt` strips prior suffix before appending (tested in W0)
