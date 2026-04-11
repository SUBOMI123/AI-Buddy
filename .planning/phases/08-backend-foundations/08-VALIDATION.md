---
phase: 8
slug: backend-foundations
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-10
---

# Phase 8 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | cargo build (compile-check) + npm run build |
| **Config file** | src-tauri/Cargo.toml |
| **Quick run command** | `cd src-tauri && cargo build -p ai-buddy 2>&1 | tail -20` |
| **Full suite command** | `cargo build -p ai-buddy 2>&1 | tail -20 && npm run build 2>&1 | tail -30` |
| **Estimated runtime** | ~10 seconds (incremental) |

---

## Sampling Rate

- **After every task commit:** Run `cargo build -p ai-buddy 2>&1 | tail -20`
- **After every plan wave:** Run full suite (Rust + frontend build)
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 8-01-01 | 01 | 1 | PLAT-01 | — | N/A | compile | `cargo build -p ai-buddy 2>&1 \| tail -20` | ✅ | ⬜ pending |
| 8-01-02 | 01 | 2 | PLAT-01 | — | N/A | manual | visual: overlay opens on secondary monitor | N/A | ⬜ pending |
| 8-02-01 | 02 | 1 | CTX-01, CTX-03 | — | N/A | compile | `cargo build -p ai-buddy 2>&1 \| tail -20` | ✅ | ⬜ pending |
| 8-02-02 | 02 | 2 | CTX-02 | — | N/A | compile | `npm run build 2>&1 \| tail -30` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements — compile-check approach requires no new test files.

*No Wave 0 tasks needed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Overlay opens on secondary monitor when shortcut pressed there | PLAT-01 | Requires physical multi-monitor setup | Connect external display, press shortcut from secondary, verify overlay appears on that monitor |
| No window size regression on Retina display | PLAT-01 | Requires Retina hardware | Verify overlay dimensions unchanged on primary Retina display after multi-monitor fix |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
