---
phase: 1
slug: infrastructure-app-shell
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-09
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (frontend) + cargo test (Rust backend) |
| **Config file** | none — Wave 0 installs |
| **Quick run command** | `npm run test` |
| **Full suite command** | `npm run test && cd src-tauri && cargo test` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm run test`
- **After every plan wave:** Run `npm run test && cd src-tauri && cargo test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| TBD | TBD | TBD | INFRA-01 | — | API keys not in binary | integration | `curl proxy-url/health` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | INFRA-02 | — | HMAC validates request | integration | `curl -H "X-App-Sig: ..." proxy-url/health` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | FOUND-01 | — | App in tray, no dock icon | manual | Visual check | N/A | ⬜ pending |
| TBD | TBD | TBD | FOUND-02 | — | Overlay renders without focus steal | manual | Visual check | N/A | ⬜ pending |
| TBD | TBD | TBD | FOUND-03 | — | Global shortcut works | manual | Press shortcut in another app | N/A | ⬜ pending |
| TBD | TBD | TBD | FOUND-04 | — | Overlay dismissible | manual | ESC key or click outside | N/A | ⬜ pending |
| TBD | TBD | TBD | FOUND-05 | — | Screen capture permission granted | manual | macOS permission dialog | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src-tauri/tests/` — Rust test directory with proxy integration stubs
- [ ] `vitest.config.ts` — frontend test config
- [ ] Install vitest + testing dependencies

*Note: Most Phase 1 success criteria require manual verification (system tray, overlay, permissions) — automated coverage limited to proxy health check.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| App appears in system tray only | FOUND-01 | OS-level UI element | Launch app, verify tray icon visible, Dock icon absent, not in Cmd+Tab |
| Overlay renders without focus steal | FOUND-02 | Window focus behavior | Open another app, trigger overlay, verify foreground app retains focus |
| Global shortcut works | FOUND-03 | Cross-app keyboard event | Open TextEdit, press global shortcut, verify overlay appears |
| Overlay dismissible | FOUND-04 | UI interaction | Open overlay, press ESC, verify dismissed; click outside, verify dismissed |
| Screen capture permission | FOUND-05 | macOS permission dialog | Fresh install, launch app, verify permission prompt with explanation |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
