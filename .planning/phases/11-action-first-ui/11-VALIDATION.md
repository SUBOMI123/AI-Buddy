---
phase: 11
slug: action-first-ui
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-04-13
---

# Phase 11 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.4 |
| **Config file** | `vitest.config.ts` (root) — `include: ["src/**/*.test.ts"]`, `environment: "node"` |
| **Quick run command** | `npm test` (runs `vitest run`) |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~2 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm test`
- **Per wave merge:** Run `npm test`

---

## Requirements → Tests Map

| Req | Description | Test Type | Command | Wave 0 Status |
|-----|-------------|-----------|---------|---------------|
| ACTN-01 | QuickActions renders 4 buttons when empty state | Unit (preset strings) | `npm test` | ❌ Wave 0 — `src/lib/quickActionPresets.test.ts` |
| ACTN-02 | submitIntent uses selectedRegion when set | Existing path (no new test) | `npm test` | ✅ Covered implicitly by submitIntent behavior |
| ACTN-03 | "Try another way" prompt suffix appended correctly | Unit | `npm test` | ❌ Wave 0 — `buildTryAnotherPrompt()` tested in `quickActionPresets.test.ts` |
| ACTN-04 | Buttons render synchronously (<100ms) | Manual UAT | n/a | Manual only — Vitest runs in node, no DOM |

---

## Wave 0 Gap Closure

Wave 0 (11-W0-PLAN.md) creates:
- `src/lib/quickActionPresets.ts` — pure functions: `QUICK_PRESETS`, `TRY_ANOTHER_SUFFIX`, `buildTryAnotherPrompt()`
- `src/lib/quickActionPresets.test.ts` — unit tests for preset strings and suffix composition

After Wave 0: `npm test` covers ACTN-01 (preset labels) and ACTN-03 (suffix logic).

---

## Wave Sampling Continuity

| Task | Wave | Automated Verify Command |
|------|------|--------------------------|
| W0-T1 | 0 | `npm test` (RED — fail expected) |
| W0-T2 | 0 | `npm test` (GREEN — all pass) |
| 01-T1 | 1 | `npx tsc --noEmit` |
| 01-T2 | 1 | `npx tsc --noEmit && npm test` |
| 02-T1 | 2 | `npx tsc --noEmit` |
| 02-T2 | 2 | `npx tsc --noEmit && npm test` |

No window of 3 consecutive tasks without automated verify. Nyquist compliant.
