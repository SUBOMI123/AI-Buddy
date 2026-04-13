---
phase: 11-action-first-ui
type: context
created: 2026-04-13
---

# Phase 11 Context: Action-First UI

**Gathered:** 2026-04-13
**Status:** Ready for planning

<domain>
## Phase Boundary

Replace the blank-prompt empty state with instant quick action buttons (Fix, Explain, Optimize, Ask). Buttons fire immediately on tap — no typing required. After a screen region is selected, the same buttons use the region screenshot instead of the full screen. Add a "Try another way" button after guidance responses. Async AI-suggested context actions are deferred (ACTN-04 is a stretch goal for this phase — fixed buttons take priority).

</domain>

<decisions>
## Implementation Decisions

### Quick action buttons — core behavior
- **D-01: Immediate fire.** Tapping a button captures a fresh full-screen screenshot and calls `submitIntent()` with a preset prompt string. Guidance streams immediately — no text input step, no confirmation.
- **D-02: Always fresh screenshot.** Each button tap captures current screen state. No screenshot reuse. Consistent with how the existing text submit path works.
- **D-03: Four fixed labels per spec** — Fix, Explain, Optimize, Ask.
  - `Fix` → preset prompt: `"Fix the issue shown in the screenshot"`
  - `Explain` → preset prompt: `"Explain what's happening in the screenshot"`
  - `Optimize` → preset prompt: `"How can I improve or optimize what's shown"`
  - `Ask` → special case: opens/focuses the text input for freeform entry (does not call submitIntent directly)
- **D-04: Empty state = buttons only.** When `lastIntent().length === 0`, the overlay shows the 4 quick action buttons as the primary content. The text input field is still present/accessible (below or de-emphasized) but is not the visual focus. Replaces the current blank input state.

### Region select + actions
- **D-05: Same 4 buttons, region screenshot substituted.** After the user draws a region box, the overlay sidebar shows the same Fix/Explain/Optimize/Ask buttons. Tapping any of them uses the region screenshot (not the full screen) as the visual context sent to Claude. No new button set, no AI-suggested context actions required for this flow.
- **D-06: Buttons appear in overlay sidebar.** Region is captured, overlay focuses, buttons show in the same sidebar location as the empty-state buttons. No floating toolbar near the selection.

### "Try another way"
- **D-07: Claude's Discretion.** A "Try another way" button should appear after guidance completes. It should re-run the same intent with a modified prompt instructing Claude to suggest a meaningfully different approach. Exact prompt wording, placement within the guidance area, and whether the new response replaces or stacks is left to the planner.

### Async AI context actions (ACTN-04)
- **D-08: Deferred / stretch goal.** Not discussed — implement fixed buttons first. If time allows, async AI-suggested actions can append after the fixed buttons load. `activeApp` signal is already available from Phase 8 and can be used as context. Leave out of V1 plan unless it's trivially achievable.

### Claude's Discretion
- Button visual design (size, color, icon vs text-only, grid vs row layout)
- Exact placement of "Try another way" button within the guidance area
- Whether "Ask" button focuses existing text input or reveals a previously-hidden input
- Loading/streaming state while a quick action is firing (e.g., button disabled, spinner)
- Error handling if screenshot capture fails on button tap

</decisions>

<specifics>
## Specific Ideas

- Buttons should feel like primary actions, not secondary hints — they ARE the empty state, not decoration on top of it
- "Ask" is intentionally different from the other 3: it's an escape hatch for freeform intent, not an AI trigger
- The region-select flow should feel like a natural extension of the base button flow — same UX, different screenshot source

</specifics>

<canonical_refs>
## Canonical References

### Phase requirements
- `.planning/REQUIREMENTS.md` §ACTN-01, ACTN-02, ACTN-03, ACTN-04 — Acceptance criteria for all quick action requirements

### Existing architecture
- `src/components/SidebarShell.tsx` — Main state machine; `submitIntent()`, `lastIntent()`, `steps()`, `taskTitle()` signals; empty-state `Show when={lastIntent().length === 0}` branch is where buttons live
- `src/components/RegionSelect.tsx` — Region selection component; how region screenshot is captured and passed back to the overlay
- `src/lib/ai.ts` — `streamGuidance()` and `SYSTEM_PROMPT`; quick action preset prompts will call this directly
- `src/lib/tauri.ts` — Tauri command wrappers; screenshot capture lives here

### Prior phase context
- `.planning/phases/10-step-tracking-response-quality/10-CONTEXT.md` — D-05 session history refactor, D-06 rendering layout (where StepChecklist lives relative to SessionFeed); "Try another way" must not break this layout

No external design specs — requirements are fully captured in decisions above.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `submitIntent(intent: string, forceFullSteps?: boolean)` — entry point for all AI calls; quick action buttons should call this with preset strings
- `handleRetry()` in SidebarShell — re-runs `lastIntent()`; "Try another way" can build on this pattern with a modified prompt
- `EmptyState.tsx` — exists but currently unused in the main flow; may be replaceable by the quick action button component
- `RegionSelect.tsx` — existing region draw UI; already captures a cropped screenshot

### Established Patterns
- SolidJS `createSignal` for local state — all new state (e.g., `hasRegionSelected`, `regionScreenshot`) follows this pattern
- Inline styles via SolidJS style prop — established in StepChecklist and SidebarShell
- `var(--color-*)` CSS variables from `src/styles/theme.css` — all colors must come from theme tokens

### Integration Points
- `lastIntent().length === 0` branch in SidebarShell JSX — this is where the QuickActions component slots in (replaces or supplements the empty-state Show block)
- `onRegionSelected` / region capture callback in RegionSelect — needs to store the region screenshot so buttons can use it
- StepChecklist + RawGuidanceText rendering after `onDone` — "Try another way" button sits below this area

</code_context>

<deferred>
## Deferred Ideas

- Async AI-suggested context actions (ACTN-04) — may add as stretch goal within this phase if fixed buttons are implemented quickly; otherwise Phase 12
- AI-suggested button labels based on active app (e.g., "Debug" when in VS Code, "Format" when in a text editor) — interesting but not in scope
- Keyboard shortcuts for quick action buttons — backlog

</deferred>

---

*Phase: 11-action-first-ui*
*Context gathered: 2026-04-13*
