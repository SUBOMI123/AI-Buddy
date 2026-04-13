---
quick_id: 260413-lua
description: QuickActions polish — aware label copy, selection indicator, hover scale, tighter gap, shorten Ask
date: 2026-04-13
status: complete
commit: b241a98
---

# Quick Task 260413-lua Summary

## Changes

**src/components/QuickActions.tsx** (only file changed)

| Fix | Before | After |
|-----|--------|-------|
| Label copy (no region) | "What do you want to do?" | "What do you want to do?" (unchanged) |
| Label copy (with region) | "Region selected" | "What should I do with this?" |
| Gap | `var(--space-sm)` | `calc(var(--space-sm) * 0.9)` |
| Hover feedback | `brightness(1.15)` at 150ms | `brightness(1.15) + scale(1.02)` at 100ms |
| "Ask about this" | "Ask about this" | "Ask" |

## Verification

- `npx tsc --noEmit` — zero errors
- `npm test` — 25/25 passed
