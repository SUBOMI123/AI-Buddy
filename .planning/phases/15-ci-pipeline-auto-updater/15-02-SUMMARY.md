---
phase: 15-ci-pipeline-auto-updater
plan: "02"
subsystem: ci
status: checkpoint-pending
tags: [ci, github-actions, release, signing, tauri-action]
dependency_graph:
  requires:
    - "15-01"
  provides:
    - "tag-triggered-release-workflow"
  affects:
    - "15-03"
tech_stack:
  added:
    - "GitHub Actions (tauri-apps/tauri-action@v0)"
    - "dtolnay/rust-toolchain@stable"
    - "actions/setup-node@v4"
  patterns:
    - "Three-job CI matrix (macos-arm64, macos-x86, windows)"
    - "Temporary keychain for Apple certificate import"
    - "releaseDraft: true — manual publish required"
key_files:
  created:
    - ".github/workflows/release.yml"
  modified: []
decisions:
  - "releaseDraft: true — requires manual publish after verifying all three job artifacts"
  - "WORKER_URL hardcoded (not a secret) — public URL same as .cargo/config.toml"
  - "Windows job has no --target flag — builds for native runner arch (x86_64-pc-windows-msvc)"
  - "TAURI_BUNDLER_DMG_IGNORE_CI=false — disables Finder-based DMG customization in CI to prevent timeout"
metrics:
  completed_date: "2026-04-14"
  tasks_total: 2
  tasks_completed: 1
---

# Phase 15 Plan 02: GitHub Actions Release Workflow Summary

Three-job GitHub Actions release workflow triggered by semver tag push, building signed macOS DMGs (arm64 + x86_64) and unsigned Windows installer via tauri-action@v0 with draft release strategy.

## Status: Checkpoint Pending

Task 1 is complete. Task 2 (human-verify: confirm workflow triggers in GitHub Actions UI) is pending and will be completed separately.

## What Was Built

**File:** `.github/workflows/release.yml`

A GitHub Actions workflow that:
- Triggers on `push: tags: ['v*']`
- Runs three parallel jobs: `macos-arm64`, `macos-x86`, `windows`
- macOS jobs import the Apple Developer Certificate into a temporary keychain before build
- All three jobs invoke `tauri-apps/tauri-action@v0` with `releaseDraft: true`
- Injects all 9 required CI secrets in build step env blocks
- Sets `TAURI_BUNDLER_DMG_IGNORE_CI: "false"` in macOS build env to bypass bundle_dmg.sh timeout
- Windows job omits `--target` arg (uses native runner `x86_64-pc-windows-msvc`)

## Task Commits

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create .github/workflows/release.yml | 4bd2986 | `.github/workflows/release.yml` (created, 152 lines) |
| 2 | Human-verify workflow triggers | PENDING | — |

## Verification Results (Task 1)

All acceptance criteria passed locally:

| Check | Expected | Result |
|-------|----------|--------|
| File exists | EXISTS | PASS |
| tauri-action@v0 count | 3 | 3 |
| Job names present | macos-arm64, macos-x86, windows | PASS |
| TAURI_BUNDLER_DMG_IGNORE_CI | 2 matches | 2 |
| releaseDraft: true | 3 matches | 3 |
| APP_HMAC_SECRET | >=3 | 3 |
| TAURI_SIGNING_PRIVATE_KEY | >=6 | 6 |
| aarch64-apple-darwin | 2 | 2 |
| x86_64-apple-darwin | 2 | 2 |
| windows-latest | 1 | 1 |
| WORKER_URL | >=3 | 3 |
| security create-keychain | 2 | 2 |

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None.

## Threat Surface

No new threat surface beyond what is documented in the plan's threat model. All mitigations applied:
- Secrets injected via GitHub Actions secrets (never echoed to logs)
- Certificate decoded to `$RUNNER_TEMP/` (not workspace)
- `releaseDraft: true` prevents auto-publish

## Self-Check: PASSED

- `.github/workflows/release.yml` confirmed exists
- Commit `4bd2986` confirmed in git log
