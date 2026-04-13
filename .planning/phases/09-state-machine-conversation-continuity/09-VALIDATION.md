---
phase: 9
slug: state-machine-conversation-continuity
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-12
---

# Phase 9 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Manual-only (no frontend test framework; Vitest/Jest not installed) |
| **Config file** | none |
| **Quick run command** | manual spot-check |
| **Full suite command** | `cd /Users/subomi/Desktop/AI-Buddy/worker && npm test` (Worker tests only) |
| **Estimated runtime** | ~5 seconds (worker); manual UI verification ~10 minutes |

---

## Sampling Rate

- **After every task commit:** Manual spot-check of the task's acceptance criteria in `cargo tauri dev`
- **After every plan wave:** Manual verification of all acceptance criteria in that wave
- **Before `/gsd-verify-work`:** All 4 success criteria from Phase 9 pass manually
- **Max feedback latency:** 10 minutes per wave (manual)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 09-01-01 | 01 | 1 | — | — | N/A | manual | — | N/A | ⬜ pending |
| 09-01-02 | 01 | 1 | SESS-01 | — | N/A | manual | — | N/A | ⬜ pending |
| 09-01-03 | 01 | 2 | SESS-02 | — | N/A | manual | — | N/A | ⬜ pending |
| 09-01-04 | 01 | 2 | SESS-03 | — | N/A | manual | — | N/A | ⬜ pending |
| 09-01-05 | 01 | 2 | TASK-01 | — | N/A | manual | — | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements. No new test files needed — all frontend changes are manual-only.

- Worker tests already pass: `cd worker && npm test` — no changes to worker in Phase 9

*Frontend test framework not installed — all Phase 9 changes are SolidJS component/signal work.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Follow-up question gets context-aware response | SESS-01 | No frontend test framework; requires real Claude API call | 1. Open overlay, ask "How do I create a new branch in git?" 2. Submit follow-up "why did that fail?" — response must reference prior guidance steps without re-asking about the task |
| History feed persists across hide/show | SESS-02 | UI behavior; requires overlay interaction | 1. Ask a question, receive guidance 2. Press shortcut to hide overlay 3. Press shortcut to show overlay — prior exchange must still be visible in feed |
| New task reset clears session | SESS-03 | UI state machine; requires interaction | 1. Complete one exchange 2. Click "New task" — session history clears, task header disappears, EmptyState reappears |
| Task header appears and persists | TASK-01 | UI rendering; requires interaction | 1. Submit intent — task header must appear immediately with truncated intent text 2. Submit follow-up — task header must remain unchanged 3. Click "New task" — task header disappears |
| Hide/show preserves state | SESS-02 | Requires toggling overlay | 1. Submit query, receive streaming response 2. Hide overlay mid-stream via shortcut 3. Show overlay — content must still be present (no reset) |

---

## Validation Sign-Off

- [ ] All tasks have manual verification instructions above
- [ ] Sampling continuity: manual check after every task commit
- [ ] Wave 0: no new test files needed (no frontend framework)
- [ ] Worker tests pass: `cd worker && npm test` ✅
- [ ] `nyquist_compliant: true` set in frontmatter after executor confirms all manual checks pass

**Approval:** pending
