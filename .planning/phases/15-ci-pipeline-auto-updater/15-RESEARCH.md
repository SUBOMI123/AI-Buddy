# Phase 15: CI Pipeline & Auto-Updater — Research

**Researched:** 2026-04-14
**Domain:** GitHub Actions CI, tauri-action, tauri-plugin-updater, macOS code signing in CI, Ed25519 updater signing
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**D-01:** Updater endpoint is GitHub Releases directly:
```json
"endpoints": ["https://github.com/SUBOMI123/AI-Buddy/releases/latest/download/latest.json"]
```
No custom domain, no redirect worker.

**D-02:** Update check on every app launch. Silent if up to date. In-app dialog if newer version available.

**D-03:** Ed25519 keypair generated once with `cargo tauri signer generate -w ~/.tauri/ai-buddy.key`. Private key → GitHub Secret `TAURI_SIGNING_PRIVATE_KEY`. Public key content → `tauri.conf.json plugins.updater.pubkey`. Never regenerate unless cert rotated.

**D-04:** tauri-plugin-updater re-added in four places: `Cargo.toml`, `lib.rs`, `capabilities/default.json`, `tauri.conf.json`.

**D-05:** GitHub Secrets use these exact names (same as Phase 14):
- `APPLE_SIGNING_IDENTITY` = `"Developer ID Application: Oreski Group LLC (8Q87GSTTX3)"`
- `APPLE_CERTIFICATE` = base64 `.p12`
- `APPLE_CERTIFICATE_PASSWORD` = `.p12` export password
- `APPLE_ID` = `subibash02@gmail.com`
- `APPLE_PASSWORD` = app-specific password for notarytool
- `APPLE_TEAM_ID` = `8Q87GSTTX3`
- `TAURI_SIGNING_PRIVATE_KEY` = content of `~/.tauri/ai-buddy.key`
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` = key password (if set)
- `APP_HMAC_SECRET` = `e65b212e0dc720b57f9f5b7ae69b2099627c2da8729849ad10791ca6b2b30a5d`

**D-06:** Two separate DMGs: `aarch64-apple-darwin` + `x86_64-apple-darwin`. Matrix strategy or sequential. Universal binary (`lipo`) deferred unless tauri-action handles it automatically.

**D-07:** Windows unsigned installer built on `windows-latest` runner. Published to GitHub Releases alongside macOS DMGs.

**D-08:** `docs/windows-beta-install.md` contains `[your-github-org]` placeholder (IN-01 from Phase 14 review). Replace with `SUBOMI123`.

### Claude's Discretion

- Exact GitHub Actions workflow YAML structure (matrix vs sequential jobs, runner versions)
- Whether to use `tauri-action` directly or custom workflow around `cargo tauri build`
- Universal binary approach (`lipo`) vs two separate DMGs — verify tauri-action behavior
- In-app update dialog UX beyond "check on launch" — standard Tauri dialog acceptable
- Whether Windows build runs on `windows-latest` or cross-compiles from macOS
- Keychain management in CI (create-keychain, unlock, delete after build)

### Deferred Ideas (OUT OF SCOPE)

- Custom domain `releases.aibuddy.app` for updater endpoint — v1.0 / Phase 16+
- Windows EV code signing — v1.0
- Universal binary for macOS — evaluate; if tauri-action handles cleanly, may include
- Auto-download in background before showing dialog — standard dialog flow sufficient for beta

</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| UPDT-01 | Ed25519 signing keypair generated once — public key embedded in `tauri.conf.json`, private key stored in CI secrets and password manager | Section: Ed25519 Keypair Setup |
| UPDT-02 | `tauri-plugin-updater` configured with production GitHub Releases endpoint (`latest.json`) — app checks for updates on launch | Sections: Plugin Re-integration, In-App Update Check |
| UPDT-03 | In-app update dialog appears when new version available — user can install without leaving app | Section: In-App Update Dialog |
| UPDT-04 | GitHub Actions `release.yml` produces signed + notarized macOS DMGs and Windows installer on git tag push, publishes `latest.json` via `tauri-action` | Sections: Standard Stack, Architecture Patterns, CI Workflow |

</phase_requirements>

---

## Summary

Phase 15 requires three interlocking systems: (1) an Ed25519 keypair for signing update artifacts, (2) `tauri-plugin-updater` wired into the app to check for and install updates, and (3) a GitHub Actions `release.yml` that produces signed macOS DMGs, an unsigned Windows installer, and a `latest.json` manifest automatically on tag push.

The standard tool is `tauri-apps/tauri-action@v0`, which handles artifact signing, GitHub Release creation, and `latest.json` generation in a single action. The workflow uses a matrix strategy with three jobs: `macos-latest` for `aarch64-apple-darwin`, `macos-latest` for `x86_64-apple-darwin`, and `windows-latest` for the unsigned Windows installer. macOS signing requires a certificate import step before the build step — the `APPLE_CERTIFICATE` base64 secret is decoded into a temporary keychain with `security create-keychain`, `security import`, and `security set-key-partition-list`.

The most significant known risk is the `bundle_dmg.sh` failure on GitHub Actions macOS runners (confirmed affecting this project per Phase 14 notes). The fix is to set the environment variable `TAURI_BUNDLER_DMG_IGNORE_CI=false` in the build step, introduced in `tauri-bundler 2.2.0`. This disables the Finder-based DMG window customization (which times out in CI) while still producing valid DMG artifacts. The project's existing `scripts/sign-and-notarize.sh` uses `hdiutil create` as a manual fallback; in CI the env var approach is cleaner.

**Primary recommendation:** Use `tauri-apps/tauri-action@v0` with a three-job matrix (arm64 macOS, x86_64 macOS, Windows), set `TAURI_BUNDLER_DMG_IGNORE_CI=false` to bypass the known DMG bundler CI failure, add `createUpdaterArtifacts: true` to `bundle` config, and generate the Ed25519 keypair locally before the first CI run.

---

## Standard Stack

### Core

| Library / Tool | Version | Purpose | Why Standard |
|----------------|---------|---------|--------------|
| `tauri-apps/tauri-action` | `v0` (latest) | Build, sign, upload artifacts, publish `latest.json` to GitHub Releases | Official Tauri action; handles notarization submission, updater JSON generation, and multi-arch release creation automatically |
| `tauri-plugin-updater` | `2` (latest) | In-app update detection and installation | Official Tauri plugin; replaces removed built-in updater from v1 |
| `@tauri-apps/plugin-updater` | `2` | Frontend JS bindings for `tauri-plugin-updater` | Required companion npm package for JS `check()` API |
| `@tauri-apps/plugin-dialog` | `2` | In-app update confirmation dialog | Standard Tauri dialog plugin; used to show "Update available?" prompt |
| `@tauri-apps/plugin-process` | `2` | App relaunch after update install | Required for `relaunch()` after `downloadAndInstall()` |
| `dtolnay/rust-toolchain@stable` | stable | Rust toolchain setup in CI | Standard action for Rust CI; supports target installation |
| `actions/setup-node@v4` | v4 | Node/npm setup in CI | Required for `npm run build` (frontend) in CI |

### Supporting

| Library / Tool | Version | Purpose | When to Use |
|----------------|---------|---------|-------------|
| `TAURI_BUNDLER_DMG_IGNORE_CI` env var | N/A (tauri-bundler 2.2.0+) | Bypass Finder-based DMG window customization in CI | Always set in macOS CI build step to prevent `bundle_dmg.sh` AppleScript timeout |
| `tauri-plugin-dialog` (Rust) | `2` | Optional: Rust-side dialog for update prompt | Only needed if update check is done from Rust `setup()` rather than frontend |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `tauri-action@v0` | Manual `cargo tauri build` + upload-artifact | tauri-action handles latest.json generation and merging across matrix jobs automatically; manual approach requires custom latest.json merge logic |
| Matrix strategy (3 jobs) | Sequential jobs | Matrix is faster (parallel); sequential reduces complexity but takes longer |
| `TAURI_BUNDLER_DMG_IGNORE_CI=false` | `--bundles app` then separate `hdiutil` DMG step | Env var is simpler; `--bundles app` then hdiutil requires custom post-build DMG creation script and separate upload |

**Installation (npm):**
```bash
npm install @tauri-apps/plugin-updater @tauri-apps/plugin-dialog @tauri-apps/plugin-process
```

**Cargo.toml addition:**
```toml
tauri-plugin-updater = "2"
tauri-plugin-dialog = "2"
tauri-plugin-process = "2"
```

---

## Architecture Patterns

### Recommended Project Structure

```
.github/
└── workflows/
    └── release.yml          # Tag-triggered release workflow (created by Phase 15)
src-tauri/
├── Cargo.toml               # Add tauri-plugin-updater = "2"
├── src/
│   └── lib.rs               # Add updater plugin registration
├── capabilities/
│   └── default.json         # Add "updater:default" permission
└── tauri.conf.json          # Add plugins.updater block + bundle.createUpdaterArtifacts
src/
└── updater.ts               # Frontend update check called on app mount
scripts/
└── sign-and-notarize.sh     # Existing (unchanged — CI uses env vars, not this script)
docs/
└── windows-beta-install.md  # Fix [your-github-org] → SUBOMI123 placeholder (D-08)
```

### Pattern 1: Ed25519 Keypair One-Time Setup

**What:** Generate a keypair locally, embed pubkey in source, store private key as CI secret.

**When to use:** Before the first CI release build. Never regenerate unless the key is compromised.

**Steps:**
```bash
# Run locally (one time only)
cargo tauri signer generate -w ~/.tauri/ai-buddy.key

# Output: private key file at ~/.tauri/ai-buddy.key
#         public key printed to stdout AND at ~/.tauri/ai-buddy.key.pub
# The public key is a base64-encoded minisign public key string, e.g.:
# dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXkuLi4K...
```

Store:
- `~/.tauri/ai-buddy.key` content → GitHub Secret `TAURI_SIGNING_PRIVATE_KEY`
- Password (if set) → GitHub Secret `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`
- Public key string → `tauri.conf.json` `plugins.updater.pubkey` (committed to repo)

[VERIFIED: v2.tauri.app/plugin/updater/]

### Pattern 2: tauri.conf.json Updater Block

**What:** Add `createUpdaterArtifacts` to bundle config and `plugins.updater` block with pubkey and endpoint.

**Critical:** `pubkey` must be the **content** of the `.key.pub` file, not a file path. If pubkey is missing or invalid, the app panics at startup with `PluginInitialization("updater", ...)`.

```json
{
  "bundle": {
    "active": true,
    "targets": "all",
    "createUpdaterArtifacts": true,
    "macOS": {
      "infoPlist": "./Info.plist",
      "entitlements": "./entitlements.plist",
      "signingIdentity": "Developer ID Application: Oreski Group LLC (8Q87GSTTX3)"
    }
  },
  "plugins": {
    "updater": {
      "pubkey": "<CONTENT_OF_.key.pub_FILE>",
      "endpoints": [
        "https://github.com/SUBOMI123/AI-Buddy/releases/latest/download/latest.json"
      ]
    }
  }
}
```

[VERIFIED: v2.tauri.app/plugin/updater/ + tauri-apps/plugins-workspace test config]

### Pattern 3: Cargo.toml + lib.rs Re-Integration

**What:** Add the updater plugin back to the project (removed in Phase 14).

**Cargo.toml addition:**
```toml
tauri-plugin-updater = "2"
```

**lib.rs addition** (platform-gated for desktop only):
```rust
use tauri::Manager;
// Inside run():
#[cfg(desktop)]
app.handle().plugin(tauri_plugin_updater::Builder::new().build())?;
```

Or, more simply, added to the builder chain before setup:
```rust
let mut builder = tauri::Builder::default()
    .plugin(tauri_plugin_global_shortcut::Builder::new().build())
    .plugin(tauri_plugin_opener::init())
    .plugin(tauri_plugin_updater::Builder::new().build())  // re-added Phase 15
    .plugin(tauri_plugin_dialog::init())                    // for update dialog
    .plugin(tauri_plugin_process::init());                  // for relaunch after update
```

[VERIFIED: v2.tauri.app/plugin/updater/]

### Pattern 4: capabilities/default.json Permission

```json
{
  "permissions": [
    "core:default",
    "updater:default",
    "dialog:default",
    "process:allow-relaunch"
  ]
}
```

`updater:default` grants `allow-check`, `allow-download`, `allow-install`, and `allow-download-and-install`.

[VERIFIED: v2.tauri.app/plugin/updater/]

### Pattern 5: In-App Update Check on Launch (Frontend)

**What:** Check for updates on app mount, show dialog if available, silent if up to date.

**File:** `src/updater.ts`
```typescript
import { check } from '@tauri-apps/plugin-updater';
import { ask } from '@tauri-apps/plugin-dialog';
import { relaunch } from '@tauri-apps/plugin-process';

export async function checkForAppUpdates(): Promise<void> {
  try {
    const update = await check();
    if (!update) return; // No update available — silent

    const yes = await ask(
      `Version ${update.version} is available.\n\nInstall now?`,
      {
        title: 'Update Available',
        okLabel: 'Install & Restart',
        cancelLabel: 'Later',
      }
    );

    if (yes) {
      await update.downloadAndInstall();
      await relaunch();
    }
  } catch (e) {
    // Silently swallow network errors on launch — do not block startup
    console.warn('[updater] check failed:', e);
  }
}
```

**Call from SolidJS root component on mount:**
```typescript
import { onMount } from 'solid-js';
import { checkForAppUpdates } from './updater';

// In App component:
onMount(() => {
  checkForAppUpdates(); // fire-and-forget; errors swallowed
});
```

[VERIFIED: docs.crabnebula.dev/cloud/guides/auto-updates-tauri/ + v2.tauri.app/plugin/updater/]

### Pattern 6: GitHub Actions release.yml — Complete Structure

**What:** Three-job matrix triggered by semver tag push.

**Trigger:** `push: tags: ['v*']`

**Jobs:**
- `macos-arm64`: `macos-latest`, `--target aarch64-apple-darwin`
- `macos-x86`: `macos-latest`, `--target x86_64-apple-darwin`
- `windows`: `windows-latest`, no target flag

**macOS certificate import step** (runs before tauri-action):
```yaml
- name: Import Apple Developer Certificate
  env:
    APPLE_CERTIFICATE: ${{ secrets.APPLE_CERTIFICATE }}
    APPLE_CERTIFICATE_PASSWORD: ${{ secrets.APPLE_CERTIFICATE_PASSWORD }}
    KEYCHAIN_PASSWORD: ${{ secrets.KEYCHAIN_PASSWORD }}  # any random secret value
  run: |
    CERT_PATH="$RUNNER_TEMP/build_certificate.p12"
    KEYCHAIN_PATH="$RUNNER_TEMP/app-signing.keychain-db"
    echo "$APPLE_CERTIFICATE" | base64 --decode > "$CERT_PATH"
    security create-keychain -p "$KEYCHAIN_PASSWORD" "$KEYCHAIN_PATH"
    security set-keychain-settings -lut 21600 "$KEYCHAIN_PATH"
    security unlock-keychain -p "$KEYCHAIN_PASSWORD" "$KEYCHAIN_PATH"
    security import "$CERT_PATH" -P "$APPLE_CERTIFICATE_PASSWORD" -A -t cert -f pkcs12 -k "$KEYCHAIN_PATH"
    security set-key-partition-list -S apple-tool:,apple:,codesign: -s -k "$KEYCHAIN_PASSWORD" "$KEYCHAIN_PATH"
    security list-keychain -d user -s "$KEYCHAIN_PATH"
```

**Build step (macOS):**
```yaml
- name: Build and Release (macOS)
  uses: tauri-apps/tauri-action@v0
  env:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
    APPLE_SIGNING_IDENTITY: ${{ secrets.APPLE_SIGNING_IDENTITY }}
    APPLE_CERTIFICATE: ${{ secrets.APPLE_CERTIFICATE }}
    APPLE_CERTIFICATE_PASSWORD: ${{ secrets.APPLE_CERTIFICATE_PASSWORD }}
    APPLE_ID: ${{ secrets.APPLE_ID }}
    APPLE_PASSWORD: ${{ secrets.APPLE_PASSWORD }}
    APPLE_TEAM_ID: ${{ secrets.APPLE_TEAM_ID }}
    TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}
    TAURI_SIGNING_PRIVATE_KEY_PASSWORD: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY_PASSWORD }}
    APP_HMAC_SECRET: ${{ secrets.APP_HMAC_SECRET }}
    TAURI_BUNDLER_DMG_IGNORE_CI: "false"   # bypass bundle_dmg.sh CI failure
  with:
    tagName: v__VERSION__
    releaseName: 'AI Buddy v__VERSION__'
    releaseBody: 'See assets below to download and install.'
    releaseDraft: true
    prerelease: false
    args: '--target ${{ matrix.target }}'
```

**Build step (Windows):**
```yaml
- name: Build and Release (Windows)
  uses: tauri-apps/tauri-action@v0
  env:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
    TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}
    TAURI_SIGNING_PRIVATE_KEY_PASSWORD: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY_PASSWORD }}
    APP_HMAC_SECRET: ${{ secrets.APP_HMAC_SECRET }}
  with:
    tagName: v__VERSION__
    releaseName: 'AI Buddy v__VERSION__'
    releaseBody: 'See assets below to download and install.'
    releaseDraft: true
    prerelease: false
```

**`tauri-action` publishes `latest.json`** automatically when multiple jobs upload to the same release. The action merges platform signatures across jobs into a single `latest.json` file.

[VERIFIED: github.com/tauri-apps/tauri-action README + v2.tauri.app/distribute/pipelines/github/]

### Pattern 7: latest.json Format

`tauri-action` generates this file automatically. Shape for understanding (planner reference only):

```json
{
  "version": "0.1.1",
  "notes": "AI Buddy v0.1.1",
  "pub_date": "2026-04-15T00:00:00Z",
  "platforms": {
    "darwin-aarch64": {
      "signature": "<content of .app.tar.gz.sig file>",
      "url": "https://github.com/SUBOMI123/AI-Buddy/releases/download/v0.1.1/AI.Buddy_0.1.1_aarch64.dmg"
    },
    "darwin-x86_64": {
      "signature": "<content of .app.tar.gz.sig file>",
      "url": "https://github.com/SUBOMI123/AI-Buddy/releases/download/v0.1.1/AI.Buddy_0.1.1_x64.dmg"
    },
    "windows-x86_64": {
      "signature": "<content of .exe.sig file>",
      "url": "https://github.com/SUBOMI123/AI-Buddy/releases/download/v0.1.1/AI.Buddy_0.1.1_x64-setup.exe"
    }
  }
}
```

Required fields: `version`, `platforms.<key>.url`, `platforms.<key>.signature`. Optional: `notes`, `pub_date`.

Platform key format: `OS-ARCH` where OS is `darwin`, `windows`, or `linux`; ARCH is `aarch64` or `x86_64`.

[VERIFIED: v2.tauri.app/plugin/updater/ + tauri-apps/plugins-workspace test config]

### Pattern 8: APP_HMAC_SECRET Compile-Time Injection

The project uses `env!("APP_HMAC_SECRET")` in `preferences.rs` (read at compile time). In CI, this must be injected via the `env:` block of the build step — identical to how `.cargo/config.toml` supplies it locally.

```yaml
env:
  APP_HMAC_SECRET: ${{ secrets.APP_HMAC_SECRET }}
  # WORKER_URL is also in .cargo/config.toml — add it too:
  WORKER_URL: "https://ai-buddy-proxy.subomi-bashorun.workers.dev"
```

Note: `WORKER_URL` is also in `.cargo/config.toml` and may be read at compile time. Add it as a plain value in the workflow (not a secret since it's not sensitive).

[VERIFIED: src-tauri/.cargo/config.toml inspection]

### Anti-Patterns to Avoid

- **Missing `pubkey` in `plugins.updater`:** App panics at startup with `PluginInitialization("updater", ...)` — verified lesson from Phase 14. Must have a valid Ed25519 base64 key before any build.
- **Pubkey as file path:** The `pubkey` field requires the key content string, not a path like `~/.tauri/ai-buddy.key.pub`.
- **No `createUpdaterArtifacts: true`:** Without this, tauri-action will not generate `.sig` files and `latest.json` will be empty or missing.
- **No `TAURI_SIGNING_PRIVATE_KEY` in CI env:** Build succeeds but `.sig` files are not generated — updater silently fails.
- **KEYCHAIN_PASSWORD not added as secret:** Some teams skip this, using a hardcoded string. Avoid — add a random value as a GitHub Secret for cleanliness.
- **Pushing release immediately (not draft):** Set `releaseDraft: true` until all matrix jobs complete. Publish manually after verifying all artifacts landed.
- **Missing `APP_HMAC_SECRET` in CI env:** Compile-time `env!()` panics during `cargo build` in CI.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Update artifact signing | Custom signature verification | `cargo tauri signer generate` + `TAURI_SIGNING_PRIVATE_KEY` | Ed25519 via minisign is built into the Tauri bundler; hand-rolling breaks plugin verification |
| latest.json generation + merging across matrix jobs | Custom merge script | `tauri-action@v0` with same `tagName` across all jobs | tauri-action merges platform entries into a single latest.json automatically |
| macOS keychain certificate import | Custom Keychain scripts | Standard `security` CLI steps (verified pattern) | The `security set-key-partition-list` step is mandatory; missing it causes codesign to hang waiting for GUI input |
| In-app update dialog | Custom dialog UI | `@tauri-apps/plugin-dialog` `ask()` | Native OS dialog handles accessibility, theming, focus management |
| Update download progress | Custom HTTP downloader | `tauri-plugin-updater` `downloadAndInstall()` | Plugin handles streaming download, integrity verification, and OS-specific install |

---

## bundle_dmg.sh Failure Analysis

This is the most critical operational risk in Phase 15 because the project already has a documented `bundle_dmg.sh` failure in its local setup (per Phase 14 notes).

### Root Cause (VERIFIED)

The `bundle_dmg.sh` script uses AppleScript to open Finder and customize DMG window layout (icon positions, background). In CI environments, Finder is headless and AppleScript times out with:
```
execution error: Finder got an error: AppleEvent timed out. (-1712)
```

This was worsened by GitHub Actions Provisioner update `20250619.349`, which appears to have further restricted Finder access. The issue is tracked at `actions/runner-images#12482`. `tauri-bundler 2.2.0` added `TAURI_BUNDLER_DMG_IGNORE_CI` to address this.

### Fix: `TAURI_BUNDLER_DMG_IGNORE_CI=false`

Setting `TAURI_BUNDLER_DMG_IGNORE_CI=false` in the build step env block tells the bundler to skip the CI check that disables DMG formatting — but the important part is it skips the Finder-based AppleScript step. The DMG is still created using `hdiutil` directly; only the visual customization (window size, icon layout) is skipped. This is acceptable for a beta release.

```yaml
env:
  TAURI_BUNDLER_DMG_IGNORE_CI: "false"
```

**Tradeoff:** DMG icon layout will not be customized (plain DMG). Acceptable for beta.

[VERIFIED: tauri-bundler 2.2.0 changelog (v2.tauri.app/release/tauri-bundler/v2.2.0/)]

### Fallback: `--bundles app` + manual hdiutil (Not Recommended)

If `TAURI_BUNDLER_DMG_IGNORE_CI` does not resolve the issue on the current runner:
1. Build with `--bundles app` to get the `.app` bundle
2. Run `hdiutil create -volname "AI Buddy" -srcfolder "target/[arch]/release/bundle/macos/AI Buddy.app" -ov -format UDZO "AI-Buddy.dmg"` in a subsequent step
3. Upload DMG manually with `actions/upload-release-asset`

This replicates the pattern from `scripts/sign-and-notarize.sh`. It requires custom YAML but is a proven fallback.

---

## Common Pitfalls

### Pitfall 1: Ed25519 Pubkey Missing Before Build

**What goes wrong:** App panics at startup: `PluginInitialization("updater", "...")` or similar.
**Why it happens:** `tauri-plugin-updater` validates the pubkey configuration at plugin initialization. An empty, placeholder, or absent pubkey is rejected.
**How to avoid:** Generate the keypair locally (`cargo tauri signer generate -w ~/.tauri/ai-buddy.key`), paste the `.key.pub` file content into `tauri.conf.json` `plugins.updater.pubkey` before adding the plugin to `Cargo.toml`.
**Warning signs:** App crashes immediately on launch with `plugins.updater` in the panic message.

### Pitfall 2: `TAURI_SIGNING_PRIVATE_KEY` Content vs Path

**What goes wrong:** `.sig` files not generated; `latest.json` has empty signature fields.
**Why it happens:** The env var can be either the file path OR the key content. In CI, the path (`~/.tauri/ai-buddy.key`) does not exist — the GitHub Secret must store the **file content**.
**How to avoid:** When storing in GitHub Secrets, copy the content of `~/.tauri/ai-buddy.key` (the actual key text), not just the filename.
**Warning signs:** Successful build but missing `.sig` files in release assets.

### Pitfall 3: `latest.json` Not Merged Across Matrix Jobs

**What goes wrong:** `latest.json` only contains one platform (the last job to complete overwrites previous).
**Why it happens:** Each tauri-action job uploads its own `latest.json`. If they target different release IDs or use different `tagName` values, they don't merge.
**How to avoid:** All three jobs must use the same `tagName: v__VERSION__` value (tauri-action uses `__VERSION__` as a placeholder replaced at runtime). Use `releaseDraft: true` so all jobs can write to the same draft release.
**Warning signs:** `latest.json` in GitHub Release only has one or two platforms listed.

### Pitfall 4: `security set-key-partition-list` Missing

**What goes wrong:** `codesign` hangs waiting for GUI keychain unlock dialog; CI job times out.
**Why it happens:** Without the partition list, macOS requires user interaction to authorize codesign.
**How to avoid:** Always include `security set-key-partition-list -S apple-tool:,apple:,codesign: -s -k "$KEYCHAIN_PASSWORD" "$KEYCHAIN_PATH"` after certificate import.
**Warning signs:** CI job stalls at "codesigning..." with no output and eventually times out.

### Pitfall 5: `APP_HMAC_SECRET` Missing in CI

**What goes wrong:** `cargo build` fails with: `error: environment variable APP_HMAC_SECRET not defined` (from `env!()` macro).
**Why it happens:** Locally, `.cargo/config.toml` provides the env var. In CI, `.cargo/config.toml` values are present in the repo but the secret value itself is not committed.
**How to avoid:** Add `APP_HMAC_SECRET: ${{ secrets.APP_HMAC_SECRET }}` to the build step's `env:` block in the workflow.
**Warning signs:** `cargo build` compilation error referencing `env!("APP_HMAC_SECRET")`.

### Pitfall 6: `WORKER_URL` Missing in CI

**What goes wrong:** Either `cargo build` fails (if `env!()` is used) or the compiled app hits the wrong URL (if there's a fallback).
**Why it happens:** `.cargo/config.toml` sets `WORKER_URL` for local builds; CI does not have this file's values injected.
**How to avoid:** Add `WORKER_URL: "https://ai-buddy-proxy.subomi-bashorun.workers.dev"` as a plain env var in the build step (not a secret — it's not sensitive).

### Pitfall 7: Updater Check Blocking App Startup

**What goes wrong:** App launch is slow or hangs while update check runs.
**Why it happens:** Synchronously awaiting `check()` in the main thread before rendering.
**How to avoid:** Call `checkForAppUpdates()` as a fire-and-forget `onMount` call. Wrap in `try/catch` so network failures don't block startup. The check is async and completes in the background.
**Warning signs:** App takes 2-5 seconds to show UI on every launch.

### Pitfall 8: `releaseDraft: false` Published Before All Jobs Complete

**What goes wrong:** Users download an incomplete release that is missing one or more platforms in `latest.json`.
**Why it happens:** The first job to complete publishes the release as final before other jobs upload their artifacts.
**How to avoid:** Use `releaseDraft: true` in all jobs. Manually publish the draft after verifying all artifacts appear in GitHub Releases.

---

## Code Examples

### lib.rs — Updater Plugin Registration

```rust
// Source: v2.tauri.app/plugin/updater/
// Add to builder chain in src-tauri/src/lib.rs
let mut builder = tauri::Builder::default()
    .plugin(tauri_plugin_global_shortcut::Builder::new().build())
    .plugin(tauri_plugin_opener::init())
    .plugin(tauri_plugin_updater::Builder::new().build())
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_process::init());
```

### Frontend Updater Check

```typescript
// Source: docs.crabnebula.dev/cloud/guides/auto-updates-tauri/
// src/updater.ts
import { check } from '@tauri-apps/plugin-updater';
import { ask } from '@tauri-apps/plugin-dialog';
import { relaunch } from '@tauri-apps/plugin-process';

export async function checkForAppUpdates(): Promise<void> {
  try {
    const update = await check();
    if (!update) return; // Up to date — silent

    const yes = await ask(
      `Version ${update.version} is available.\n\nInstall now?`,
      {
        title: 'Update Available',
        okLabel: 'Install & Restart',
        cancelLabel: 'Later',
      }
    );

    if (yes) {
      await update.downloadAndInstall();
      await relaunch();
    }
  } catch (e) {
    console.warn('[updater] check failed:', e);
  }
}
```

### SolidJS Integration

```typescript
// Source: pattern derived from docs.crabnebula.dev
// In src/App.tsx or equivalent root component
import { onMount } from 'solid-js';
import { checkForAppUpdates } from './updater';

// Inside component:
onMount(() => {
  // Fire-and-forget; errors are swallowed inside checkForAppUpdates
  void checkForAppUpdates();
});
```

### Complete release.yml Skeleton

```yaml
# Source: tauri-apps/tauri-action README + v2.tauri.app/distribute/pipelines/github/
name: Release

on:
  push:
    tags:
      - 'v*'

jobs:
  build-macos-arm64:
    name: Build macOS (arm64)
    runs-on: macos-latest
    permissions:
      contents: write
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - uses: dtolnay/rust-toolchain@stable
        with:
          targets: aarch64-apple-darwin

      - name: Install frontend deps
        run: npm ci

      - name: Import Apple Developer Certificate
        env:
          APPLE_CERTIFICATE: ${{ secrets.APPLE_CERTIFICATE }}
          APPLE_CERTIFICATE_PASSWORD: ${{ secrets.APPLE_CERTIFICATE_PASSWORD }}
          KEYCHAIN_PASSWORD: ${{ secrets.KEYCHAIN_PASSWORD }}
        run: |
          CERT_PATH="$RUNNER_TEMP/build_certificate.p12"
          KEYCHAIN_PATH="$RUNNER_TEMP/app-signing.keychain-db"
          echo "$APPLE_CERTIFICATE" | base64 --decode > "$CERT_PATH"
          security create-keychain -p "$KEYCHAIN_PASSWORD" "$KEYCHAIN_PATH"
          security set-keychain-settings -lut 21600 "$KEYCHAIN_PATH"
          security unlock-keychain -p "$KEYCHAIN_PASSWORD" "$KEYCHAIN_PATH"
          security import "$CERT_PATH" -P "$APPLE_CERTIFICATE_PASSWORD" -A -t cert -f pkcs12 -k "$KEYCHAIN_PATH"
          security set-key-partition-list -S apple-tool:,apple:,codesign: -s -k "$KEYCHAIN_PASSWORD" "$KEYCHAIN_PATH"
          security list-keychain -d user -s "$KEYCHAIN_PATH"

      - name: Build and Publish
        uses: tauri-apps/tauri-action@v0
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          APPLE_SIGNING_IDENTITY: ${{ secrets.APPLE_SIGNING_IDENTITY }}
          APPLE_CERTIFICATE: ${{ secrets.APPLE_CERTIFICATE }}
          APPLE_CERTIFICATE_PASSWORD: ${{ secrets.APPLE_CERTIFICATE_PASSWORD }}
          APPLE_ID: ${{ secrets.APPLE_ID }}
          APPLE_PASSWORD: ${{ secrets.APPLE_PASSWORD }}
          APPLE_TEAM_ID: ${{ secrets.APPLE_TEAM_ID }}
          TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}
          TAURI_SIGNING_PRIVATE_KEY_PASSWORD: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY_PASSWORD }}
          APP_HMAC_SECRET: ${{ secrets.APP_HMAC_SECRET }}
          WORKER_URL: "https://ai-buddy-proxy.subomi-bashorun.workers.dev"
          TAURI_BUNDLER_DMG_IGNORE_CI: "false"
        with:
          tagName: v__VERSION__
          releaseName: 'AI Buddy v__VERSION__'
          releaseBody: 'See assets below to download and install.'
          releaseDraft: true
          prerelease: false
          args: '--target aarch64-apple-darwin'

  build-macos-x86:
    name: Build macOS (x86_64)
    runs-on: macos-latest
    permissions:
      contents: write
    steps:
      # ... same as arm64 job with:
      # targets: x86_64-apple-darwin
      # args: '--target x86_64-apple-darwin'

  build-windows:
    name: Build Windows
    runs-on: windows-latest
    permissions:
      contents: write
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - uses: dtolnay/rust-toolchain@stable
      - name: Install frontend deps
        run: npm ci
      - name: Build and Publish
        uses: tauri-apps/tauri-action@v0
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}
          TAURI_SIGNING_PRIVATE_KEY_PASSWORD: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY_PASSWORD }}
          APP_HMAC_SECRET: ${{ secrets.APP_HMAC_SECRET }}
          WORKER_URL: "https://ai-buddy-proxy.subomi-bashorun.workers.dev"
        with:
          tagName: v__VERSION__
          releaseName: 'AI Buddy v__VERSION__'
          releaseBody: 'See assets below to download and install.'
          releaseDraft: true
          prerelease: false
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Tauri v1 built-in updater dialog | `tauri-plugin-updater` (external plugin) + manual JS dialog | Tauri v2 release (Oct 2024) | Must implement update UI explicitly; `@tauri-apps/plugin-dialog` + `ask()` is the standard pattern |
| `tauri.bundle.updater` in conf | `plugins.updater` block | Tauri v2 | Config moved; old key is ignored in v2 |
| `@tauri-apps/api-updater` | `@tauri-apps/plugin-updater` | Tauri v2 | Old package removed; new package required |
| bundle_dmg.sh always runs | `TAURI_BUNDLER_DMG_IGNORE_CI` env var skips Finder step | tauri-bundler 2.2.0 | CI DMG builds no longer fail on Finder AppleScript timeout |
| `TAURI_PRIVATE_KEY` | `TAURI_SIGNING_PRIVATE_KEY` | Tauri v2 | Env var renamed; using old name silently produces unsigned artifacts |

**Deprecated/outdated:**
- `TAURI_PRIVATE_KEY` / `TAURI_KEY_PASSWORD`: v1 names — use `TAURI_SIGNING_PRIVATE_KEY` / `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` in v2.
- `tauri.bundle.updater`: v1 config key — ignored in v2, use `plugins.updater`.
- `"pubkey"` as file path: always use key content, not a path.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `TAURI_BUNDLER_DMG_IGNORE_CI=false` resolves the `bundle_dmg.sh` failure on the current `macos-latest` runner for this specific project | bundle_dmg.sh Failure Analysis | If wrong, fallback to `--bundles app` + manual hdiutil DMG step is documented; adds ~1 hour of workflow debugging |
| A2 | `tauri-action@v0` automatically merges `latest.json` entries across matrix jobs when all use the same `tagName` | Pattern 6 | If wrong, latest.json may only contain one platform; would require custom merge step or different workflow structure |
| A3 | `tauri-plugin-dialog` and `tauri-plugin-process` are not currently in the project and must be added | Standard Stack | If wrong (already present), adding them is harmless (idempotent) |
| A4 | `WORKER_URL` is consumed via `env!()` at compile time (making it required in CI env), not at runtime | Pitfall 6 | If wrong (runtime only), omitting from CI env is fine; check `preferences.rs` and other files for `env!("WORKER_URL")` usage |

**All other claims are VERIFIED or CITED against official sources.**

---

## Open Questions

1. **Does `WORKER_URL` use `env!()` (compile-time) or `std::env::var()` (runtime)?**
   - What we know: `APP_HMAC_SECRET` uses `env!()` (confirmed from Phase 14 notes). `WORKER_URL` is in `.cargo/config.toml` alongside it.
   - What's unclear: Whether `WORKER_URL` is also read via `env!()` or via `std::env::var()` at runtime from `.cargo/config.toml`.
   - Recommendation: Planner should include a task to grep `preferences.rs` and all Rust source for `env!("WORKER_URL")` vs `std::env::var("WORKER_URL")`. If compile-time, must add to CI env block. If runtime, `.cargo/config.toml` already handles it for local builds; CI runner may or may not see it.

2. **`KEYCHAIN_PASSWORD` secret — needs to be added to GitHub Secrets?**
   - What we know: The keychain setup step requires `KEYCHAIN_PASSWORD`. It can be any random string — not an Apple credential. It does not need to match anything external.
   - What's unclear: Whether the planner should include generating and storing this as a GitHub Secret, or whether a hardcoded string in the workflow is acceptable.
   - Recommendation: Add a throwaway random value as `KEYCHAIN_PASSWORD` in GitHub Secrets. Avoids hardcoding. Planner should include this in the secrets setup task.

3. **Universal binary (`lipo`) — is it supported by tauri-action natively?**
   - What we know: The tauri-action test workflow includes `universal-apple-darwin` as a target in its own matrix. This suggests `tauri-action` supports universal builds.
   - What's unclear: Whether `cargo tauri build --target universal-apple-darwin` works correctly in this project's setup (some projects report issues with universal builds and native dependencies).
   - Recommendation: Deferred per CONTEXT.md. Proceed with two separate DMGs (arm64 + x86_64). Revisit if users request single universal download link.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| GitHub Actions macOS runner | macOS build jobs | ✓ (cloud) | `macos-latest` (macOS 14/15) | — |
| GitHub Actions Windows runner | Windows build | ✓ (cloud) | `windows-latest` | — |
| `cargo tauri` CLI | Local keypair generation | Needs verification | — | Install via `cargo install tauri-cli` |
| `~/.tauri/ai-buddy.key` | Ed25519 private key | Does not exist yet | — | Must be generated by user in Wave 0 |

**Missing dependencies that block execution:**
- `~/.tauri/ai-buddy.key`: Does not exist yet. Must be generated locally before any CI build can sign artifacts. This is a Wave 0 prerequisite task.
- 9 GitHub Secrets must be configured in `https://github.com/SUBOMI123/AI-Buddy/settings/secrets/actions` before the workflow can run.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | None (no automated test framework detected in this project) |
| Config file | None |
| Quick run command | N/A |
| Full suite command | N/A |

### Phase Requirements → Validation Map

Phase 15 has no unit-testable logic — it is infrastructure and configuration. All validation is manual/integration.

| Req ID | Behavior | Validation Type | How to Verify |
|--------|----------|-----------------|---------------|
| UPDT-01 | Ed25519 keypair generated, pubkey in conf | Manual inspection | `cat src-tauri/tauri.conf.json | grep pubkey` — must be non-empty base64 string |
| UPDT-01 | Private key in GitHub Secrets | Manual | Check `TAURI_SIGNING_PRIVATE_KEY` appears in repo secrets list |
| UPDT-02 | App checks for updates on launch | Integration | Run app, observe network call to `latest.json` endpoint (or check Tauri dev logs) |
| UPDT-02 | Silent if up to date | Integration | Install same version as `latest.json`; launch app; verify no dialog appears |
| UPDT-03 | In-app dialog appears for newer version | Integration | Manually serve `latest.json` pointing to higher version; launch dev build; verify dialog |
| UPDT-04 | Tag push triggers workflow | CI validation | `git tag v0.1.1 && git push --tags`; observe GitHub Actions run completes green |
| UPDT-04 | Signed macOS DMGs in release | CI artifact check | Verify `AI.Buddy_*.dmg` appears in GitHub Releases assets for both architectures |
| UPDT-04 | Windows installer in release | CI artifact check | Verify `AI.Buddy_*-setup.exe` appears in GitHub Releases assets |
| UPDT-04 | `latest.json` published | CI artifact check | Verify `latest.json` appears in release assets with 3 platform entries |

### Wave 0 Gaps

No test framework additions needed. Wave 0 tasks are configuration/credential setup:

- [ ] Generate Ed25519 keypair — run `cargo tauri signer generate -w ~/.tauri/ai-buddy.key` locally
- [ ] Add pubkey to `tauri.conf.json`
- [ ] Add all 9 GitHub Secrets to repository settings
- [ ] Add `KEYCHAIN_PASSWORD` as a 10th secret (any random value)

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | N/A |
| V3 Session Management | No | N/A |
| V4 Access Control | Partial | GitHub Secrets protect signing keys — only CI has access |
| V5 Input Validation | No | `latest.json` is consumed only from trusted endpoint |
| V6 Cryptography | Yes | Ed25519 via minisign (built into Tauri bundler) — do not hand-roll |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Tampered update artifact | Tampering | Ed25519 signature on every artifact; pubkey in binary; app refuses unsigned updates |
| Supply chain: compromised `latest.json` | Tampering | Hosted on GitHub Releases (same trust as source code); HTTPS transport |
| Private key exposure | Information Disclosure | Key stored only in GitHub Secrets and local password manager; never committed |
| Update rollback to vulnerable version | Tampering | Tauri updater only installs if remote `version` > current `version` |
| Man-in-the-middle on update check | Tampering | HTTPS endpoint; artifact signature verification is second layer |

**Critical:** The `TAURI_SIGNING_PRIVATE_KEY` GitHub Secret must have access restricted to the `release.yml` workflow only (use environment-scoped secrets if needed). If the private key leaks, any attacker can sign arbitrary update artifacts that the app will install.

---

## Sources

### Primary (HIGH confidence)
- [v2.tauri.app/plugin/updater/](https://v2.tauri.app/plugin/updater/) — plugin config, pubkey format, latest.json schema, in-app update JS/Rust API
- [v2.tauri.app/distribute/sign/macos/](https://v2.tauri.app/distribute/sign/macos/) — GitHub Actions keychain setup, APPLE_CERTIFICATE base64 decode process
- [github.com/tauri-apps/tauri-action](https://github.com/tauri-apps/tauri-action) — tauri-action inputs, multi-platform matrix, latest.json publication
- [v2.tauri.app/distribute/pipelines/github/](https://v2.tauri.app/distribute/pipelines/github/) — official GitHub Actions workflow structure for Tauri v2
- [github.com/tauri-apps/plugins-workspace/blob/v2/plugins/updater/tests/app-updater/tauri.conf.json](https://github.com/tauri-apps/plugins-workspace/blob/v2/plugins/updater/tests/app-updater/tauri.conf.json) — updater config block structure (official test)
- [v2.tauri.app/release/tauri-bundler/v2.2.0/](https://v2.tauri.app/release/tauri-bundler/v2.2.0/) — `TAURI_BUNDLER_DMG_IGNORE_CI` env var introduced

### Secondary (MEDIUM confidence)
- [docs.crabnebula.dev/cloud/guides/auto-updates-tauri/](https://docs.crabnebula.dev/cloud/guides/auto-updates-tauri/) — complete TypeScript update check + dialog pattern
- [dev.to/tomtomdu73/ship-your-tauri-v2-app-like-a-pro-github-actions-and-release-automation-part-22-2ef7](https://dev.to/tomtomdu73/ship-your-tauri-v2-app-like-a-pro-github-actions-and-release-automation-part-22-2ef7) — complete release.yml pattern with keychain setup
- [github.com/tauri-apps/tauri-action/issues/801](https://github.com/tauri-apps/tauri-action/issues/801) — bundle_dmg.sh failure root cause and `--bundles app` workaround
- [github.com/tauri-apps/tauri-action/issues/1003](https://github.com/tauri-apps/tauri-action/issues/1003) — `TAURI_BUNDLER_DMG_IGNORE_CI` as primary fix

### Tertiary (LOW confidence)
- [github.com/orgs/community/discussions/163491](https://github.com/orgs/community/discussions/163491) — Provisioner 20250619.349 breaking Finder/AppleScript in macOS runners (confirmed failure mode, unresolved at runner level)

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — tauri-action and tauri-plugin-updater are official Tauri tooling; versions verified against current docs
- Architecture patterns: HIGH — patterns sourced from official docs and tauri-action test workflows
- bundle_dmg.sh workaround: MEDIUM — `TAURI_BUNDLER_DMG_IGNORE_CI` is documented in official changelog but this specific project's failure mode may differ from the general case; hdiutil fallback documented
- In-app update dialog: HIGH — complete code from official CrabNebula docs (official Tauri cloud partner)
- Pitfalls: HIGH — sourced from official docs, GitHub issues, and Phase 14 direct experience

**Research date:** 2026-04-14
**Valid until:** 2026-05-14 (tauri-action releases frequently; verify `@v0` still resolves to current version before implementing)
