# Phase 15: CI Pipeline & Auto-Updater — Context

**Gathered:** 2026-04-14
**Status:** Ready for planning

<domain>
## Phase Boundary

Automate the release pipeline so that pushing a semver git tag produces signed macOS DMGs (arm64 + x86_64), an unsigned Windows installer, and a `latest.json` on GitHub Releases — all without manual intervention. Installed apps detect the new version on next launch and present an in-app update dialog.

Phase 15 ends when:
- `git tag v0.1.1 && git push --tags` triggers the full workflow and all artifacts land on GitHub Releases
- A previously-installed app detects the new release and shows an update dialog on next launch
- The user can install the update from within the app

Phase 16 (Distribution) handles the beta landing page, download links, and feedback channel.

</domain>

<decisions>
## Implementation Decisions

### Updater endpoint — GitHub Releases directly

**D-01:** The updater endpoint is GitHub Releases, not a custom domain. The endpoint in `tauri.conf.json` must be:
```json
"endpoints": ["https://github.com/SUBOMI123/AI-Buddy/releases/latest/download/latest.json"]
```

`tauri-action` publishes `latest.json` automatically to GitHub Releases as part of the release workflow. No custom domain, no redirect worker, no extra infrastructure. Custom domain (`releases.aibuddy.app`) is deferred to v1.0.

### Update check — on every app launch

**D-02:** The app checks for updates on every launch. The check is silent (no UI if up to date). If a newer version is available, an in-app dialog appears. The Tauri updater plugin handles this — no polling interval, no background thread. Standard behavior: check → compare versions → show dialog or do nothing.

### Ed25519 signing keypair — generate once, store in secrets

**D-03:** UPDT-01 requires generating an Ed25519 keypair **before** the first CI release build:
```bash
cargo tauri signer generate -w ~/.tauri/ai-buddy.key
```
- **Private key** (`~/.tauri/ai-buddy.key`): Store in GitHub Secrets as `TAURI_SIGNING_PRIVATE_KEY`. Never commit.
- **Public key** (printed to stdout): Embed in `tauri.conf.json` under `plugins.updater.pubkey`. Commit this — it is public.
- **Key password** (if set during generation): Store in GitHub Secrets as `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`.

The planner must include key generation as an explicit task (the user runs it once locally, stores outputs, never regenerates unless the cert is rotated).

### tauri-plugin-updater — re-add to project

**D-04:** The updater plugin was removed in Phase 14 to fix a startup crash (the plugin had no valid config). Phase 15 must re-add it in three places:
1. `src-tauri/Cargo.toml` — add `tauri-plugin-updater = "2"`
2. `src-tauri/src/lib.rs` — add `.plugin(tauri_plugin_updater::Builder::new().build())`
3. `src-tauri/capabilities/default.json` — add `"updater:default"` permission
4. `src-tauri/tauri.conf.json` — add valid `plugins.updater` block with real `pubkey` and `endpoints`

The plugin must have a valid pubkey at compile time or the app panics at startup (this was the Phase 14 lesson).

### CI credential pattern — GitHub Secrets, same env var names as Phase 14

**D-05:** GitHub Actions uses the same `APPLE_*` env var names established in Phase 14. All CI secrets follow this mapping:

| GitHub Secret | Purpose |
|---|---|
| `APPLE_SIGNING_IDENTITY` | `"Developer ID Application: Oreski Group LLC (8Q87GSTTX3)"` |
| `APPLE_CERTIFICATE` | Base64-encoded `.p12` Developer ID Application cert (exported from Keychain) |
| `APPLE_CERTIFICATE_PASSWORD` | Password used when exporting the `.p12` |
| `APPLE_ID` | `subibash02@gmail.com` |
| `APPLE_PASSWORD` | App-specific password for notarytool |
| `APPLE_TEAM_ID` | `8Q87GSTTX3` |
| `TAURI_SIGNING_PRIVATE_KEY` | Content of `~/.tauri/ai-buddy.key` |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | Password for the signing key (if set) |
| `APP_HMAC_SECRET` | `e65b212e0dc720b57f9f5b7ae69b2099627c2da8729849ad10791ca6b2b30a5d` |

`APP_HMAC_SECRET` is currently in `src-tauri/.cargo/config.toml` for local dev. In CI, it must be injected as an environment variable during `cargo tauri build` (same mechanism — Rust's `env!()` reads env at compile time).

The release workflow must import the certificate into a temporary macOS keychain before building (standard `tauri-action` pattern with `APPLE_CERTIFICATE` base64 secret).

### macOS build targets — arm64 + x86_64, two separate DMGs

**D-06:** Per Phase 15 success criteria, the release must produce both `arm64` and `x86_64` macOS artifacts. This means two separate `cargo tauri build` runs (or a matrix strategy in GitHub Actions) rather than a universal binary. `tauri-action` supports a build matrix natively. Two separate DMGs are published to GitHub Releases.

Universal binary (via `lipo`) is Claude's discretion — researcher should check if `tauri-action` handles this automatically or if it's two separate jobs.

### Windows CI — unsigned installer, build in CI

**D-07:** Phase 14 documented SmartScreen click-through for beta. Phase 15 builds the unsigned Windows installer in CI (no code signing). The GitHub Actions runner for Windows produces the EXE/MSI, and it is published to GitHub Releases alongside the macOS DMGs. Beta users use the `docs/windows-beta-install.md` SmartScreen guide. EV code signing remains deferred to v1.0.

### Placeholder cleanup — IN-01 from Phase 14 review

**D-08:** `docs/windows-beta-install.md` contains `[your-github-org]` placeholder (flagged as IN-01 in the Phase 14 code review). The planner must include a task to replace this with `SUBOMI123` so the download URL reads `https://github.com/SUBOMI123/AI-Buddy/releases`.

### Claude's Discretion

- Exact GitHub Actions workflow YAML structure (matrix vs sequential jobs, runner versions)
- Whether to use `tauri-action` directly or a custom workflow built around `cargo tauri build`
- Universal binary approach (`lipo`) vs. two separate DMGs — researcher should verify tauri-action behavior
- In-app update dialog UX beyond "check on launch" — standard Tauri dialog behavior is acceptable
- Whether the Windows build runs on a `windows-latest` runner or cross-compiles from macOS
- Keychain management in CI (create-keychain, unlock, delete after build)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Auto-updater requirements
- `.planning/REQUIREMENTS.md` — UPDT-01 through UPDT-04 (exact acceptance criteria)
- `.planning/ROADMAP.md` §Phase 15 — success criteria, depends-on, phase boundary

### Phase 14 handoff (must read — establishes patterns this phase extends)
- `.planning/phases/14-code-signing/14-CONTEXT.md` — credential pattern (D-03), cert identity, established env var names
- `scripts/sign-and-notarize.sh` — manual pipeline this CI workflow automates; same logic must be replicated

### Existing config files (read before modifying)
- `src-tauri/tauri.conf.json` — current bundle config (`signingIdentity` set, updater block absent with comment)
- `src-tauri/Cargo.toml` — `tauri-plugin-updater` absent; must be re-added
- `src-tauri/src/lib.rs` — plugin registration; must re-add updater plugin
- `src-tauri/capabilities/default.json` — `updater:default` permission absent; must be re-added
- `src-tauri/.cargo/config.toml` — `APP_HMAC_SECRET` and `WORKER_URL` env vars for local build; CI must replicate via secrets

### Project constraints
- `CLAUDE.md` — Tech stack (Tauri v2, Rust 1.85+, cross-platform target)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `scripts/sign-and-notarize.sh` — full manual sign+notarize+staple pipeline; CI workflow replicates this logic using `tauri-action` and GitHub Secrets
- `src-tauri/entitlements.plist` — 6 entitlement keys, already correct for notarization
- `src-tauri/Info.plist` — both usage descriptions present, correct

### Established Patterns
- **No existing `.github/workflows/`** — Phase 15 creates the first workflow file from scratch
- **APPLE_* env var injection**: local uses shell export; CI uses `env:` block in workflow YAML
- **APP_HMAC_SECRET via compile-time env**: `env!("APP_HMAC_SECRET")` in `preferences.rs` — CI must set this in the build step's `env:` block
- **DMG bundle_dmg.sh failure**: Tauri's bundler DMG script fails in the current project setup; `scripts/sign-and-notarize.sh` already handles this with `hdiutil create` as fallback — CI workflow must account for this

### Integration Points
- GitHub Releases: `tauri-action` publishes artifacts and `latest.json` automatically when triggered by a tag push
- `tauri-plugin-updater` in `lib.rs`: checks `plugins.updater.endpoints` on launch, compares versions, emits update event
- `tauri.conf.json` `version` field drives version comparison — must be bumped before tagging

</code_context>

<specifics>
## Specific Ideas

- GitHub repo: `https://github.com/SUBOMI123/AI-Buddy` — all workflow refs, release URLs, and `latest.json` endpoint must use this exact path
- Update check is on every launch, silent if up to date — no user-visible delay when already on latest version
- The Phase 14 lesson: if `tauri-plugin-updater` is in `Cargo.toml` but `plugins.updater` config is missing or malformed, the app panics at startup with `PluginInitialization("updater", ...)`. The pubkey must be valid before any release build.

</specifics>

<deferred>
## Deferred Ideas

- Custom domain `releases.aibuddy.app` for the updater endpoint — v1.0 / Phase 16+
- Windows EV code signing (eliminates SmartScreen entirely) — v1.0
- Universal binary for macOS (single DMG for arm64 + x86_64) — evaluate in Phase 15 research; if tauri-action handles it cleanly, may be included
- Auto-download in background before showing dialog — standard dialog flow is sufficient for beta

</deferred>

---

*Phase: 15-ci-pipeline-auto-updater*
*Context gathered: 2026-04-14*
