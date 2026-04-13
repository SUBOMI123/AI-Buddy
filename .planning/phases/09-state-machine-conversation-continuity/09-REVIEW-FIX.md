---
phase: 09-state-machine-conversation-continuity
fixed_at: 2026-04-12T00:00:00Z
review_path: .planning/phases/09-state-machine-conversation-continuity/09-REVIEW.md
iteration: 1
findings_in_scope: 2
fixed: 2
skipped: 0
status: all_fixed
---

# Phase 09: Code Review Fix Report

**Fixed at:** 2026-04-12
**Source review:** .planning/phases/09-state-machine-conversation-continuity/09-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 2
- Fixed: 2
- Skipped: 0

## Fixed Issues

### WR-01: HTTP Error Responses Surface as Generic Connection Error

**Files modified:** `src/lib/ai.ts`
**Commit:** 5a69637
**Applied fix:** Replaced the combined `!response.ok || !response.body` guard with two separate checks. The `!response.ok` branch now reads the response body as JSON to extract an optional `error` field, then dispatches status-specific messages: 429 gets a rate-limit message, 401/403 get an authentication error message, and all other non-2xx statuses get a generic `AI service error (STATUS)` message with the detail appended. The `!response.body` check follows separately with the original connection-failure message.

### WR-02: Stale `streamingText` Causes Degradation Notice to Appear After Overlay Re-open

**Files modified:** `src/components/SidebarShell.tsx`
**Commit:** 8cec4ac
**Applied fix:** Implemented Option B (preferred) from the review. Four changes were made:
1. Added `"done"` to the `ContentState` type union.
2. Extended the `onOverlayShown` reset condition to include `"done"` alongside `"loading"`, `"streaming"`, and `"error"`, so re-opening the overlay after a completed response clears `streamingText` and returns to `"empty"`.
3. Added `setContentState("done")` at the end of `onDone` (after appending the exchange to session history), transitioning away from `"streaming"` to the new stable post-completion state.
4. Updated the degradation notice `Show` condition to use `contentState() === "done"` instead of `contentState() === "empty"`, and updated the `SessionFeed` visibility condition to include `"done"` so the feed remains visible after streaming completes.

## Skipped Issues

None.

---

_Fixed: 2026-04-12_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
