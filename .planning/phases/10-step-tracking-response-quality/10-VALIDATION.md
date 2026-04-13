---
phase: 10
slug: step-tracking-response-quality
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-12
---

# Phase 10 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest (Wave 0 installs) for `parseSteps.ts` unit tests; manual smoke via `cargo tauri dev` for UI |
| **Config file** | `vitest.config.ts` (Wave 0 creates if not present) |
| **Quick run command** | `npx vitest run src/lib/parseSteps.test.ts` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~2s (unit tests); manual UI smoke varies |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run src/lib/parseSteps.test.ts` (Wave 0 creates this)
- **After every plan wave:** Full manual smoke — all 6 requirements verified interactively via `cargo tauri dev`
- **Before `/gsd-verify-work`:** Unit tests green + all 6 requirements pass manual smoke
- **Max feedback latency:** ~2s (unit) / ~2min (manual smoke)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 10-W0-01 | W0 | 0 | STEP-01/STEP-03 | — | N/A | unit | `npx vitest run src/lib/parseSteps.test.ts` | ❌ W0 | ⬜ pending |
| 10-01-01 | 01 | 1 | RESP-01 | T-10-01 | System prompt prevents preamble | manual-smoke | `cargo tauri dev` → submit → verify line 1 is "1." | ✅ | ⬜ pending |
| 10-02-01 | 02 | 1 | STEP-01/STEP-03 | — | N/A | unit + manual | `npx vitest run` + `cargo tauri dev` checklist render | ❌ W0 | ⬜ pending |
| 10-03-01 | 03 | 2 | STEP-02 | — | N/A | manual-smoke | `cargo tauri dev` → click any step → verify toggle | ✅ | ⬜ pending |
| 10-04-01 | 04 | 2 | RESP-02 | T-10-02 | Copy content is sanitized text node value | manual-smoke | `cargo tauri dev` → click copy → verify clipboard | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/lib/parseSteps.test.ts` — unit tests for `parseSteps()` pure function covering:
  - Compliance check: text not starting with `"1."` returns `[]`
  - Standard case: `"1. Click the button\n2. Save the file"` → 2-element array
  - Step with colon: `"1. Open terminal:"` → label is `"Open terminal:"`
  - Non-step lines skipped: code fence lines don't become steps
  - Empty/whitespace-only text returns `[]`
- [ ] `vitest.config.ts` — minimal Vitest config if not already present

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Steps render as checklist with current-step highlight | STEP-01 | UI rendering cannot be automated without browser harness | `cargo tauri dev` → submit intent → confirm checklist appears, first step highlighted |
| Non-linear step toggle | STEP-02 | Click interaction | `cargo tauri dev` → click step 3 before step 1 → verify it marks complete |
| Steps reset on new submit | STEP-03 | State machine transition | Submit follow-up → confirm step checklist resets to fresh steps |
| Copy button on command lines | RESP-02 | Clipboard requires manual verify | Click copy button → paste into text editor → confirm correct text |
| Response starts with "1." | RESP-01 | LLM output compliance | Submit intent → confirm streaming text starts with "1." not a sentence |
| One action per step | RESP-03 | LLM behavior, no UI signal | Review 3 sample responses for compound step detection |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 120s (manual smoke acceptable — no automated harness for Tauri WebView)
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
