---
phase: 09-state-machine-conversation-continuity
reviewed: 2026-04-12T00:00:00Z
depth: standard
files_reviewed: 3
files_reviewed_list:
  - src/lib/ai.ts
  - src/components/SessionFeed.tsx
  - src/components/SidebarShell.tsx
findings:
  critical: 0
  warning: 2
  info: 3
  total: 5
status: issues_found
---

# Phase 09: Code Review Report

**Reviewed:** 2026-04-12
**Depth:** standard
**Files Reviewed:** 3
**Status:** issues_found

## Summary

Three files were reviewed covering the Phase 9 state-machine and conversation-continuity implementation: the AI streaming client (`ai.ts`), the session feed display component (`SessionFeed.tsx`), and the main sidebar orchestrator (`SidebarShell.tsx`).

The overall implementation is solid. The generation-counter guard against double-submit races is well-designed, the local accumulator pattern avoids signal read-lag in `onDone`, and the async listener registration with the `cancelled` flag correctly handles unmount races. Two warnings were found: one HTTP error-handling gap and one stale-state bug in the degradation notice display. Three info-level items cover console logging, missing finalization state transition, and unbounded prior-turn content size.

---

## Warnings

### WR-01: HTTP Error Responses Surface as Generic Connection Error

**File:** `src/lib/ai.ts:102-104`

**Issue:** When the Worker returns a non-2xx HTTP response (e.g., 429 rate-limit, 401 auth failure, 500 server error), the code returns the same generic message as a true network failure: `"Couldn't reach AI -- check your connection."` The status code and response body are never read. This makes rate-limiting, authentication errors, and server errors invisible to the caller and impossible to distinguish during debugging or future error telemetry.

**Fix:**
```typescript
if (!response.ok) {
  // Attempt to read error body for richer diagnostics
  let detail = "";
  try {
    const body = await response.json() as { error?: string };
    detail = body.error ? ` (${body.error})` : "";
  } catch { /* ignore parse failure */ }

  if (response.status === 429) {
    onError(`Rate limit reached -- please wait a moment and try again.${detail}`);
  } else if (response.status === 401 || response.status === 403) {
    onError(`Authentication error -- check your app token.${detail}`);
  } else {
    onError(`AI service error (${response.status})${detail} -- try again.`);
  }
  return;
}
if (!response.body) {
  onError("Couldn't reach AI -- check your connection.");
  return;
}
```

---

### WR-02: Stale `streamingText` Causes Degradation Notice to Appear After Overlay Re-open

**File:** `src/components/SidebarShell.tsx:118-122` and `557`

**Issue:** When streaming completes, `contentState` is left as `"streaming"` — it is never transitioned to a stable idle state post-completion. When the user re-opens the overlay without submitting a new query, `onOverlayShown` resets `contentState` to `"empty"` (line 119) but intentionally leaves `streamingText` and `lastIntent` untouched (per D-11). This creates a condition where the degradation notice display guard (line 557) evaluates as `true`:

```
contentState() === "empty"          // true — just reset by onOverlayShown
&& streamingText().length > 0       // true — stale from last completed response
&& currentTier() > 1               // true — tier is sticky across re-opens
```

The degradation notice ("You've done this before — showing hints") and its "Show full steps" button appear even though no active response is in progress, leading to a confusing and incorrect UI state.

**Fix:** Either clear `streamingText` when the overlay is re-opened (acceptable if the SessionFeed showing prior history makes the active text redundant), or introduce a distinct post-completion state (e.g., `"done"`) so the degradation notice condition can exclude the non-streaming idle case:

Option A — clear stale streaming text on overlay open (simpler):
```typescript
// In onOverlayShown handler, after the existing state resets:
if (["loading", "streaming", "error"].includes(contentState())) {
  setContentState("empty");
  setStreamingText("");       // already done
  abortController?.abort();
  abortController = null;
} else if (contentState() === "streaming") {
  // post-completion stale state — clear streaming text
  setStreamingText("");
}
```

Actually the simplest fix is to extend the reset guard to also catch the stale-streaming case by using a "done" content state set in `onDone`:

Option B — add `"done"` state (preferred, cleaner semantics):
```typescript
// In onDone callback after appending exchange:
setContentState("done");  // distinct from "streaming" and "empty"

// In onOverlayShown, extend the reset condition:
if (["loading", "streaming", "error", "done"].includes(contentState())) {
  setContentState("empty");
  setStreamingText("");
  ...
}

// Update ContentState type:
type ContentState = "empty" | "loading" | "streaming" | "done" | "error" | "listening" | "selecting";

// Update SessionFeed visibility (line 609) to include "done":
<Show when={!needsPermission() && (sessionHistory().length > 0 || contentState() === "streaming" || contentState() === "loading" || contentState() === "done")}>

// Update degradation notice (line 557) — "done" replaces "empty" for post-completion:
<Show when={!needsPermission() && currentTier() > 1 && (contentState() === "streaming" || contentState() === "done") && streamingText().length > 0}>
```

---

## Info

### IN-01: `console.error` in Production Code

**File:** `src/components/SessionFeed.tsx:23`, `src/components/SidebarShell.tsx:171`

**Issue:** `console.error("TTS playback failed:", err)` in `SessionFeed.tsx` fires in production builds unconditionally. In `SidebarShell.tsx` line 171, the STT error log is already guarded with `import.meta.env.DEV` — the TTS error log in SessionFeed is not.

**Fix:** Guard the SessionFeed TTS error log the same way as the STT error in SidebarShell:
```typescript
// SessionFeed.tsx line 23
if (import.meta.env.DEV) console.error("TTS playback failed:", err);
```

---

### IN-02: No Acknowledgment of Final `onDone` Path When Stream Ends Without `[DONE]`

**File:** `src/lib/ai.ts:153`

**Issue:** `onDone()` is called at line 153 after the `while` loop exits normally (stream closed by server without a `[DONE]` SSE marker). This is correct behavior as a fallback, but it is an undocumented code path. If the Worker ever sends `[DONE]` reliably, this line is dead code. If `[DONE]` is sometimes absent (e.g., Cloudflare Worker timeout truncates the stream), this line silently masks an incomplete response as successful completion.

**Fix:** Add a comment distinguishing normal completion from truncated stream, and consider whether the caller should distinguish them:
```typescript
  } // end while

  // Stream ended without explicit [DONE] marker.
  // This can happen if the Worker closes the connection cleanly after the last chunk
  // but before sending [DONE]. Treat as success — but if guidance is truncated in
  // production, add a `wasTruncated` flag to `onDone` to surface a notice.
  onDone();
}
```

---

### IN-03: Unbounded Prior-Turn Content Size in `conversationHistory`

**File:** `src/components/SidebarShell.tsx:261-264`

**Issue:** The `conversationHistory` array passed to `streamGuidance` includes the full `guidance` text for each prior exchange. With 3 turns capped, this could be 3 assistant responses of up to 4096 tokens each (the `max_tokens` limit). Sending ~12,000 tokens of history plus the current request's screenshot and intent could approach or exceed Claude's context window in edge cases, causing silent truncation or API errors.

**Fix:** Consider truncating each prior guidance string to a reasonable character limit (e.g., 2000 characters) before building `conversationHistory`:
```typescript
const MAX_HISTORY_CHARS = 2000;

const conversationHistory = sessionHistory().flatMap((exchange) => [
  { role: "user" as const, content: exchange.intent },
  {
    role: "assistant" as const,
    content: exchange.guidance.length > MAX_HISTORY_CHARS
      ? exchange.guidance.slice(0, MAX_HISTORY_CHARS) + "…"
      : exchange.guidance,
  },
]);
```

---

_Reviewed: 2026-04-12_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
