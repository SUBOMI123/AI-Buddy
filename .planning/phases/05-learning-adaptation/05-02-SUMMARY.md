---
phase: 05-learning-adaptation
plan: "02"
subsystem: learning-adaptation-ui
tags: [typescript, solidjs, ai-ts, tauri-ipc, tier-guidance, degradation-notice]
dependency_graph:
  requires: [05-01]
  provides: [tier-aware-stream-guidance, memory-wired-submit-intent, degradation-notice-ui]
  affects: [05-03]
tech_stack:
  added: []
  patterns: [tier-suffix-prompt-injection, fire-and-forget-record, forceFullSteps-override, solidjs-show-conditional]
key_files:
  created: []
  modified:
    - src/lib/ai.ts
    - src/lib/tauri.ts
    - src/components/SidebarShell.tsx
decisions:
  - "Unused signal getters (_currentTaskLabel, _showFullStepsOverride) prefixed with _ to satisfy noUnusedLocals — setters are actively called, getters reserved for Plan 03 settings screen"
  - "Degradation notice condition includes streamingText().length > 0 guard so notice only appears after content arrives, not during loading"
  - "forceFullSteps=false default preserves existing handleRetry behavior unchanged — re-classify on retry is correct (encounter count may have changed)"
metrics:
  duration_minutes: 10
  completed_date: "2026-04-10"
  tasks_completed: 2
  files_changed: 3
---

# Phase 05 Plan 02: Learning Adaptation UI Wiring Summary

**One-liner:** Tier-aware `streamGuidance` with TIER_SUFFIX prompt injection, `submitIntent` wrapped with classify-before/record-after memory calls, and degradation notice UI with "Show full steps" override.

## What Was Built

Wired the storage layer from Plan 01 into the live AI guidance flow:

1. **`src/lib/ai.ts`** — Tier-aware prompt construction:
   - `TIER_SUFFIX` constant map: tier 1 = empty (no change), tier 2 = summary mode suffix, tier 3 = hints-only suffix
   - `StreamGuidanceOptions` extended with `tier?`, `memoryContext?`, `taskLabel?`
   - `streamGuidance` builds `systemPrompt = SYSTEM_PROMPT + TIER_SUFFIX[tier] + memoryContext block` before the fetch call
   - Tier 1 behavior is byte-for-byte identical to pre-Phase-5 (TIER_SUFFIX[1] = "")

2. **`src/lib/tauri.ts`** — Memory IPC wrappers:
   - `GuidanceContext` interface: `{ tier, taskLabel, encounterCount }`
   - `prepareGuidanceContext(rawIntent)` — wraps `cmd_prepare_guidance_context`
   - `recordInteraction(taskLabel, rawIntent, guidance, tier, appContext?)` — wraps `cmd_record_interaction`
   - `getMemoryContext()` — wraps `cmd_get_memory_context`

3. **`src/components/SidebarShell.tsx`** — Memory-aware submit flow + degradation UI:
   - Three new signals: `currentTier`, `_currentTaskLabel`, `_showFullStepsOverride`
   - `submitIntent` accepts `forceFullSteps = false` parameter
   - Before screenshot capture: calls `prepareGuidanceContext(intent)` to get `{ tier, taskLabel }`; defaults to tier 1 on failure
   - For tier > 1: calls `getMemoryContext()` and passes result as `memoryContext` to `streamGuidance`
   - `streamGuidance` call now passes `tier`, `memoryContext`, `taskLabel`
   - In `onDone`: `recordInteraction(...)` called fire-and-forget with `.catch(() => {})`
   - `handleShowFullSteps`: calls `submitIntent(intent, true)` — skips classification, forces tier 1
   - Degradation notice `<Show>` block: appears when `currentTier() > 1` and streaming text is present; copy adapts to "summary" (tier 2) or "hints" (tier 3)
   - "Show full steps" button triggers `handleShowFullSteps`

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | 0a5bf98 | feat(05-02): extend ai.ts with tier-aware prompt injection and tauri.ts memory IPC wrappers |
| 2 | 8fd04d5 | feat(05-02): wire memory context into SidebarShell — tier classification, degradation notice, Show full steps |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] noUnusedLocals TS error on signal getters**
- **Found during:** Task 2 verification (`npx tsc --noEmit`)
- **Issue:** `currentTaskLabel` and `showFullStepsOverride` signal getters declared but not consumed in JSX — `noUnusedLocals: true` in tsconfig raises TS6133
- **Fix:** Prefixed getters with `_` (`_currentTaskLabel`, `_showFullStepsOverride`). Setters remain unchanged. Getters are reserved for Plan 03 settings screen use.
- **Files modified:** `src/components/SidebarShell.tsx`

## Security Review

| Threat ID | Status | Implementation |
|-----------|--------|----------------|
| T-05-06 | Mitigated | `getMemoryContext()` returns aggregate summary string from Rust (< 800 chars, no raw rows) — D-08 enforced at the source |
| T-05-07 | Accept | `forceFullSteps` is a local boolean set only by `handleShowFullSteps` in same component — no external injection path |
| T-05-08 | Accept | `recordInteraction` called fire-and-forget with `.catch(() => {})` — failures are silent, no retry loop, no UI blocking |

## Known Stubs

None — all wiring is live. `prepareGuidanceContext` calls the real `cmd_prepare_guidance_context` Rust command. `recordInteraction` calls real `cmd_record_interaction`. `getMemoryContext` calls real `cmd_get_memory_context`. Degradation notice renders real tier data.

## Threat Flags

None — no new network endpoints, no new auth paths, no new file access patterns. All new code paths are TypeScript-only additions to existing frontend flow.

## Self-Check: PASSED

- [x] `src/lib/ai.ts` — contains `TIER_SUFFIX`, extended `StreamGuidanceOptions`, `systemPrompt` construction
- [x] `src/lib/tauri.ts` — contains `prepareGuidanceContext`, `recordInteraction`, `getMemoryContext` exports
- [x] `src/components/SidebarShell.tsx` — contains all three imports, degradation notice UI, "Show full steps" button
- [x] commit 0a5bf98 — FOUND
- [x] commit 8fd04d5 — FOUND
- [x] `npx tsc --noEmit` exits 0 — VERIFIED
- [x] `cargo build` pre-existing failure confirmed unrelated to this plan (APP_HMAC_SECRET env var missing at compile time — present before this plan's changes)
