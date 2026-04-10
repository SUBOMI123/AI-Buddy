---
phase: 02-core-ai-loop
plan: 02
subsystem: ui
tags: [solidjs, streaming, state-machine, abort-controller]

requires:
  - phase: 02-01
    provides: streamGuidance, captureScreenshot, getInstallationToken backend functions

provides:
  - LoadingDots pulsing animation component
  - GuidanceList streaming text display with auto-scroll
  - SidebarShell full state machine (empty, loading, streaming, error)
  - Submit -> capture -> auth -> stream -> display flow
  - Error handling with inline Retry button
  - Screenshot fallback notice for text-only mode

affects: [02-03, voice-input, settings]

tech-stack:
  added: []
  patterns: [AbortController for request cancellation, SolidJS signal-based state machine, streaming text append via setter callback]

key-files:
  created:
    - src/components/LoadingDots.tsx
  modified:
    - src/components/GuidanceList.tsx
    - src/components/SidebarShell.tsx

decisions:
  - Render streaming text as raw pre-wrap text (not split into steps) for simplicity and no re-render jank
  - Auto-scroll only when user is near bottom (40px threshold) to avoid hijacking manual scroll
  - Screenshot failure is non-blocking -- continues with text-only request and shows inline notice

metrics:
  duration: 1m
  completed: 2026-04-09
---

# Phase 2 Plan 02: Frontend UI Wiring Summary

SidebarShell state machine wired to backend AI pipeline with streaming text display, loading animation, error/retry flow, and screenshot fallback

## What Was Built

### LoadingDots Component (src/components/LoadingDots.tsx)
- Three pulsing dots with CSS keyframe animation
- Opacity cycles 0.3 to 1.0 over 1.2s with ease-in-out
- Staggered 200ms per dot (0ms, 200ms, 400ms delays)
- Uses design tokens: `--color-text-secondary`, `--space-xs`
- Centered vertically using same flex pattern as EmptyState

### GuidanceList Streaming Update (src/components/GuidanceList.tsx)
- Replaced old `steps: string[]` interface with `streamingText: string`
- Renders with `<pre>` and `white-space: pre-wrap` to preserve Claude's numbered step formatting
- Auto-scroll: tracks scroll position, only scrolls to bottom when user is within 40px of bottom
- `font-family: inherit` keeps system font (not monospace)

### SidebarShell State Machine (src/components/SidebarShell.tsx)
- **ContentState type**: `"empty" | "loading" | "streaming" | "error"`
- **Submit flow** (`submitIntent`):
  1. Abort any in-flight request via AbortController (D-07)
  2. Clear previous state, show LoadingDots
  3. Capture screenshot (try/catch -- falls back to null with notice on failure, D-04/D-12)
  4. Get signed HMAC auth token
  5. Call `streamGuidance` with onToken/onError/onDone callbacks
  6. First token switches state from loading to streaming (D-06)
- **Error state**: Inline error message with Retry button (D-11)
- **Retry**: Re-submits `lastIntent` with fresh screenshot capture (D-01)
- **Screenshot fallback notice**: "Screen capture unavailable -- guidance may be less specific"
- **Cleanup**: AbortController aborted on unmount via onCleanup

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | af35bd2 | LoadingDots component + GuidanceList streaming update |
| 2 | 95faaec | SidebarShell state machine wiring |

## Deviations from Plan

None -- plan executed exactly as written.

## Verification Results

- `npx tsc --noEmit` passes with zero errors
- `streamGuidance` found in SidebarShell.tsx (2 occurrences)
- `captureScreenshot` found in SidebarShell.tsx (2 occurrences)
- `LoadingDots` found in SidebarShell.tsx (2 occurrences)
- "Not connected yet" stub removed (0 occurrences)

## Self-Check: PASSED
