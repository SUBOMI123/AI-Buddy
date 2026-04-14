---
phase: 14-code-signing
plan: 01
subsystem: build-config
tags: [code-signing, entitlements, plist, tauri, macos]
dependency_graph:
  requires: []
  provides: [entitlements-complete, info-plist-complete, signing-identity-slot]
  affects: [cargo-tauri-build, notarization-pipeline]
tech_stack:
  added: []
  patterns: [hardened-runtime-entitlements, tcc-usage-descriptions, tauri-macos-signing]
key_files:
  created: []
  modified:
    - src-tauri/entitlements.plist
    - src-tauri/Info.plist
    - src-tauri/tauri.conf.json
decisions:
  - "Use exactly 5 minimum entitlements — no over-granting beyond documented Tauri WKWebView requirements"
  - "signingIdentity value is a placeholder; actual identity injected via APPLE_SIGNING_IDENTITY env var in Plan 02"
  - "NSScreenCaptureUsageDescription uses D-05 approved text verbatim"
metrics:
  duration_minutes: 5
  completed_date: "2026-04-14"
  tasks_completed: 3
  tasks_total: 3
  files_changed: 3
---

# Phase 14 Plan 01: macOS Entitlements, Info.plist, and Signing Config Summary

**One-liner:** Complete 5-key hardened-runtime entitlements, add NSScreenCaptureUsageDescription TCC key, and add signingIdentity slot to tauri.conf.json for macOS notarized build pipeline.

## What Was Built

Three macOS build configuration files were corrected and extended to unblock code signing and notarization:

1. **entitlements.plist** — expanded from 2 keys to the required 5 keys. The 3 missing JIT keys (`allow-jit`, `allow-dyld-environment-variables`, `disable-library-validation`) were the root cause of a silent post-notarization crash where WKWebView cannot allocate JIT memory under the hardened runtime.

2. **Info.plist** — added `NSScreenCaptureUsageDescription` alongside the existing `NSMicrophoneUsageDescription`. Without this key, macOS silently denies screen capture permission in signed builds, producing blank screenshots.

3. **tauri.conf.json** — added `signingIdentity` placeholder to `bundle.macOS`. This field is required for `cargo tauri build` to produce a signed artifact. The placeholder value will be replaced with the actual Developer ID certificate string in Plan 02 via the `APPLE_SIGNING_IDENTITY` environment variable.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Complete entitlements.plist — add 3 missing JIT keys | dc14b1c | src-tauri/entitlements.plist |
| 2 | Add NSScreenCaptureUsageDescription to Info.plist | 9ce565a | src-tauri/Info.plist |
| 3 | Add signingIdentity to tauri.conf.json bundle.macOS | 0114a00 | src-tauri/tauri.conf.json |

## Verification Results

| Check | Command | Expected | Result |
|-------|---------|----------|--------|
| SIGN-03: 5 entitlement keys | `grep -c "allow-jit\|allow-unsigned\|allow-dyld\|disable-library\|audio-input" entitlements.plist` | 5 | 5 |
| SIGN-04: Screen capture TCC key | `grep "NSScreenCaptureUsageDescription" Info.plist` | key present | present |
| SIGN-01: signingIdentity field | `grep "signingIdentity" tauri.conf.json` | field with Developer ID | present |
| JSON validity | `node -e "require('./src-tauri/tauri.conf.json')"` | valid JSON | valid JSON |

## Decisions Made

1. **Minimum entitlements only** — Exactly 5 keys per SIGN-03. Apple notarization scrutiny increases with over-granted entitlements. No additional keys added beyond the documented Tauri WKWebView minimum.

2. **signingIdentity as placeholder** — The value `"Developer ID Application: PLACEHOLDER (TEAMID)"` is intentionally a placeholder. The `APPLE_SIGNING_IDENTITY` environment variable takes precedence over the config file at build time, so Plan 02 can inject the real identity without modifying this file.

3. **NSScreenCaptureUsageDescription text verbatim** — The approved D-05 description string is used exactly. Deviating from the approved text would be a trust violation (T-14-01-03 mitigation).

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

- `signingIdentity: "Developer ID Application: PLACEHOLDER (TEAMID)"` in `src-tauri/tauri.conf.json` — intentional placeholder. Resolved in Plan 02 when actual Developer ID certificate identity string is available.

## Threat Surface Scan

No new network endpoints, auth paths, file access patterns, or schema changes introduced. All changes are build-time configuration files only.

## Self-Check: PASSED

- `src-tauri/entitlements.plist` — exists, contains 5 `<true/>` entries
- `src-tauri/Info.plist` — exists, contains 2 `<string>` usage descriptions
- `src-tauri/tauri.conf.json` — exists, valid JSON, contains `signingIdentity`
- Commits dc14b1c, 9ce565a, 0114a00 — all present in git log
