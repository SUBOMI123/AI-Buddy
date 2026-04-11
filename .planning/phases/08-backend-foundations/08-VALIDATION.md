---
phase: 8
slug: backend-foundations
status: complete
nyquist_compliant: true
wave_0_complete: true
created: 2026-04-10
updated: 2026-04-11
---

# Phase 8 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | cargo build (compile-check) + npm run build + structural grep script |
| **Config file** | src-tauri/Cargo.toml |
| **Quick run command** | `cd src-tauri && cargo build -p ai-buddy 2>&1 \| tail -20` |
| **Full suite command** | `cargo build -p ai-buddy 2>&1 \| tail -20 && npm run build 2>&1 \| tail -30 && bash src-tauri/tests/phase8-structural-verify.sh` |
| **Structural checks** | `bash src-tauri/tests/phase8-structural-verify.sh` |
| **Estimated runtime** | ~12 seconds (incremental) |

---

## Sampling Rate

- **After every task commit:** Run `cargo build -p ai-buddy 2>&1 | tail -20`
- **After every plan wave:** Run full suite (Rust + frontend build + structural)
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 12 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 8-01-01 | 01 | 1 | PLAT-01 | — | N/A | compile | `cargo build -p ai-buddy 2>&1 \| tail -20` | ✅ | ✅ green |
| 8-01-02 | 01 | 2 | PLAT-01 | — | N/A | manual | visual: overlay opens on secondary monitor | N/A | ⬜ manual |
| 8-01-03 | 01 | 1 | PLAT-01 | — | Physical units only; cursor-based monitor selection; no legacy call sites | structural | `bash src-tauri/tests/phase8-structural-verify.sh` | ✅ | ✅ green |
| 8-02-01 | 02 | 1 | CTX-01, CTX-03 | T-08-02-02 | app_name only, never title | compile+structural | `cargo build -p ai-buddy && bash src-tauri/tests/phase8-structural-verify.sh` | ✅ | ✅ green |
| 8-02-02 | 02 | 2 | CTX-02 | T-08-02-01 | appContext injected; detectedApp wired | compile+structural | `npm run build && bash src-tauri/tests/phase8-structural-verify.sh` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

All phase requirements covered by compile checks plus structural grep script at `src-tauri/tests/phase8-structural-verify.sh`.

Script covers 15 assertions across PLAT-01, CTX-01, CTX-02, CTX-03:

- **PLAT-01a** — `available_monitors` present in `window.rs`
- **PLAT-01b** — `primary_monitor()` absent from `toggle_overlay` body
- **PLAT-01c** — `tauri::Size::Logical` absent from `toggle_overlay` body
- **PLAT-01d** — `LogicalSize::new` absent from `toggle_overlay` body
- **PLAT-01e** — `tauri::Size::Physical` present in `toggle_overlay` body
- **PLAT-01f** — exactly 2 `toggle_overlay(app,` call sites in `shortcut.rs`
- **PLAT-01g** — zero legacy `toggle_overlay(&window)` calls remain in `shortcut.rs`
- **CTX-03a** — `win.title` absent from `app_context.rs`
- **CTX-03b** — `win.app_name` present in `app_context.rs`
- **CTX-02a** — `"currently working in"` phrase present in `ai.ts`
- **CTX-02b** — `appContext` field declared in `StreamGuidanceOptions` in `ai.ts`
- **CTX-01a** — `detectedApp` referenced in `SidebarShell.tsx`
- **CTX-01b** — `detectedApp` declared via `createSignal`
- **CTX-01c** — `getActiveApp` called in `SidebarShell.tsx`
- **CTX-01d** — `detectedApp()` signal value consumed in `streamGuidance`/`recordInteraction`

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Overlay opens on secondary monitor when shortcut pressed there | PLAT-01 | Requires physical multi-monitor setup | Connect external display, press shortcut from secondary, verify overlay appears on that monitor |
| No window size regression on Retina display | PLAT-01 | Requires Retina hardware | Verify overlay dimensions unchanged on primary Retina display after multi-monitor fix |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 12s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** complete

---

## Validation Audit 2026-04-11

| Metric | Count |
|--------|-------|
| Gaps found | 6 |
| Resolved | 6 |
| Escalated | 0 |

All 15 structural assertions green on first run. Structural test script created at `src-tauri/tests/phase8-structural-verify.sh`.
