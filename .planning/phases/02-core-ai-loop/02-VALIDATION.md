---
phase: 2
slug: core-ai-loop
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-09
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | cargo test (Rust) + manual (frontend streaming) |
| **Config file** | src-tauri/Cargo.toml |
| **Quick run command** | `cargo test -p ai-buddy` |
| **Full suite command** | `cargo test -p ai-buddy && cargo tauri dev` (manual verification) |
| **Estimated runtime** | ~10 seconds (unit tests), manual for streaming UX |

---

## Sampling Rate

- **After every task commit:** Run `cargo test -p ai-buddy`
- **After every plan wave:** Run `cargo test -p ai-buddy` + manual smoke test
- **Before `/gsd-verify-work`:** Full suite must be green + manual E2E verification
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 02-01-01 | 01 | 1 | CORE-02 | T-02-01 | Screenshot bytes never written to disk | unit | `cargo test capture_screenshot` | ❌ W0 | ⬜ pending |
| 02-01-02 | 01 | 1 | CORE-02 | — | N/A | unit | `cargo test resize_encode` | ❌ W0 | ⬜ pending |
| 02-02-01 | 02 | 1 | CORE-01 | — | N/A | manual | `cargo tauri dev` — type intent, press Enter | N/A | ⬜ pending |
| 02-02-02 | 02 | 1 | CORE-04 | — | N/A | manual | Observe progressive text streaming | N/A | ⬜ pending |
| 02-02-03 | 02 | 1 | CORE-03 | T-02-02 | System prompt app-controlled, not user-editable | manual | Submit intent, verify numbered steps | N/A | ⬜ pending |
| 02-02-04 | 02 | 1 | CORE-05 | — | N/A | manual | Submit "help me", verify clarifying question | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src-tauri/src/screenshot_test.rs` — unit test for resize+JPEG encode pipeline (synthetic image, no actual screen capture)
- [ ] Verify `cargo test` runs without errors on existing project

*If none: "Existing infrastructure covers all phase requirements."*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Text streams word-by-word into overlay | CORE-04 | Visual streaming UX cannot be automated without browser test framework | 1. `cargo tauri dev` 2. Type "how do I save a file" 3. Verify text appears progressively, not as block |
| AI asks clarifying question for vague intent | CORE-05 | Depends on Claude's response which varies | 1. Submit "help me" 2. Verify response asks what app/task |
| Guidance is flow-correct and directional | CORE-03 | Subjective quality assessment | 1. Open unfamiliar app 2. Ask for help 3. Follow steps — verify they work |
| Loading dots appear then disappear | D-06 | Visual animation timing | 1. Submit intent 2. Observe pulsing dots 3. Verify they vanish on first token |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
