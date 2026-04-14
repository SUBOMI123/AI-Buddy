---
phase: 14
slug: code-signing
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-13
---

# Phase 14 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Shell commands / `spctl` / `codesign` / `xcrun` — no test framework needed |
| **Config file** | none — verification is CLI-based |
| **Quick run command** | `codesign --verify --deep --strict /Applications/AI\ Buddy.app` |
| **Full suite command** | `spctl --assess --type execute --verbose=4 /Applications/AI\ Buddy.app && codesign --verify --deep --strict /Applications/AI\ Buddy.app && xcrun stapler validate /path/to/AI\ Buddy.dmg` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `codesign --verify --deep --strict` on the relevant artifact (plist file check, or app bundle if built)
- **After every plan wave:** Run full suite command above
- **Before `/gsd-verify-work`:** Full suite must pass; manual Gatekeeper test must be run
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 14-01-01 | 01 | 1 | SIGN-03 | — | entitlements.plist contains all 5 required keys | file-check | `grep -c "allow-jit\|allow-dyld\|disable-library" src-tauri/entitlements.plist` | ✅ | ⬜ pending |
| 14-01-02 | 01 | 1 | SIGN-04 | — | Info.plist contains NSScreenCaptureUsageDescription | file-check | `grep -c "NSScreenCaptureUsageDescription" src-tauri/Info.plist` | ✅ | ⬜ pending |
| 14-01-03 | 01 | 2 | SIGN-01 | — | App bundle is signed with Developer ID Application | cli | `codesign --verify --deep --strict /path/to/AI\ Buddy.app && echo SIGNED` | ❌ W0 | ⬜ pending |
| 14-01-04 | 01 | 3 | SIGN-02 | — | Notarization ticket stapled to DMG | cli | `xcrun stapler validate /path/to/AI\ Buddy.dmg && echo STAPLED` | ❌ W0 | ⬜ pending |
| 14-01-05 | 01 | 3 | SIGN-01 | — | Gatekeeper accepts app without warning | manual | Launch app on clean macOS — no security dialog | — | ⬜ pending |
| 14-01-06 | 01 | 3 | SIGN-02 | — | Notarization ticket works offline | manual | Disable WiFi, relaunch app — no warning | — | ⬜ pending |
| 14-02-01 | 02 | 1 | SIGN-05 | — | docs/windows-beta-install.md exists with SmartScreen steps | file-check | `test -f docs/windows-beta-install.md && grep -c "More info" docs/windows-beta-install.md` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `docs/windows-beta-install.md` — created as part of Plan 02 Wave 1
- [ ] Signed+notarized app bundle — created during Plan 01 Wave 2-3 (requires Developer ID cert and Keychain profile)

*Note: This phase is primarily CLI-verified. No test framework installation needed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| App launches without Gatekeeper warning | SIGN-01 | Requires physical macOS machine with GUI | Download DMG, mount, drag to Applications, double-click — verify no "unidentified developer" dialog |
| Notarized ticket works offline | SIGN-02 | Requires network isolation | After successful launch with internet, disable WiFi, relaunch app — must launch without quarantine dialog |
| Screenshot produces real image (not blank) | SIGN-04 | Requires running signed build + screen capture permission | In signed build, trigger screenshot via app — verify result is non-blank |
| Windows SmartScreen click-through works | SIGN-05 | Requires Windows machine | Run installer on Windows, verify "More info → Run anyway" flow matches the documentation |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
