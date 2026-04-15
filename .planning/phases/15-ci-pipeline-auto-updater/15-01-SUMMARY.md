---
phase: 15-ci-pipeline-auto-updater
plan: "01"
subsystem: updater
tags: [updater, tauri-plugin-updater, ed25519, auto-update, github-releases]
dependency_graph:
  requires: []
  provides: [auto-updater-wired, updater-pubkey-embedded, updater-frontend-check]
  affects: [src-tauri/Cargo.toml, src-tauri/src/lib.rs, src-tauri/capabilities/default.json, src-tauri/tauri.conf.json, src/updater.ts, src/components/SidebarShell.tsx]
tech_stack:
  added: [tauri-plugin-updater@2, tauri-plugin-dialog@2, tauri-plugin-process@2, "@tauri-apps/plugin-dialog", "@tauri-apps/plugin-process"]
  patterns: [fire-and-forget onMount update check, silent-on-no-update dialog pattern]
key_files:
  created: [src/updater.ts]
  modified:
    - src-tauri/Cargo.toml
    - src-tauri/src/lib.rs
    - src-tauri/capabilities/default.json
    - src-tauri/tauri.conf.json
    - src/components/SidebarShell.tsx
    - docs/windows-beta-install.md
    - package.json
decisions:
  - "Used process:allow-restart (not process:allow-relaunch) — correct Tauri v2 process plugin permission name"
  - "Dedicated onMount block for checkForAppUpdates() keeps update logic isolated from permission/shortcut setup"
  - "Ed25519 pubkey embedded directly in tauri.conf.json per UPDT-01 requirement"
metrics:
  duration_minutes: 25
  completed_date: "2026-04-15"
  tasks_completed: 2
  tasks_total: 2
  files_created: 1
  files_modified: 7
requirements_satisfied: [UPDT-01, UPDT-02]
---

# Phase 15 Plan 01: Auto-Updater Plugin Wiring Summary

**One-liner:** Re-wired tauri-plugin-updater with Ed25519 pubkey and GitHub Releases endpoint after Phase 14 removal, adding checkForAppUpdates() dialog flow on every launch.

## What Was Built

The auto-updater removed in Phase 14 (to fix a startup panic caused by missing pubkey) has been fully re-wired now that the Ed25519 keypair exists. The app will silently check for updates on every launch and show a native dialog when a newer version is available.

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 2 | Wire tauri-plugin-updater into all four locations | 08c6d3d | Cargo.toml, lib.rs, capabilities/default.json, tauri.conf.json, package.json |
| 3 | Create updater.ts, wire into SidebarShell, fix docs | 31215cd | src/updater.ts, SidebarShell.tsx, docs/windows-beta-install.md |

## Decisions Made

1. **process:allow-restart over process:allow-relaunch** — The Tauri v2 process plugin exposes `process:allow-restart` (not `allow-relaunch`). The plan specified the wrong permission name; auto-fixed per Rule 1.
2. **Dedicated onMount block** — checkForAppUpdates() gets its own `onMount(() => { ... })` block in SidebarShell rather than being inserted into the existing complex async onMount. Keeps update logic isolated and avoids risk of interfering with the WR-02 cancelled-flag pattern.
3. **Ed25519 pubkey in config** — The full base64 pubkey from Task 1 is embedded directly in `plugins.updater.pubkey` in tauri.conf.json, which is the required Tauri v2 updater configuration pattern.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed incorrect process plugin permission name**
- **Found during:** Task 2, Step 6 (cargo build verification)
- **Issue:** `process:allow-relaunch` does not exist in the Tauri v2 process plugin permission schema. The build failed with "Permission process:allow-relaunch not found". The valid permission is `process:allow-restart`.
- **Fix:** Changed `"process:allow-relaunch"` to `"process:allow-restart"` in `src-tauri/capabilities/default.json`.
- **Files modified:** src-tauri/capabilities/default.json
- **Commit:** 08c6d3d (included in Task 2 commit after fix)

## Known Stubs

None — the updater flow is fully wired end-to-end. The `check()` call will return `null` (no-op) until the first signed release is published to GitHub Releases, which is expected behavior.

## Threat Surface Scan

No new network endpoints introduced beyond what the plan's threat model covers. The updater endpoint (`github.com/SUBOMI123/AI-Buddy/releases/latest/download/latest.json`) is already documented in T-15-01-05. Ed25519 signature verification is enforced by tauri-plugin-updater before any payload is applied (T-15-01-01, T-15-01-03).

## Self-Check: PASSED

- src/updater.ts: EXISTS
- 08c6d3d: FOUND in git log
- 31215cd: FOUND in git log
- pubkey in tauri.conf.json: FOUND
- SUBOMI123 in tauri.conf.json: FOUND
- createUpdaterArtifacts in tauri.conf.json: FOUND
- checkForAppUpdates in SidebarShell.tsx: FOUND (import + call)
- [your-github-org] in windows-beta-install.md: GONE
- cargo build: 0 errors
