---
phase: 14-code-signing
plan: 02
subsystem: build-pipeline
tags: [code-signing, notarization, macos, gatekeeper, dmg, tauri]
dependency_graph:
  requires: [entitlements-complete, info-plist-complete, signing-identity-slot]
  provides: [signed-notarized-dmg, sign-notarize-script, gatekeeper-verified]
  affects: [beta-distribution, phase-15-ci]
tech_stack:
  added: [scripts/sign-and-notarize.sh]
  patterns: [apple-notarization-pipeline, env-var-credential-injection, keychain-profile-auth]
key_files:
  created:
    - scripts/sign-and-notarize.sh
  modified:
    - src-tauri/tauri.conf.json
decisions:
  - "Real Developer ID Application identity committed to tauri.conf.json — cert name is not a secret"
  - "All credentials injected via session-scoped env vars only — never written to disk or script body"
  - "Keychain profile ai-buddy-notarize is the durable local store; Phase 15 CI uses GitHub Secrets env vars instead"
  - "sign-and-notarize.sh targets Phase 15 CI handoff — APPLE_* env var model carries directly to GitHub Actions"
metrics:
  duration_minutes: 40
  completed_date: "2026-04-14"
  tasks_completed: 3
  tasks_total: 3
  files_changed: 2
---

# Phase 14 Plan 02: Sign, Notarize, and Staple macOS DMG Summary

**One-liner:** Provisioned Developer ID Application certificate and notarytool Keychain profile, updated tauri.conf.json with real signing identity, created the reusable sign-and-notarize pipeline script, and produced a Gatekeeper-accepted notarized stapled DMG (8.4 MB) — all four SIGN requirements verified.

## What Was Built

Three deliverables complete the macOS code-signing pipeline:

1. **Developer ID Application certificate + notarytool Keychain profile** (human-action, Task 1) — Certificate provisioned via Apple Developer portal CSR flow and installed in macOS Keychain. `security find-identity` confirms "Developer ID Application: Oreski Group LLC (8Q87GSTTX3)". Keychain profile `ai-buddy-notarize` stored with Apple ID, Team ID (8Q87GSTTX3), and app-specific password — encrypted in Keychain, never written to any file.

2. **tauri.conf.json + scripts/sign-and-notarize.sh** (auto, Task 2, commit 71789d7) — Replaced the `PLACEHOLDER` signingIdentity with the real Developer ID Application string. Created `scripts/sign-and-notarize.sh`: a `set -euo pipefail` shell script that runs `cargo tauri build`, locates the DMG, staples the notarization ticket, and prints Gatekeeper and entitlement verification commands. Accepts credentials exclusively via env vars — no plaintext secrets in the script body.

3. **Signed + notarized + stapled DMG** (human-action, Task 3) — Full pipeline executed locally: `cargo tauri build` auto-signed and auto-notarized; `xcrun stapler staple` embedded the ticket; offline Gatekeeper test passed with WiFi disabled. All four SIGN requirements verified.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Provision Developer ID Application certificate and notarytool Keychain profile | N/A (human action — Keychain only) | Keychain (no repo files) |
| 2 | Update tauri.conf.json with real identity and create sign-and-notarize.sh | 71789d7 | src-tauri/tauri.conf.json, scripts/sign-and-notarize.sh |
| 3 | Run sign + notarize + staple pipeline and verify Gatekeeper | N/A (human action — build artifact) | target/release/bundle/macos/ |

## Verification Results

| Requirement | Check | Result |
|-------------|-------|--------|
| SIGN-01: Gatekeeper acceptance | `spctl --assess --type execute --verbose=4 "AI Buddy.app"` → `accepted  source=Notarized Developer ID` | PASS |
| SIGN-01: codesign integrity | `codesign --verify --deep --strict --verbose=2` → `valid on disk`, `satisfies its Designated Requirement` | PASS |
| SIGN-02: Offline launch (stapled ticket) | App launched with WiFi off — no Gatekeeper security warning | PASS |
| SIGN-03: Entitlements valid | `codesign --display --entitlements -` → satisfies Designated Requirement | PASS |
| SIGN-04: NSScreenCaptureUsageDescription | Screen capture permission dialog appeared on first launch | PASS |
| Notarization: submission accepted | Submission a9585cdf-47c1-4ae5-8da1-983bec970777 — status=Accepted | PASS |
| Staple: ticket embedded | `xcrun stapler staple` → "The staple and validate action worked!" on AI Buddy.app | PASS |
| No credentials in script | `grep -E "xxxx-xxxx|@.*\.com" scripts/sign-and-notarize.sh` → no output | PASS |

**DMG artifact:** `AI Buddy_0.1.0_aarch64.dmg` (8.4 MB, stapled .app inside)

## Decisions Made

1. **Real identity committed to tauri.conf.json** — The Developer ID Application name and Team ID are public certificate metadata, not secrets. Committing them makes the config self-documenting and avoids requiring the `APPLE_SIGNING_IDENTITY` env var for local builds (though the env var still takes precedence when set).

2. **Env-var-only credential model** — `scripts/sign-and-notarize.sh` validates all four `APPLE_*` vars via `: "${VAR:?}"` guard and never echoes them. App-specific password can be revoked independently if exposed.

3. **Keychain profile for local, GitHub Secrets for CI** — The durable `ai-buddy-notarize` Keychain profile is a local convenience only. The script's Phase 15 CI note documents that `APPLE_APP_SPECIFIC_PASSWORD` from GitHub Secrets replaces it — the same `APPLE_*` env var model carries directly to GitHub Actions without any script modification.

4. **Script includes Phase 15 handoff instructions inline** — CI adoption of `sign-and-notarize.sh` requires only swapping env var sources (GitHub Secrets vs local shell exports). The handoff note is in the script header so the context is co-located with the code.

## Deviations from Plan

None — plan executed exactly as written. The manual fallback notarization path (Task 3 fallback) was not needed; `cargo tauri build` auto-notarized successfully.

## Known Stubs

None. The `signingIdentity` placeholder from Plan 01 is fully resolved — `src-tauri/tauri.conf.json` now contains the real Developer ID Application identity string.

## Threat Surface Scan

No new network endpoints introduced. The sign-and-notarize pipeline touches two trust boundaries already in the Plan 02 threat model:

- **Shell env vars → cargo tauri build** (T-14-02-01): `set -euo pipefail` and no echo of `APPLE_PASSWORD` — mitigated.
- **Keychain profile → notarytool** (T-14-02-02): Stored in macOS Keychain, never exported to any file — mitigated.
- **DMG artifact post-notarization** (T-14-02-04): Notarization ticket cryptographically bound to DMG hash — accepted (Apple enforces).

No unplanned threat surface discovered.

## Self-Check: PASSED

- `scripts/sign-and-notarize.sh` — exists, executable, uses only env vars
- `src-tauri/tauri.conf.json` — contains "Developer ID Application: Oreski Group LLC (8Q87GSTTX3)", no PLACEHOLDER
- Commit 71789d7 — present in git log (feat(14-02): update signing identity and create sign-and-notarize pipeline)
- SIGN-01 through SIGN-04 — all verified per user-reported results
- Notarization submission a9585cdf-47c1-4ae5-8da1-983bec970777 — status=Accepted
