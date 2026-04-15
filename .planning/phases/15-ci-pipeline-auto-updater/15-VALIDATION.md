---
phase: 15
slug: ci-pipeline-auto-updater
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-14
---

# Phase 15 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Shell commands / GitHub Actions / `cargo tauri signer` / curl — no test framework needed |
| **Config file** | `.github/workflows/release.yml` |
| **Quick run command** | `cargo build --manifest-path src-tauri/Cargo.toml 2>&1 | grep -E "error|warning"` |
| **Full suite command** | `gh workflow view release.yml && curl -s https://github.com/SUBOMI123/AI-Buddy/releases/latest/download/latest.json | python3 -m json.tool` |
| **Estimated runtime** | ~10 seconds (local checks); ~15-20 min (full CI run) |

---

## Sampling Rate

- **After every task commit:** Run quick build check (catches plugin registration errors before they reach CI)
- **After every plan wave:** Run full suite command above
- **Before `/gsd-verify-work`:** Full CI run must have produced artifacts; latest.json must be valid JSON; app must launch without panic
- **Max feedback latency:** 30 seconds (local); ~20 min (CI)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 15-01-01 | 01 | 0 | UPDT-01 | — | Ed25519 keypair generated; pubkey in tauri.conf.json | file-check | `grep -c "pubkey" src-tauri/tauri.conf.json` | ✅ | ⬜ pending |
| 15-01-02 | 01 | 1 | UPDT-01 | — | tauri-plugin-updater in Cargo.toml | file-check | `grep -c "tauri-plugin-updater" src-tauri/Cargo.toml` | ✅ | ⬜ pending |
| 15-01-03 | 01 | 1 | UPDT-02 | — | updater endpoints in tauri.conf.json | file-check | `grep -c "SUBOMI123" src-tauri/tauri.conf.json` | ✅ | ⬜ pending |
| 15-01-04 | 01 | 1 | UPDT-02 | — | App launches without updater panic | cli | `./src-tauri/target/release/bundle/macos/AI\ Buddy.app/Contents/MacOS/ai-buddy &; sleep 3; kill %1 2>/dev/null` | ❌ W0 | ⬜ pending |
| 15-02-01 | 02 | 1 | UPDT-04 | — | release.yml workflow file exists | file-check | `test -f .github/workflows/release.yml && echo EXISTS` | ❌ W0 | ⬜ pending |
| 15-02-02 | 02 | 1 | UPDT-04 | — | Workflow has all 9 required secrets | file-check | `grep -c "APPLE_CERTIFICATE\|TAURI_SIGNING_PRIVATE_KEY\|APP_HMAC_SECRET" .github/workflows/release.yml` | ❌ W0 | ⬜ pending |
| 15-02-03 | 02 | 2 | UPDT-04 | — | Tag push triggers workflow (manual CI run) | manual | Push v0.1.1-test tag, verify workflow triggers in GitHub Actions UI | — | ⬜ pending |
| 15-02-04 | 02 | 2 | UPDT-04 | — | CI produces macOS arm64 + x86_64 DMG artifacts | manual | Check GitHub Release for both architecture DMGs | — | ⬜ pending |
| 15-02-05 | 02 | 2 | UPDT-04 | — | CI produces Windows EXE artifact | manual | Check GitHub Release for .exe or .msi file | — | ⬜ pending |
| 15-02-06 | 02 | 2 | UPDT-01 | — | latest.json published and valid | cli | `curl -s https://github.com/SUBOMI123/AI-Buddy/releases/latest/download/latest.json \| python3 -m json.tool` | ❌ W0 | ⬜ pending |
| 15-03-01 | 03 | 3 | UPDT-03 | — | In-app update dialog appears when newer version available | manual | Install old version, push new tag, launch app, verify dialog appears | — | ⬜ pending |
| 15-03-02 | 03 | 3 | UPDT-03 | — | User can install update without leaving app | manual | Click install in dialog, verify app restarts to new version | — | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Ed25519 keypair generated (`cargo tauri signer generate -w ~/.tauri/ai-buddy.key`) — pubkey in `tauri.conf.json` before any build
- [ ] `KEYCHAIN_PASSWORD` and other GitHub Secrets set in repo settings
- [ ] `.github/workflows/` directory created
- [ ] `tauri-plugin-updater`, `tauri-plugin-dialog`, `tauri-plugin-process` added to Cargo.toml and lib.rs

*Note: CI-dependent verifications (15-02-03 through 15-03-02) are manual because they require a live GitHub Actions run and a published release.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Tag push triggers workflow | UPDT-04 | Requires GitHub Actions live run | Push `v0.1.1-test` tag, check Actions tab in GitHub |
| CI produces signed artifacts | UPDT-04 | Requires successful CI run | Inspect GitHub Release assets for both arch DMGs + Windows EXE |
| latest.json is resolvable | UPDT-04 | Requires live GitHub Release | `curl` the endpoint URL and validate JSON structure |
| Update dialog appears | UPDT-03 | Requires running app + newer release | Install old build, publish new via CI, relaunch app |
| In-app install completes | UPDT-03 | Requires running update + app restart | Click install, verify app restarts to new version |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s (local) / ~20min (CI)
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
