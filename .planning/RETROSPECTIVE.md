# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

---

## Milestone: v2.0 — Task-Native Experience

**Shipped:** 2026-04-13
**Phases:** 4 (08–11) | **Plans:** 12 | **Quick Tasks:** 11

### What Was Built

- **Multi-monitor + app detection** (Phase 08): Overlay opens on cursor's monitor via Rust cursor-position range-check; active app name injected into Claude system prompt — zero permissions beyond Screen Recording
- **Session continuity** (Phase 09): `sessionHistory` signal (3-turn capped, text-only), `conversationHistory` passed to Claude, task header strip, `handleNewTask` reset, `onOverlayShown` conditional reset (D-11)
- **Step-first responses** (Phase 10): Strict SYSTEM_PROMPT enforcement; `parseSteps()` pure function with TDD (Vitest); `StepChecklist` with interactive toggles, current-step highlight, inline copy buttons; `RawGuidanceText` fallback; collapsible session history
- **Action-first UI** (Phase 11): `QuickActions` 2×2 grid (Fix/Explain/Optimize/Ask) in empty state; `TryAnotherWay` button after guidance; `buildTryAnotherPrompt` anti-compounding; region-aware button routing via `selectedRegion()` signal
- **Polish quick tasks**: Context-aware label ("What should I do with this?"), selection indicator, hover scale + 100ms transition, tighter grid spacing, AI-generated task title in header, visible current-step highlight (--color-step-current)

### What Worked

- **TDD wave pattern** worked well for Phase 10 and 11: writing tests first (Wave 0) before implementation kept the core logic honest and caught edge cases early (anti-compounding suffix, isClarifyingQuestion heuristic)
- **GSD quick tasks** were the right abstraction for polish iterations — the user could give high-level UX feedback and the fix could be scoped, planned, executed, and committed atomically without touching the phase structure
- **Pure-function modules** (`parseSteps.ts`, `quickActionPresets.ts`) made testing trivial and kept SidebarShell lean
- **Integration checker** caught the dead `SessionFeed.sessionHistory` prop — a subtle architectural drift that UAT wouldn't surface
- **Inline SolidJS style props** (no CSS classes, no Tailwind) kept components self-contained and diffable; all color tokens from `--color-*` CSS variables made theming consistent

### What Was Inefficient

- **Phase 09 missing VERIFICATION.md**: gsd-verifier was never run after UAT passed — caught only at milestone audit. Process gap: UAT ≠ formal verification
- **REQUIREMENTS.md checkbox staleness**: Phase 10 verified RESP-01/02/03 + STEP-01/02/03 but never updated the `[ ]` checkboxes — a small friction point that surfaced at audit
- **Multiple UX review cycles on QuickActions**: three iterations (initial implementation → lmv polish → lua polish) suggest the initial design review should have been more thorough before execution. Faster to get visual review feedback *before* coding the component, not after
- **Plan checker structural blockers** for Phase 11 were doc issues (missing VALIDATION.md, unresolved open questions marker) — solvable with lighter pre-flight checks in the plan template

### Patterns Established

- `setContentState("loading")` as the **first synchronous operation** in `submitIntent` (before any `await`) is the canonical way to satisfy <100ms UI response requirements in SolidJS
- **`Show when={contentState() === "done"}`** as the wrapper for post-completion UI elements — both `TryAnotherWay` and done-state checklist follow this pattern
- **`hasRegion` prop pattern**: components that need region-awareness receive a boolean prop derived from `!!selectedRegion()` in SidebarShell — signals don't leak into child components
- **`buildTryAnotherPrompt` idempotency pattern**: strip-before-append for any suffix modifier prevents compounding on repeated invocations — applicable to any prompt modifier pattern
- **`onAction` / `onAsk` prop split**: separating AI-triggering actions from UI-only actions (Ask focuses input, doesn't call submitIntent) keeps the component interface honest

### Key Lessons

1. **UAT passing ≠ verification complete.** The gsd-verifier's goal-backward analysis catches integration gaps that scenario tests miss (e.g., dead props, mismatched data flows). Run it even when UAT is clean.
2. **Design review before coding, not after.** The QuickActions UX required 3 post-implementation polish passes. A lightweight UI-SPEC review checkpoint before the first commit would have saved 2 iterations.
3. **Pure functions are worth the extra file.** `quickActionPresets.ts` and `parseSteps.ts` as separate pure-function modules paid off immediately — they're testable, importable everywhere, and have zero side effects on SidebarShell state.
4. **Stale planning doc flags are tech debt.** `nyquist_compliant: false`, `wave_0_complete: false`, unchecked requirement boxes — these accumulate silently and create audit noise. Mark them complete at task commit time, not retroactively.

### Cost Observations

- Model mix: ~100% Sonnet 4.6 (claude-sonnet-4-6)
- All agents used Sonnet — no Opus/Haiku split for this milestone
- Notable: parallel agent spawning (research + planning in separate subagents) kept orchestrator context lean; the main session context stayed well under limits across a long multi-phase day

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Phases | Plans | Quick Tasks | Key Change |
|-----------|--------|-------|-------------|------------|
| v1.0 | 7 | 15 | — | Established GSD workflow, Tauri + SolidJS foundation |
| v2.0 | 4 | 12 | 11 | TDD wave pattern, UI-SPEC contracts, quick tasks for polish |

### Cumulative Quality

| Milestone | Tests | Zero-Dep Pure Modules | Integration Check |
|-----------|-------|----------------------|-------------------|
| v1.0 | 0 | 0 | None |
| v2.0 | 25 (Vitest) | 2 (parseSteps, quickActionPresets) | gsd-integration-checker added |

### Top Lessons (Verified Across Milestones)

1. **Always-on background apps need <30MB RAM discipline** — every dependency decision filters through this constraint. Held across both milestones.
2. **Pure functions + unit tests before integration** — v2.0 TDD wave pattern validated this; retroactively the right call for parseSteps and quickActionPresets.
3. **UAT is necessary but not sufficient** — v2.0 added gsd-verifier as a distinct gate; plan to run it immediately after UAT in v3.0.
