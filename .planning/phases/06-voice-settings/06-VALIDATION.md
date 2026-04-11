---
phase: 6
slug: voice-settings
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-10
---

# Phase 6 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Rust `#[test]` (cargo test) + TypeScript `tsc --noEmit` |
| **Config file** | `src-tauri/Cargo.toml` |
| **Quick run command** | `cd /Users/subomi/Desktop/AI-Buddy && npx tsc --noEmit && cargo build --manifest-path src-tauri/Cargo.toml` |
| **Full suite command** | `APP_HMAC_SECRET=test cargo test --manifest-path /Users/subomi/Desktop/AI-Buddy/src-tauri/Cargo.toml` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx tsc --noEmit && cargo build --manifest-path src-tauri/Cargo.toml`
- **After every plan wave:** Run full suite `APP_HMAC_SECRET=test cargo test --manifest-path src-tauri/Cargo.toml`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 06-01-01 | 01 | 1 | VOICE-02 | — | N/A | compile | `npx tsc --noEmit` | ✅ | ⬜ pending |
| 06-01-02 | 01 | 1 | VOICE-02 | — | N/A | unit | `APP_HMAC_SECRET=test cargo test --manifest-path src-tauri/Cargo.toml` | ❌ W0 | ⬜ pending |
| 06-01-03 | 01 | 1 | VOICE-02 | — | N/A | compile | `npx tsc --noEmit` | ✅ | ⬜ pending |
| 06-01-04 | 01 | 1 | VOICE-02 | — | N/A | manual | Toggle TTS, quit, reopen, verify persisted state | N/A | ⬜ pending |
| 06-01-05 | 01 | 1 | VOICE-02 | — | N/A | manual | Change PTT key, verify old key stops PTT, new key activates PTT | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src-tauri/src/preferences.rs` — add Rust unit test for `cmd_update_ptt_shortcut` key format validation (VOICE-02 PTT configuration)

*All other test infrastructure already exists.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| TTS toggle persists across restart | VOICE-02 | Requires app restart; no IPC to query in-memory signal state | Toggle TTS on in settings, quit app, reopen, open settings — verify toggle shows enabled |
| PTT key change takes effect live | VOICE-02 | Requires audio + keyboard hardware interaction | Change key in settings UI, press old key — PTT should not activate; press new key — PTT should activate |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
