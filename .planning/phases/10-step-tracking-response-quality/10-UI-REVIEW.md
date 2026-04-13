---
phase: 10
slug: step-tracking-response-quality
type: ui-review
audited: 2026-04-13
baseline: UI-SPEC.md (approved contract)
screenshots: not captured (no dev server running)
---

# Phase 10 — UI Review

**Audited:** 2026-04-13
**Baseline:** UI-SPEC.md (10-UI-SPEC.md design contract)
**Screenshots:** Not captured — no dev server detected on ports 3000, 5173, 8080. Code-only audit.

---

## Pillar Scores

| Pillar | Score | Key Finding |
|--------|-------|-------------|
| 1. Copywriting | 3/4 | Spec requires silent copy success; "Copied!" text label implemented instead |
| 2. Visuals | 3/4 | Step number indicator added beyond spec; copy button hover has no differentiated state |
| 3. Color | 2/4 | Accent left-border stripe removed from current step (replaced with tinted bg only); copy button color is primary instead of secondary |
| 4. Typography | 3/4 | Two hardcoded sizes (11px, 10px) outside token system; one undeclared weight (500) |
| 5. Spacing | 4/4 | All spacing uses declared tokens; min-height 44px exceptions are spec-correct |
| 6. Experience Design | 4/4 | Full state coverage: loading, streaming, done, error, empty, STT error all handled |

**Overall: 19/24**

---

## Top 3 Priority Fixes

1. **Accent left-border removed from current step** — Users lose the primary visual affordance distinguishing the active step from the rest. The spec defines `3px solid var(--color-accent)` on the current step row as the highlight mechanism; the implementation replaced it entirely with `var(--color-step-current)` background tint only. Fix: restore `border-left: isCurrent() ? "3px solid var(--color-accent)" : "3px solid transparent"` in `StepChecklist.tsx` line 82. The background tint (`--color-step-current`) can remain alongside the border as a layered visual.

2. **Copy button icon color is primary, not secondary** — The spec (UI-SPEC.md Component Inventory, copy button row) declares `Icon color: var(--color-text-secondary)` and `Hover icon color: var(--color-text-primary)`. The implementation sets the initial color to `var(--color-text-primary)` at line 164 and both `onMouseEnter` and `onMouseLeave` handlers also set `color-text-primary`. The idle state icon bleeds too much visual weight. Fix: change line 164 to `color: "var(--color-text-secondary)"` and update `onMouseLeave` to reset to `var(--color-text-secondary)`.

3. **"Copied!" feedback text not in spec contract** — The Copywriting Contract (UI-SPEC.md) states "No visual feedback on copy success in Phase 10 scope (silent success; silent fail per D-09). Deferred: success flash/checkmark state." The implementation renders a "Copied!" label in accent color (11px, weight 600) for 1500ms after a successful copy. This is a scope violation and introduces two undeclared typography values (11px size, 600 weight via literal rather than `--font-weight-semibold`). Fix: remove the `copiedIndex` signal and the `Show when={copiedIndex() === index()}` block; always render `<Clipboard size={14} />`.

---

## Detailed Findings

### Pillar 1: Copywriting (3/4)

**What matches the spec:**
- Empty state: "Ready to help" heading + "Ask me anything about what's on your screen. I'll guide you step by step." — exact match to UI-SPEC.md Copywriting Contract.
- Error state: `{errorMessage()}` + "Retry" button — matches spec pattern.
- STT error: "Didn't catch that — try again" — functional, matches intent.
- `aria-label="Step checklist"` — exact spec match (StepChecklist.tsx line 58).
- `aria-label="Step N: [label text]"` format — exact match (StepChecklist.tsx line 76).
- `aria-label="Copy command"` — exact match (StepChecklist.tsx line 153).
- RawGuidanceText has no label or caption — matches spec "No label, no caption — raw guidance lines only".

**Deviations:**
- `src/components/StepChecklist.tsx:190` — "Copied!" feedback text is rendered on successful clipboard write. UI-SPEC.md Copywriting Contract and D-09 both explicitly state silent success with no feedback in Phase 10. This is a scope violation.
- No "Copy code block" aria-label variant is implemented — only `aria-label="Copy command"` exists. The spec Copywriting Contract defines both `"Copy code block"` (for code fences) and `"Copy command"` (for command lines) as separate values. Since code fences cannot appear inside single-line step labels (as noted in a StepChecklist.tsx comment), this is a near-non-issue functionally, but technically diverges from the spec. Informational finding only.

---

### Pillar 2: Visuals (3/4)

**What matches the spec:**
- `Check` icon (lucide-solid, size 16) for completed steps — correct.
- `Square` icon (lucide-solid, size 16) for uncompleted steps — correct.
- `Clipboard` icon (lucide-solid, size 14) for copy button — correct.
- `aria-live="polite"` on checklist container — correct.
- Layout order: SessionFeed → StepChecklist/RawGuidanceText → input bar — correct per D-06.
- StepChecklist shown only when `contentState() === "done"` — correct gate.

**Deviations:**
- `src/components/StepChecklist.tsx:97–108` — A visible step number (`{index() + 1}`) is rendered before the icon as a separate `<span>`. This is a UAT-driven addition not present in the UI-SPEC component table. The spec shows the row layout as: `[icon] [label] [copy button]`. The extra number column is additive (not breaking) but was not designed or contracted.
- The copy button hover state has no color differentiation: both `onMouseEnter` and `onMouseLeave` set the same `var(--color-text-primary)`. The UI-SPEC specifies that hover should show `var(--color-text-primary)` and idle should show `var(--color-text-secondary)`. Since idle color is also currently `var(--color-text-primary)`, the hover state is effectively a no-op visually.

---

### Pillar 3: Color (2/4)

**Accent usage audit:**
- `src/components/StepChecklist.tsx:186` — `var(--color-accent)` on "Copied!" text (out-of-spec element).
- `src/components/SidebarShell.tsx:672` — `var(--color-accent)` on "Show full steps" inline link — pre-existing Phase 9 usage, valid.
- `src/components/SidebarShell.tsx:826` — `var(--color-accent)` on "Retry" button — pre-existing Phase 9 usage, valid.

**Critical deviation:**
- `src/components/StepChecklist.tsx:82` — `"border-left": "3px solid transparent"` is applied unconditionally to ALL step rows. The comment reads "no accent bar (260413-1kn)". The UI-SPEC Color section declares: `Accent (10%): Current step left-border stripe only` and the Component Inventory specifies `Left border: 3px solid var(--color-accent)` on current step rows. The current step highlight is now achieved solely via `var(--color-step-current)` background tint. This deviates from the contracted color split (accent usage).
- `src/components/StepChecklist.tsx:164` — Copy button initial `color` is `var(--color-text-primary)`. Spec declares `Icon color: var(--color-text-secondary)` for the idle copy button state.
- `src/styles/theme.css:48,61` — `--color-step-current` token exists in theme.css (rgba tint of accent at 10-15% opacity). This is not listed in the UI-SPEC Color table (which lists Dominant, Secondary, Accent, Text primary, Text secondary, Destructive, Border). This is a token that was added post-spec. Not a hard violation since it derives from accent, but it is undocumented.

**No hardcoded hex/rgb values found** in Phase 10 components — all colors reference CSS custom properties. This is a clean pass on that check.

---

### Pillar 4: Typography (3/4)

**Token usage — correct:**
- `var(--font-size-body)` / `var(--font-weight-regular)` / `var(--line-height-body)` — used correctly on step labels (StepChecklist.tsx lines 130–131), step number span (line 100), RawGuidanceText paragraphs (RawGuidanceText.tsx lines 26–28).
- `var(--font-size-label)` — used on history row summaries and degradation notice.
- `var(--font-weight-semibold)` — not referenced directly in new Phase 10 components; pre-existing usage in EmptyState is correct.

**Violations:**
- `src/components/StepChecklist.tsx:184` — `"font-size": "11px"` — hardcoded outside the token system. Not declared in the UI-SPEC typography table or theme.css. Used for the "Copied!" label (which itself is a scope violation).
- `src/components/StepChecklist.tsx:185` — `"font-weight": "600"` — hardcoded instead of `var(--font-weight-semibold)`. Minor hygiene issue regardless of the "Copied!" scope violation.
- `src/components/SidebarShell.tsx:544` — `"font-weight": "500"` — hardcoded weight (medium) not present in theme.css or declared in UI-SPEC. Applied to the task header label (`taskTitle` / "Working on: ..."). This is a Phase 9 carryover element modified in Phase 10 (taskTitle display). The weight 500 is between `--font-weight-regular` (400) and `--font-weight-semibold` (600); neither matches.
- `src/components/SidebarShell.tsx:748` — `"font-size": "10px"` — hardcoded, used for the expand/collapse chevron character in collapsible history rows. Below the declared token minimum of 12px label size.

**Typography token distribution in Phase 10 files:** 2 declared token sizes (body 14px, label 12px) plus 2 undeclared hardcoded sizes (11px, 10px). The 4-size ceiling is met by declared tokens alone; the hardcoded sizes are the issue.

---

### Pillar 5: Spacing (4/4)

All Phase 10 components use declared spacing tokens without exception:

- `StepChecklist.tsx:84` — `padding: "var(--space-sm) var(--space-md)"` — matches spec (8px 16px).
- `StepChecklist.tsx:87` — `gap: "var(--space-sm)"` — matches spec.
- `StepChecklist.tsx:163` — `margin-left: "var(--space-xs)"` — matches spec (4px copy button gap).
- `RawGuidanceText.tsx:16` — `gap: "var(--space-sm)"` — matches spec (8px between paragraphs).
- `min-height: 44px` on step rows and copy buttons — explicitly documented as accessibility exceptions in UI-SPEC Spacing Scale.

No arbitrary spacing values (no `[Xpx]` notation or raw pixel padding) found in the two new components. Spacing is clean.

Pre-existing SidebarShell spacing (input area `padding: "var(--space-md)"`, content area padding) remains consistent with existing patterns.

---

### Pillar 6: Experience Design (4/4)

All state branches are correctly handled:

**Loading:** `contentState === "loading"` triggers `<LoadingDots />` on first query. For subsequent queries with existing history, the `<SessionFeed>` component remains visible with loading semantics (SidebarShell.tsx line 704).

**Streaming:** `streamingText` passed to `SessionFeed` only when `contentState === "streaming"` (SidebarShell.tsx line 770) — spec-correct and prevents stale text re-render.

**Done:** `<Show when={contentState() === "done"}>` gate for StepChecklist/RawGuidanceText (line 775). `currentExchange` set in `onDone` ensures RawGuidanceText fallback has non-null guidance text.

**Error:** Full error state renders at `contentState === "error"` with `{errorMessage()}` and "Retry" button (lines 801–838). Error messages are specific ("Couldn't reach AI -- check your connection.", "Rate limit reached...", "Authentication error...").

**Empty:** `<EmptyState />` rendered on `contentState === "empty"` with no session history — spec-correct copy.

**Abort / Race conditions:** `abortController.abort()` on new submission (line 283). Generation counter guard (`thisGen !== submitGen`) prevents stale callbacks from applying (line 381, 386). These protect against double-submit race conditions.

**Clarifying question heuristic:** `isClarifyingQuestion(steps)` gates StepChecklist render (SidebarShell.tsx line 776) — if Claude responds with a single question instead of steps, `RawGuidanceText` is shown instead of a 1-item checklist. This is additive to spec requirements and improves UX.

**Step toggle:** Non-linear click support confirmed. `onToggle` flips individual step completed state. `currentStepIndex` is explicitly set to the clicked index on toggle rather than auto-advancing to first-incomplete — this is a deliberate UAT deviation where "current" means "last clicked" not "first uncompleted". The spec defines current as first uncompleted; the implementation defines it as last clicked. This is a behavior gap but one that was consciously introduced as a UAT fix. No user-visible broken state results.

---

## Registry Safety

Registry audit: shadcn not initialized — registry safety check skipped entirely. `lucide-solid` (pre-existing v1.8.0) provides all Phase 10 icons. No third-party registries used.

---

## Files Audited

- `src/components/StepChecklist.tsx` (created in Phase 10)
- `src/components/RawGuidanceText.tsx` (created in Phase 10)
- `src/components/SidebarShell.tsx` (modified in Phase 10)
- `src/lib/parseSteps.ts` (created in Phase 10)
- `src/lib/ai.ts` (SYSTEM_PROMPT replaced in Phase 10)
- `src/styles/theme.css` (read-only; token reference)
- `src/components/EmptyState.tsx` (read-only; copy verification)
- `.planning/phases/10-step-tracking-response-quality/10-UI-SPEC.md`
- `.planning/phases/10-step-tracking-response-quality/10-CONTEXT.md`
- `.planning/phases/10-step-tracking-response-quality/10-01-SUMMARY.md`
- `.planning/phases/10-step-tracking-response-quality/10-02-SUMMARY.md`
- `.planning/phases/10-step-tracking-response-quality/10-03-SUMMARY.md`
- `.planning/phases/10-step-tracking-response-quality/10-W0-SUMMARY.md`
