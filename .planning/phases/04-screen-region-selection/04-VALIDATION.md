---
phase: 04
slug: screen-region-selection
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-04-10
---

# Phase 04 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | None (no jest/vitest/pytest configured in project) |
| **Config file** | None — project has no JS test harness; Rust compile check is the automated gate |
| **Quick run command** | `cargo build --manifest-path /Users/subomi/Desktop/AI-Buddy/src-tauri/Cargo.toml 2>&1 \| grep -c "^error"` |
| **Full suite command** | `cargo build --manifest-path /Users/subomi/Desktop/AI-Buddy/src-tauri/Cargo.toml && cd /Users/subomi/Desktop/AI-Buddy && npx tsc --noEmit --project tsconfig.json` |
| **Estimated runtime** | ~30–60 seconds (Rust incremental build) |

---

## Sampling Rate

- **After every task commit:** Run `cargo build --manifest-path src-tauri/Cargo.toml 2>&1 | grep -c "^error"` — must return `0`
- **After every plan wave:** Run full suite (Rust build + TypeScript type check)
- **Before `/gsd-verify-work`:** Full suite must be green + manual end-to-end smoke test
- **Max feedback latency:** ~60 seconds (Rust incremental)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| Wave0-Q2 (cross-window emit ping) | 01 | 0 | SCRN-01 | T-04-05 | Global emit from region-select window reaches overlay window listener | manual + compile | `cargo build --manifest-path /Users/subomi/Desktop/AI-Buddy/src-tauri/Cargo.toml 2>&1 \| grep -c "^error"` | ❌ W0 | ⬜ pending |
| Wave0-Q3 (window exists at startup) | 01 | 0 | SCRN-01 | T-04-04 | `get_webview_window("region-select")` returns `Some` at startup | manual + compile | `cargo build --manifest-path /Users/subomi/Desktop/AI-Buddy/src-tauri/Cargo.toml 2>&1 \| grep -c "^error"` | ❌ W0 | ⬜ pending |
| 04-01-T1 (capture_region Rust command) | 01 | 1 | SCRN-01 | T-04-01, T-04-03 | Validates x≥0, y≥0, w>0, h>0, bounds within monitor; rejects out-of-bounds with Err | compile | `cargo build --manifest-path /Users/subomi/Desktop/AI-Buddy/src-tauri/Cargo.toml 2>&1 \| tail -5` | ✅ | ⬜ pending |
| 04-01-T2 (window commands + config) | 01 | 1 | SCRN-01 | T-04-04, T-04-07 | `cmd_open_region_select` sets focus (prevents bypass); window is show/hide not re-create (idempotent) | compile | `cargo build --manifest-path /Users/subomi/Desktop/AI-Buddy/src-tauri/Cargo.toml 2>&1 \| tail -5` | ✅ | ⬜ pending |
| 04-02-T1 (RegionSelect.tsx overlay) | 02 | 2 | SCRN-01 | T-04-06 | tabIndex+focus ensures Esc always works; 10px min-size guard prevents accidental 1px regions | ts-compile | `cd /Users/subomi/Desktop/AI-Buddy && npx tsc --noEmit --project tsconfig.json 2>&1 \| grep -E "error TS" \| head -20` | ❌ W0 | ⬜ pending |
| 04-02-T2 (index.tsx routing + tauri.ts IPC) | 02 | 2 | SCRN-01 | T-04-05, T-04-07 | captureRegion passes coords to Rust for server-side bounds re-validation; closeRegionSelect uses hide not destroy | ts-compile | `cd /Users/subomi/Desktop/AI-Buddy && npx tsc --noEmit --project tsconfig.json 2>&1 \| grep -E "error TS" \| head -20` | ✅ | ⬜ pending |
| 04-03-T1 (SidebarShell region wiring) | 03 | 3 | SCRN-01 | T-04-08, T-04-09, T-04-10 | thumbnailB64 in-memory only (not persisted); captureRegion Rust validates bounds (defense-in-depth); ContentState "selecting" prevents duplicate crop button activation | ts-compile | `cd /Users/subomi/Desktop/AI-Buddy && npx tsc --noEmit --project tsconfig.json 2>&1 \| grep -E "error TS" \| head -20` | ✅ | ⬜ pending |
| 04-03-T2 (TextInput Crop button) | 03 | 3 | SCRN-01 | — | aria-pressed reflects region state; 44px touch target; disabled with input when needsPermission | ts-compile | `cd /Users/subomi/Desktop/AI-Buddy && npx tsc --noEmit --project tsconfig.json 2>&1 \| grep -E "error TS" \| head -20` | ✅ | ⬜ pending |
| 04-03-T3 (human verification checkpoint) | 03 | 3 | SCRN-01 | T-04-02 | End-to-end: draw region → thumbnail appears → submit → Claude references crop → region resets | manual | `cargo tauri dev` + human interaction (11-step checklist in Plan 03) | N/A (UI) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Wave 0 Q2 diagnostic: add `cmd_emit_ping` to `lib.rs`, run app, verify cross-window `listen` receives emit in overlay window devtools, remove diagnostic after test
- [ ] Wave 0 Q3 diagnostic: add `get_webview_window("region-select")` check to `setup` closure in `lib.rs`, run app, verify stderr output shows window exists, remove diagnostic after test

*No JS test framework exists in this project. Wave 0 adds compile-verified Rust diagnostics only. UI-layer tests are manual-only.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Wave 0 Q2: cross-window emit actually received | SCRN-01 | Browser devtools interaction required to observe console output in overlay WebView | Run `cargo tauri dev`, open overlay WebView devtools, paste `import('@tauri-apps/api/event').then(({listen})=>listen('debug-ping',e=>console.log('PING:',e)))`, invoke `cmd_emit_ping`, observe console |
| Wave 0 Q3: window exists at startup | SCRN-01 | Requires running the app and observing stderr | Run `cargo tauri dev`, check stderr for `[WAVE0-Q3]` line |
| Rubber-band draw renders correctly | SCRN-01 | Visual CSS rendering cannot be automated | Draw region, verify blue border + tint fill |
| Esc key cancels and restores sidebar | SCRN-01 | Window focus and keyboard routing requires manual test | Open overlay, press Esc, verify sidebar reappears |
| Thumbnail preview appears after region draw | SCRN-01 | Visual UI state | Draw region, release mouse, verify thumbnail above input field |
| Submit uses region crop (not full screenshot) | SCRN-01 | Requires human judgment on Claude response content | Submit with region set, verify Claude guidance references only the cropped area |
| Region resets after submit (D-07) | SCRN-01 | Requires observing UI state change | After submit, verify thumbnail disappears |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify commands (Rust compile check or TypeScript compile check)
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (Q2 and Q3 diagnostics)
- [x] No watch-mode flags in any verify command
- [x] Feedback latency < 60s (Rust incremental build)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
