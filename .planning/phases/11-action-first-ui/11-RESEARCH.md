# Phase 11: Action-First UI — Research

**Researched:** 2026-04-13
**Domain:** SolidJS component authoring — overlay UI, state machine extension, preset AI triggers
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01: Immediate fire.** Tapping a button captures a fresh full-screen screenshot and calls `submitIntent()` with a preset prompt string. Guidance streams immediately — no text input step, no confirmation.
- **D-02: Always fresh screenshot.** Each button tap captures current screen state. No screenshot reuse. Consistent with how the existing text submit path works.
- **D-03: Four fixed labels** — Fix, Explain, Optimize, Ask.
  - `Fix` → preset prompt: `"Fix the issue shown in the screenshot"`
  - `Explain` → preset prompt: `"Explain what's happening in the screenshot"`
  - `Optimize` → preset prompt: `"How can I improve or optimize what's shown"`
  - `Ask` → special case: opens/focuses the text input for freeform entry (does not call submitIntent directly)
- **D-04: Empty state = buttons only.** When `lastIntent().length === 0`, the overlay shows the 4 quick action buttons as the primary content. The text input field is still present/accessible (below or de-emphasized) but is not the visual focus. Replaces the current blank input state.
- **D-05: Same 4 buttons, region screenshot substituted.** After the user draws a region box, the overlay sidebar shows the same Fix/Explain/Optimize/Ask buttons. Tapping any of them uses the region screenshot (not the full screen) as the visual context sent to Claude.
- **D-06: Buttons appear in overlay sidebar.** Region is captured, overlay focuses, buttons show in the same sidebar location as the empty-state buttons. No floating toolbar near the selection.
- **D-07: "Try another way" — Claude's discretion.** A "Try another way" button should appear after guidance completes. Re-runs the same intent with a modified prompt instructing Claude to suggest a meaningfully different approach.
- **D-08: Async AI context actions deferred / stretch goal.** Not in V1 plan.

### Claude's Discretion

- Button visual design (size, color, icon vs text-only, grid vs row layout)
- Exact placement of "Try another way" button within the guidance area
- Whether "Ask" button focuses existing text input or reveals a previously-hidden input
- Loading/streaming state while a quick action is firing (e.g., button disabled, spinner)
- Error handling if screenshot capture fails on button tap

### Deferred Ideas (OUT OF SCOPE)

- Async AI-suggested context actions (ACTN-04) — may add as stretch goal within this phase if fixed buttons are implemented quickly; otherwise Phase 12
- AI-suggested button labels based on active app (e.g., "Debug" when in VS Code, "Format" when in a text editor)
- Keyboard shortcuts for quick action buttons

</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ACTN-01 | When the overlay is open with no active query, user sees quick action buttons (Fix, Explain, Optimize, Ask) instead of a blank text prompt | `QuickActions` component slots into the `Show when={lastIntent().length === 0}` branch in SidebarShell, replacing `EmptyState` |
| ACTN-02 | After making a screen region selection, quick action buttons appear pre-filled for that selection — no typing required to trigger guidance | `onRegionSelected` already sets `selectedRegion()` and `thumbnailB64()`; `submitIntent()` already uses `selectedRegion()` to route to `captureRegion()` — buttons just call `submitIntent()` with preset strings |
| ACTN-03 | After receiving guidance, user can press "Try another way" to get a different approach without re-describing the task | `TryAnotherWay` component calls `submitIntent(lastIntent() + " — suggest a meaningfully different approach than before")`; shows when `contentState() === "done"` |
| ACTN-04 | Fixed action buttons render instantly (<100ms); AI-suggested context-specific actions append asynchronously without blocking interaction | Fixed buttons render synchronously with SolidJS JSX — no async path; async AI-suggested actions are DEFERRED per D-08 |

</phase_requirements>

---

## Summary

Phase 11 is a pure frontend change. No new Rust commands, no new IPC events, no new Tauri plugins required. The entire implementation is three things: (1) a new `QuickActions.tsx` component that replaces `EmptyState` in the `Show when={lastIntent().length === 0}` branch of `SidebarShell`, (2) a new `TryAnotherWay.tsx` component that appears below the active guidance when `contentState() === "done"`, and (3) minor wiring changes in `SidebarShell.tsx` to pass `disabled` state and expose `inputRef` focus to the new components.

The critical insight is that `submitIntent()` already handles everything the quick action buttons need: it checks `selectedRegion()` internally to decide between `captureRegion()` and `captureScreenshot()`, manages loading state, streams guidance, and records interactions. Buttons just call `submitIntent("preset string")`. No forking of the screenshot path is needed — region-aware behavior comes for free.

The "Try another way" button is a thin wrapper over the existing `handleRetry()` pattern: call `submitIntent()` with the last intent plus a prompt modifier suffix. New response replaces the current exchange (same behavior as `handleRetry()`).

**Primary recommendation:** Add `QuickActions.tsx` and `TryAnotherWay.tsx` as new components; wire them into `SidebarShell` at the two integration points identified below. No other files need changes except `SidebarShell.tsx`.

---

## Project Constraints (from CLAUDE.md)

These directives are enforced for Phase 11:

- **SolidJS only** — no React, no Svelte. All components are SolidJS functional components.
- **Inline style prop** — all styling uses SolidJS `style={{ ... }}`. No className, no CSS modules, no Tailwind. Confirmed pattern in `StepChecklist.tsx` and `SidebarShell.tsx`.
- **`var(--color-*)` tokens only** — no hardcoded hex values in component files. All colors from `src/styles/theme.css`.
- **`var(--space-*)` tokens only** — no hardcoded px in component files. All spacing from theme.
- **`lucide-solid`** — only icon library. Phase 11 components use no icons (text-only buttons per UI-SPEC).
- **No new Rust deps** — this phase adds no Cargo.toml entries.
- **No new IPC commands** — `submitIntent()` is already wired; `inputRef` focus is already managed in `SidebarShell`.

---

## Standard Stack

### Core (all already installed — no new packages)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| solid-js | ^1.9.3 | Component reactivity (`createSignal`, `Show`, `For`) | Project standard — confirmed in package.json [VERIFIED: package.json] |
| lucide-solid | ^1.8.0 | Icon library | Project standard — imported in SidebarShell, StepChecklist; Phase 11 uses no icons but library is available if needed [VERIFIED: package.json] |

**Installation:** No new packages required. [VERIFIED: codebase audit]

---

## Architecture Patterns

### Recommended Project Structure

```
src/components/
├── QuickActions.tsx      # NEW — 2×2 grid of preset action buttons
├── TryAnotherWay.tsx     # NEW — secondary inline "Try another way" text-button
├── SidebarShell.tsx      # MODIFIED — import + wire QuickActions and TryAnotherWay
└── EmptyState.tsx        # REPLACED (QuickActions supersedes EmptyState in the main branch)
```

EmptyState.tsx stays in repo (NoPermissionState is still used from the same file). Only the `EmptyState` named export becomes unused.

### Pattern 1: QuickActions Integration Point

**What:** Replace `<EmptyState />` in the `Show when={!needsPermission() && !permissionDenied() && contentState() === "empty" && sessionHistory().length === 0}` block with `<QuickActions>`.

**Current code (lines 688-690 in SidebarShell.tsx):**
```tsx
// Source: SidebarShell.tsx lines 688-690 [VERIFIED: codebase read]
<Show when={!needsPermission() && !permissionDenied() && contentState() === "empty" && sessionHistory().length === 0}>
  <EmptyState />
</Show>
```

**Target after Phase 11:**
```tsx
<Show when={!needsPermission() && !permissionDenied() && contentState() === "empty" && sessionHistory().length === 0}>
  <QuickActions
    onAction={(preset) => submitIntent(preset)}
    onAsk={() => inputRef?.focus()}
    disabled={contentState() === "loading" || contentState() === "streaming"}
  />
</Show>
```

Note: the `disabled` condition covers the unlikely case where a button fires while a prior call is in-flight. Normally `contentState() === "empty"` means no call is active — but using the prop lets `QuickActions` render consistently.

**When to use:** Anytime the empty-state branch needs to show quick actions instead of the old "Ready to help" placeholder.

### Pattern 2: TryAnotherWay Integration Point

**What:** Slot `<TryAnotherWay>` immediately below the `StepChecklist` / `RawGuidanceText` block, inside the `Show when={contentState() === "done"}` wrapper. [VERIFIED: SidebarShell.tsx lines 775-797]

**Current structure (SidebarShell.tsx lines 775-797):**
```tsx
// Source: SidebarShell.tsx lines 775-797 [VERIFIED: codebase read]
<Show when={contentState() === "done"}>
  {steps().length > 0 && !isClarifyingQuestion(steps())
    ? <StepChecklist ... />
    : <RawGuidanceText ... />
  }
</Show>
```

**Target after Phase 11:**
```tsx
<Show when={contentState() === "done"}>
  {steps().length > 0 && !isClarifyingQuestion(steps())
    ? <StepChecklist ... />
    : <RawGuidanceText ... />
  }
  <TryAnotherWay
    onRetry={() => {
      const modified = lastIntent() + " \u2014 suggest a meaningfully different approach than before";
      submitIntent(modified);
    }}
    disabled={false}
  />
</Show>
```

`TryAnotherWay` disappears during loading automatically because `contentState()` transitions to `"loading"` and the outer `Show when={contentState() === "done"}` hides it.

### Pattern 3: Disabled State Propagation

**What:** When a quick action fires, `submitIntent()` calls `setContentState("loading")` synchronously before any await. The `QuickActions` component must become non-interactive within 100ms (ACTN-04).

**Implementation:** Pass `disabled` as a prop. Inside `QuickActions`, apply `opacity: 0.5; pointer-events: none` and `aria-disabled="true"` when `disabled` is true.

The `disabled` prop is derived from SidebarShell's `contentState()` signal: `disabled={contentState() === "loading" || contentState() === "streaming"}`. Because `setContentState("loading")` is called synchronously at the top of `submitIntent()`, the state update reaches the component in the same microtask before any `await`.

**SolidJS reactivity note:** SolidJS signals are synchronous — a `setContentState("loading")` call immediately notifies all subscribers. The component re-renders before the first `await captureScreenshot()` returns. [ASSUMED — standard SolidJS behavior from training; consistent with existing codebase patterns observed in `onToken` handler]

### Pattern 4: "Ask" Button — inputRef Focus

**What:** The "Ask" button calls `onAsk()` which focuses the text input. `inputRef` is already defined and managed in `SidebarShell`. Pass `() => inputRef?.focus()` as the `onAsk` prop.

**Existing wiring (SidebarShell.tsx line 91 and 920-930):**
```tsx
// Source: SidebarShell.tsx line 91, lines 920-930 [VERIFIED: codebase read]
let inputRef: HTMLInputElement | undefined;
// ...
<TextInput
  ref={(el) => { inputRef = el; }}
  ...
/>
```

`inputRef` is a mutable variable (not a signal) — it holds the DOM element. `() => inputRef?.focus()` is safe to pass as a callback.

### Pattern 5: Region Screenshot — No New Wiring Needed

**What:** `submitIntent()` already reads `selectedRegion()` internally (lines 326-338 of SidebarShell.tsx) and calls either `captureRegion(region)` or `captureScreenshot()` based on whether a region is set.

After the user draws a region, `onRegionSelected` fires, which calls `setSelectedRegion(coords)` and `setThumbnailB64(b64)`. The overlay returns to `contentState() === "empty"`. The QuickActions grid is then visible (because `lastIntent().length === 0`). When a button fires `submitIntent("preset")`, the function reads the stored `selectedRegion()` and routes to `captureRegion()` automatically.

**No new screenshot path needed.** The region-aware behavior is already in `submitIntent()`. [VERIFIED: SidebarShell.tsx lines 323-342]

### Anti-Patterns to Avoid

- **Don't fork submitIntent for region vs full-screen** — `submitIntent()` already handles the routing internally. Adding a separate `submitIntentWithRegion()` would duplicate logic and risk divergence.
- **Don't call captureScreenshot() directly in QuickActions** — all screenshot capture must go through `submitIntent()` to ensure loading state, generation counter, and abort controller are managed correctly.
- **Don't use className or CSS class strings** — existing codebase uses inline `style` prop throughout. Using className would require a CSS file import and break the established pattern.
- **Don't hardcode hex colors** — all colors must be `var(--color-*)` tokens. The accent color for "Ask" button border is `color-mix(in srgb, var(--color-accent) 40%, transparent)` (with rgba fallback for browsers that don't support color-mix).
- **Don't hide the text input** — per D-04, the text input remains visible and accessible below the button grid. `QuickActions` renders above it, not instead of it. The `Show when={lastIntent().length === 0}` block that wraps `EmptyState` is in the scrollable content area; the text input is in the separate `sidebar-input-area` div at the bottom (lines 842-931).

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Disabled button state during AI call | Custom loading flag signal in QuickActions | Pass `disabled` prop from SidebarShell `contentState()` | State already exists in parent; duplicating it in child causes sync bugs |
| "Try another way" prompt variation | New AI endpoint or prompt strategy | Append suffix to `lastIntent()` before calling `submitIntent()` | `submitIntent()` already handles everything; suffix approach mirrors `handleShowFullSteps()` pattern |
| Region-aware button clicks | Fork of screenshot logic | Call `submitIntent(preset)` — it reads `selectedRegion()` internally | `submitIntent()` already handles region vs full-screen routing |
| Hover color transitions | JavaScript `onMouseEnter`/`onMouseLeave` handlers | CSS `transition: var(--transition-fast)` + hover via SolidJS inline pseudo-class workaround | Existing pattern in SidebarShell uses `onMouseEnter`/`onMouseLeave` for hover — match that pattern |

**Key insight:** `submitIntent()` is a complete pipeline entry point. Quick action buttons are just callers of this function with preset strings. No new pipeline logic is needed.

---

## Common Pitfalls

### Pitfall 1: QuickActions shows when it shouldn't after session history exists

**What goes wrong:** `QuickActions` appears over session history when user returns to empty state mid-session.

**Why it happens:** The Show condition `contentState() === "empty" && sessionHistory().length === 0` correctly guards against this, but if a developer changes the condition to just `contentState() === "empty"`, the buttons appear over collapsed history rows.

**How to avoid:** Keep both conditions: `contentState() === "empty" && sessionHistory().length === 0`. This matches the existing `EmptyState` guard (SidebarShell.tsx line 688). [VERIFIED: codebase read]

**Warning signs:** During testing, if you see the 4 buttons appearing above collapsed history rows, the session guard is missing.

### Pitfall 2: "Try another way" prompt leaks into subsequent calls

**What goes wrong:** The modified prompt `"Fix the issue shown... — suggest a meaningfully different approach"` is stored in `lastIntent()` and becomes the base for follow-up calls.

**Why it happens:** `submitIntent(modified)` calls `setLastIntent(intent)` where `intent` is the modified string. The next "Try another way" tap appends the suffix again, creating a compound string.

**How to avoid:** Two options:
1. **Simple:** Always append to the original `lastIntent()` — read it at call time, don't modify `lastIntent`. The modified string is passed as the `intent` arg to `submitIntent` but `setLastIntent` inside `submitIntent` will update `lastIntent()` to the modified string. Subsequent "Try another way" taps will compound. Prefer option 2.
2. **Clean:** Store the original intent separately in `TryAnotherWay`'s closure. In SidebarShell, pass `onRetry` as `() => submitIntent(lastIntent() + suffix)` — but capture the base intent before the suffix is set. Since `lastIntent()` is reactive, reading it inside the closure at tap-time may already include the suffix. The safest approach: strip a known suffix before appending again, or track a separate `baseIntent` signal.

**Recommended implementation:** In `SidebarShell`, define:
```tsx
const TRY_ANOTHER_SUFFIX = " \u2014 suggest a meaningfully different approach than before";
const handleTryAnotherWay = () => {
  // Strip prior suffix if present to avoid compounding
  const base = lastIntent().replace(TRY_ANOTHER_SUFFIX, "");
  submitIntent(base + TRY_ANOTHER_SUFFIX);
};
```

**Warning signs:** If you see double-suffixed prompts in network logs, the compound problem has occurred.

### Pitfall 3: disabled state not propagating before screenshot capture

**What goes wrong:** User taps Fix, screenshot starts capturing, but buttons remain clickable for 50-200ms — user double-taps, two AI calls fire.

**Why it happens:** If `disabled` is derived from an async condition rather than the synchronous `setContentState("loading")` call at the top of `submitIntent()`.

**How to avoid:** `setContentState("loading")` is the first synchronous operation in `submitIntent()` (before any `await`). SolidJS propagates the signal synchronously. As long as `disabled` is derived from `contentState() === "loading"`, the update reaches `QuickActions` before the first `await` returns. The existing generation counter (`submitGen`) also prevents double-submit races (WR-01 pattern already in codebase). [VERIFIED: SidebarShell.tsx lines 259-289]

**Warning signs:** If you see two AI calls fire from one button tap, check that `disabled` is derived from `contentState()` not from a separate local signal.

### Pitfall 4: "Ask" button hides QuickActions grid prematurely

**What goes wrong:** Tapping "Ask" calls `inputRef.focus()`. The user sees the cursor in the text input but the QuickActions grid disappears because some condition changes.

**Why it happens:** Only if `onAsk` is incorrectly implemented to set `lastIntent()` or change `contentState()`.

**How to avoid:** `onAsk` must only call `inputRef?.focus()` — nothing else. The grid disappears naturally only when `lastIntent().length > 0` (after the user actually submits text via `handleSubmit`). [VERIFIED: CONTEXT.md D-03, UI-SPEC interaction contract]

### Pitfall 5: color-mix() not supported in older WebKit

**What goes wrong:** "Ask" button border uses `color-mix(in srgb, var(--color-accent) 40%, transparent)` — this may not render in older macOS WebKit.

**Why it happens:** `color-mix()` requires Safari 15.4+ / Chrome 111+. Tauri v2 uses the system WebKit on macOS, which is Safari 18+ on macOS Sequoia/Sonoma. Should be safe for the target platform.

**How to avoid:** Include an explicit rgba fallback comment in the component. If tested on older macOS, swap to `rgba(0,122,255,0.40)` (light) / `rgba(10,132,255,0.40)` (dark). [ASSUMED — WebKit version tied to macOS version; Safari 18 ships with macOS 15 Sequoia]

---

## Code Examples

Verified patterns from the codebase:

### SolidJS inline style with CSS variables (established pattern)
```tsx
// Source: SidebarShell.tsx lines 499-519 [VERIFIED: codebase read]
<button
  style={{
    border: "none",
    background: "transparent",
    color: "var(--color-text-secondary)",
    cursor: "pointer",
    "min-height": "44px",
    "min-width": "44px",
    display: "flex",
    "align-items": "center",
    "justify-content": "center",
    padding: "0",
  }}
>
```

### Hover via onMouseEnter/onMouseLeave (established pattern)
```tsx
// Source: SidebarShell.tsx lines 576-583 [VERIFIED: codebase read]
onMouseEnter={(e) => {
  (e.currentTarget as HTMLButtonElement).style.color = "var(--color-text-primary)";
}}
onMouseLeave={(e) => {
  (e.currentTarget as HTMLButtonElement).style.color = "var(--color-text-secondary)";
}}
```

### submitIntent call (the entry point for quick actions)
```tsx
// Source: SidebarShell.tsx line 422-424 [VERIFIED: codebase read]
const handleSubmit = (text: string) => {
  submitIntent(text);
};
// Quick action buttons call the same function with a preset string:
// submitIntent("Fix the issue shown in the screenshot")
```

### Show conditional (empty state guard)
```tsx
// Source: SidebarShell.tsx line 688 [VERIFIED: codebase read]
<Show when={!needsPermission() && !permissionDenied() && contentState() === "empty" && sessionHistory().length === 0}>
  <EmptyState />  // Phase 11: replace with <QuickActions ... />
</Show>
```

### inputRef focus (for "Ask" button)
```tsx
// Source: SidebarShell.tsx lines 91, 143-144 [VERIFIED: codebase read]
let inputRef: HTMLInputElement | undefined;
// ...
if (inputRef && !needsPermission()) {
  inputRef.focus();
}
// "Ask" onAsk callback: () => inputRef?.focus()
```

### QuickActions props interface (from UI-SPEC)
```tsx
// Source: 11-UI-SPEC.md [VERIFIED: file read]
interface QuickActionsProps {
  onAction: (preset: string) => void;  // Fix/Explain/Optimize → submitIntent(preset)
  onAsk: () => void;                   // Ask → inputRef?.focus()
  disabled?: boolean;                  // true while contentState === "loading" | "streaming"
}
```

### TryAnotherWay props interface (from UI-SPEC)
```tsx
// Source: 11-UI-SPEC.md [VERIFIED: file read]
interface TryAnotherWayProps {
  onRetry: () => void;  // submitIntent(lastIntent() + suffix)
  disabled?: boolean;
}
```

### QuickActions grid layout (from UI-SPEC)
```tsx
// Source: 11-UI-SPEC.md [VERIFIED: file read]
// Container: 2×2 grid, gap --space-sm, padding --space-md
style={{
  display: "grid",
  "grid-template-columns": "1fr 1fr",
  gap: "var(--space-sm)",
  padding: "var(--space-md)",
}}
// Button: min-height 44px, border-radius --radius-md, background --color-surface-secondary
// "Ask" button gets accent border: border: "1px solid color-mix(in srgb, var(--color-accent) 40%, transparent)"
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `EmptyState` — icon + heading + body copy as idle screen | `QuickActions` — 4 action buttons as idle screen | Phase 11 | Idle state becomes interactive; zero-typing path to AI guidance |
| User always types intent | User taps preset OR types | Phase 11 | Reduces friction for common operations |
| No post-guidance action | "Try another way" inline button | Phase 11 | User can iterate without re-describing task |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | SolidJS signals propagate synchronously — `setContentState("loading")` in `submitIntent()` reaches `QuickActions` disabled prop before first `await` | Architecture Patterns, Pitfall 3 | If async, buttons stay clickable for up to one event loop tick — low risk given existing WR-01 generation counter |
| A2 | `color-mix()` in `srgb` color space is supported by the WebKit version shipping with target macOS (Sequoia / Sonoma) | Pitfall 5 | "Ask" button border may not render; fallback to rgba resolves this |
| A3 | `handleRetry()` behavior (replace, not stack) is the desired behavior for "Try another way" | Architecture Patterns Pattern 2 | If user expects responses to stack, the UX would be wrong — but D-07 in CONTEXT.md confirms replace behavior |

**If this table is empty:** All claims in this research were verified or cited — no user confirmation needed.
All three items above are low-risk assumptions with clear fallbacks.

---

## Open Questions

1. **Should EmptyState.tsx be deleted or kept?**
   - What we know: `EmptyState` (the named export) is only used in one place in `SidebarShell`. `NoPermissionState` (the other named export in the same file) is still used.
   - What's unclear: Whether to keep the file and leave `EmptyState` export unused, or delete the export.
   - Recommendation: Keep `EmptyState.tsx` unchanged. Remove the `import { EmptyState, NoPermissionState }` from SidebarShell and re-import only `NoPermissionState`. Simpler than deleting lines inside the file.

2. **Does "Try another way" show when the guidance was a clarifying question?**
   - What we know: `isClarifyingQuestion(steps())` is checked in the done state. When true, `RawGuidanceText` renders instead of `StepChecklist`.
   - What's unclear: Whether "Try another way" makes sense after a clarifying question (the user hasn't answered it yet).
   - Recommendation: Show `TryAnotherWay` regardless — it's inside `Show when={contentState() === "done"}` which already covers both cases. The prompt suffix "suggest a meaningfully different approach" will prompt Claude to ask differently or give steps instead. Acceptable UX.

---

## Environment Availability

Step 2.6: SKIPPED — Phase 11 is a pure frontend (SolidJS TypeScript) change with no new external tool dependencies. All required runtimes (Node, npm, Vite, Tauri CLI) are already in use by the project.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.4 |
| Config file | `vitest.config.ts` (root) — `include: ["src/**/*.test.ts"]`, `environment: "node"` |
| Quick run command | `npm test` (runs `vitest run`) |
| Full suite command | `npm test` (same — only one suite currently) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ACTN-01 | QuickActions renders 4 buttons when `lastIntent().length === 0` | Unit (pure function) | `npm test` | ❌ Wave 0 — `src/lib/quickActions.test.ts` or manual UAT |
| ACTN-02 | submitIntent uses selectedRegion when set | Unit (existing path, no new test needed) | `npm test` | ✅ Covered implicitly by submitIntent behavior (no isolated test) |
| ACTN-03 | "Try another way" prompt suffix appended correctly | Unit | `npm test` | ❌ Wave 0 — test string construction logic |
| ACTN-04 | Buttons render synchronously (<100ms) | Manual UAT | n/a | Manual only — Vitest runs in node, no DOM |

**Note:** The existing test suite runs in `environment: "node"` (not jsdom). SolidJS component rendering tests are not currently part of the test suite — the pattern in `parseSteps.test.ts` is pure function testing. Quick action preset strings and the "Try another way" suffix logic are pure string operations and can be unit tested. Component rendering is validated via manual UAT.

### Sampling Rate

- **Per task commit:** `npm test`
- **Per wave merge:** `npm test`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `src/lib/quickActionPresets.ts` — extract preset strings as exportable constants so they can be unit tested
- [ ] `src/lib/quickActionPresets.test.ts` — verify preset strings match D-03 exactly, verify suffix strips and re-appends without compounding

*(If extracting presets to a separate file is not desired, the test gap is acceptable — preset strings are simple constants that are easy to verify in UAT)*

---

## Security Domain

> `security_enforcement` is not set in `.planning/config.json` — treating as enabled.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | n/a — no auth in overlay UI |
| V3 Session Management | no | n/a — session is in-memory signal, no persistence |
| V4 Access Control | no | n/a — single-user desktop app |
| V5 Input Validation | yes (low risk) | Preset strings are hardcoded constants — no user input injected into preset text. "Try another way" appends a known suffix to `lastIntent()` which is already sanitized by the AI layer. No injection risk. |
| V6 Cryptography | no | n/a |

### Known Threat Patterns for this phase

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Preset prompt injection | Tampering | Not applicable — preset strings are hardcoded in source, not configurable by user |
| Double-submit race | Denial of Service (accidental) | Already mitigated by WR-01 generation counter in `submitIntent()` and `disabled` prop on buttons |

**Security verdict:** This phase introduces no new security surface. Preset prompt strings are compile-time constants. The AI call path is unchanged.

---

## Sources

### Primary (HIGH confidence)
- `src/components/SidebarShell.tsx` — full component read; all integration points verified line-by-line
- `src/components/EmptyState.tsx` — current component to be replaced
- `src/lib/tauri.ts` — `captureScreenshot`, `captureRegion`, `onRegionSelected` signatures verified
- `src/lib/ai.ts` — `streamGuidance` interface and `SYSTEM_PROMPT` verified
- `src/styles/theme.css` — all design tokens verified
- `.planning/phases/11-action-first-ui/11-CONTEXT.md` — all decisions verified
- `.planning/phases/11-action-first-ui/11-UI-SPEC.md` — component specs verified
- `vitest.config.ts`, `package.json` — test infrastructure verified

### Secondary (MEDIUM confidence)
- SolidJS signal synchronous propagation — consistent with observed codebase patterns and SolidJS design (fine-grained reactivity); not explicitly verified against SolidJS docs in this session [ASSUMED from A1]

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all packages already in project; no new installs
- Architecture: HIGH — integration points verified by reading actual source lines
- Pitfalls: HIGH — identified from direct reading of `submitIntent()`, `handleRetry()`, and state machine logic
- Security: HIGH — phase adds no new surface

**Research date:** 2026-04-13
**Valid until:** 2026-05-13 (stable SolidJS/Tauri stack; no external dependency changes expected)
