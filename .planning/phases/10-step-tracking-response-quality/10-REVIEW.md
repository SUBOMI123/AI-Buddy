---
phase: 10-step-tracking-response-quality
reviewed: 2026-04-12T00:00:00Z
depth: standard
files_reviewed: 8
files_reviewed_list:
  - src/components/RawGuidanceText.tsx
  - src/components/SidebarShell.tsx
  - src/components/StepChecklist.tsx
  - src/lib/ai.ts
  - src/lib/parseSteps.test.ts
  - src/lib/parseSteps.ts
  - vitest.config.ts
  - package.json
findings:
  critical: 0
  warning: 3
  info: 3
  total: 6
status: issues_found
---

# Phase 10: Code Review Report

**Reviewed:** 2026-04-12
**Depth:** standard
**Files Reviewed:** 8
**Status:** issues_found

## Summary

Phase 10 introduces step parsing (`parseSteps.ts`), the `StepChecklist` component, the `RawGuidanceText` fallback, and wires them into `SidebarShell`. The core architecture is sound: post-stream parsing with a compliance check, a clean fallback path, and correct sequencing of state transitions (`setCurrentExchange` before `setContentState("done")`).

Three warnings stand out: the `package.json` is missing a `test` script so tests cannot be run via the standard `npm test` / CI invocation; `parseSteps` has a loose compliance check that can produce a silent empty-parse edge case; and the deprecated `execCommand` fallback in `copyToClipboard` silently ignores failure. Three info items cover a hardcoded dev URL default, dead signal state, and a misleading test comment.

No critical issues were found.

---

## Warnings

### WR-01: `npm test` is not wired up — tests cannot run via CI or standard tooling

**File:** `package.json:6-11`
**Issue:** `vitest` is installed as a dev dependency and tests exist in `src/lib/parseSteps.test.ts`, but there is no `"test"` entry in the `scripts` object. Running `npm test` produces an error; CI pipelines that invoke `npm test` will silently skip all tests.
**Fix:**
```json
"scripts": {
  "start": "vite",
  "dev": "vite",
  "build": "vite build",
  "serve": "vite preview",
  "tauri": "tauri",
  "test": "vitest run",
  "test:watch": "vitest"
}
```

---

### WR-02: `parseSteps` compliance check passes for `"1."` with no label text, producing silent empty result

**File:** `src/lib/parseSteps.ts:23`
**Issue:** The compliance check is `text.trimStart().startsWith("1.")`. This passes for inputs like `"1.\n2. Do something"` — the `"1."` line clears the compliance gate but itself does not match `/^\d+\.\s+(.+)$/` (no text after the dot). Step 2 matches and a result is returned with only one item. This is a correctness gap when Claude emits a numbered intro line with no body text on the first step.

More importantly, the check also passes for `"1.Click"` (no space after dot), which then yields zero matches from the regex, triggering RawGuidanceText for text that is actually a numbered list — a silent fallback the user sees as plain text instead of a checklist.

**Fix:** Tighten the compliance check to require at least a space after `"1."`, matching the extraction regex contract:
```ts
if (!text.trimStart().startsWith("1. ")) return [];
```
This is a one-character change that makes the gate consistent with `/^\d+\.\s+(.+)$/`.

---

### WR-03: `copyToClipboard` fallback silently ignores `execCommand` return value

**File:** `src/components/StepChecklist.tsx:26-29`
**Issue:** `document.execCommand("copy")` returns `false` when the operation fails (e.g., no text selected, document not focused). The return value is not checked; failure is completely silent. While the comment documents "silent fail if both paths error" as intentional (D-09), the `execCommand` fallback is also entirely silently failing on the primary `catch` path — the outer `try` block catches the `navigator.clipboard` failure and the fallback runs, but the `execCommand` result is discarded. A user clicking "Copy" with a background window gets no feedback at all.

Additionally, `document.execCommand` is deprecated and may be removed in future browsers/WebViews.

**Fix (minimal):** Log in DEV mode and/or note the explicit discard:
```ts
} catch {
  const el = document.createElement("textarea");
  el.value = text;
  el.style.position = "fixed";
  el.style.opacity = "0";
  document.body.appendChild(el);
  el.select();
  const ok = document.execCommand("copy"); // deprecated but kept as fallback
  document.body.removeChild(el);
  if (!ok && import.meta.env.DEV) {
    console.warn("copyToClipboard: execCommand fallback also failed");
  }
}
```
For production, a brief visual "Copied!" confirmation would cover both failure modes gracefully.

---

## Info

### IN-01: Hardcoded `localhost:8787` fallback in production source

**File:** `src/lib/ai.ts:1`
**Issue:** `const WORKER_URL = import.meta.env.VITE_WORKER_URL || "http://localhost:8787";` ships a localhost fallback as the default. If `VITE_WORKER_URL` is absent from a production build environment (e.g., forgotten in CI secrets), all API calls silently hit localhost and fail with a generic connection error. The hardcoded string is not a secret, but it is a silent misconfiguration vector.
**Fix:** Fail loudly in non-development builds when the variable is absent:
```ts
const WORKER_URL =
  import.meta.env.VITE_WORKER_URL ??
  (import.meta.env.DEV ? "http://localhost:8787" : (() => {
    throw new Error("VITE_WORKER_URL must be set in production builds");
  })());
```

---

### IN-02: Dead signal getter — `_showFullStepsOverride` read accessor is never used

**File:** `src/components/SidebarShell.tsx:68`
**Issue:** `const [_showFullStepsOverride, setShowFullStepsOverride] = createSignal(false);` — only the setter is used (lines 302, 426). The getter is prefixed `_` acknowledging it is unused. This is dead state that adds no reactivity; the signal can be replaced with a plain `let` boolean or removed entirely if the getter is not needed by any planned JSX.
**Fix:** Replace with a plain mutable variable since the value is only used imperatively:
```ts
let showFullStepsOverride = false;
// where setShowFullStepsOverride(val) was called:
showFullStepsOverride = false;  // line 302
showFullStepsOverride = true;   // line 426
```
Or remove the flag entirely if it has no pending JSX consumer.

---

### IN-03: Misleading test comment in `parseSteps.test.ts`

**File:** `src/lib/parseSteps.test.ts:49`
**Issue:** The comment reads `"1." line itself doesn't match /^\d+\.\s+(.+)$/ (no text after the space)`. The actual input is `"1.\n..."` — there is no space at all after the dot, so the comment's parenthetical explanation is inaccurate. The test itself is correct and covers a valid edge case; only the inline comment is misleading.
**Fix:** Update the comment:
```ts
// "1." line itself doesn't match /^\d+\.\s+(.+)$/ — no space or text after the dot
```

---

_Reviewed: 2026-04-12_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
