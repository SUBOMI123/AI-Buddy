# Domain Pitfalls: AI Buddy — Deploy & Distribution (v3.0 Ship Milestone)

**Domain:** Cross-platform AI desktop assistant (Tauri v2 + SolidJS + Rust)
**Researched:** 2026-04-13
**Scope:** Pitfalls specific to adding deploy & distribution infrastructure to an existing working Tauri v2 app. Covers macOS notarization, Windows signing, auto-updater, Cloudflare Worker KV, and CI/CD. Prior v1.0 and v2.0 pitfalls retained in separate sections below.
**Overall Confidence:** HIGH (core issues verified via official Tauri docs, Apple developer docs, active GitHub issues, and community post-mortems)

---

## v3.0 Critical Pitfalls — Deploy & Distribution

---

### Pitfall D-01: Missing JIT + Memory Entitlements Crash the App After Notarization

**What goes wrong:** A freshly signed and notarized Tauri app crashes immediately on launch on a clean Mac. It works fine without code signing but fails after signing + notarization. No visible error — the app just exits.

**Why it happens:** Tauri's embedded WebView (WKWebView) requires Just-In-Time compilation to run JavaScript. Under the macOS Hardened Runtime (mandatory for notarization), JIT is disabled by default. Without the correct entitlements, the WebView cannot allocate executable memory and the process is killed by the kernel.

**Required entitlements in `src-tauri/Entitlements.plist`:**
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <!-- Required for WebView JIT -->
    <key>com.apple.security.cs.allow-jit</key>
    <true/>
    <!-- Required for WebView JS engine memory -->
    <key>com.apple.security.cs.allow-unsigned-executable-memory</key>
    <true/>
    <!-- Required for WebView dynamic linking -->
    <key>com.apple.security.cs.allow-dyld-environment-variables</key>
    <true/>
    <!-- Required for screen capture (xcap) -->
    <key>com.apple.security.cs.disable-library-validation</key>
    <true/>
</dict>
</plist>
```

**Reference this in `tauri.conf.json`:**
```json
{
  "bundle": {
    "macOS": {
      "entitlements": "./Entitlements.plist",
      "hardenedRuntime": true
    }
  }
}
```

**Consequences if missed:** Silent crash on launch post-notarization. Crash logs show `EXC_BAD_ACCESS` or `SIGKILL` with no JS output. Extremely difficult to diagnose without knowing to check entitlements first.

**Prevention:**
- Create `Entitlements.plist` before the first signing attempt, not after debugging a crash.
- Verify the plist is referenced in `tauri.conf.json` under `bundle.macOS.entitlements`.
- After signing, run `codesign -d --entitlements - /path/to/YourApp.app` to confirm entitlements are embedded, not just referenced.
- Run `spctl -a -vv /path/to/YourApp.app` to simulate Gatekeeper's assessment.

**Detection warning signs:** App crashes instantly on a different Mac (or with SIP enabled) but runs fine on the build machine.

**Phase:** macOS signing & notarization phase. This must be solved before any distribution.

---

### Pitfall D-02: Screen Capture Requires Info.plist Usage Description — Silently Denied Without It

**What goes wrong:** On a notarized build, screen capture (xcap) silently fails — returns blank images or permission is denied without a TCC prompt appearing at all. The app does not crash; it just never captures.

**Why it happens:** macOS TCC (Transparency, Consent, Control) requires a usage description string in `Info.plist` for any privacy-sensitive capability. Without `NSScreenCaptureUsageDescription`, macOS will deny screen recording access without prompting the user. The TCC database has no entry to show in System Settings → Privacy & Security → Screen Recording.

**Required addition to `src-tauri/Info.plist`:**
```xml
<key>NSScreenCaptureUsageDescription</key>
<string>AI Buddy captures your screen to provide step-by-step guidance for your current task.</string>
```

Also add if using microphone (cpal):
```xml
<key>NSMicrophoneUsageDescription</key>
<string>AI Buddy uses your microphone for push-to-talk voice input.</string>
```

**Consequences if missed:** Screen capture returns empty/blank results silently. No TCC dialog appears. App appears to work (no crash) but guidance has no visual context. Users report "AI doesn't understand my screen."

**Detection warning signs:** Screen capture works in `cargo tauri dev` (unsigned) but returns blank in the signed/notarized build. `CGWindowListCreateImage` returns `nil`. xcap `capture_screen()` returns an all-black image.

**Prevention:**
- Add usage descriptions to `Info.plist` as part of the first notarization setup, before testing.
- After signing, inspect the embedded `Info.plist` using: `plutil -p /path/to/YourApp.app/Contents/Info.plist`.
- Test screen capture on a fresh user account that has never approved the app to verify the TCC prompt appears.

**Phase:** macOS signing phase. Must be verified on a clean system before beta distribution.

---

### Pitfall D-03: TCC Screen Recording Permission Resets on Every New Signed Build (or on Auto-Update)

**What goes wrong:** After shipping an update via the auto-updater, beta users report that they're being asked for screen recording permission again — even though they already approved it. macOS TCC revokes permissions when it detects a new code signature.

**Why it happens:** macOS TCC tracks app identity using a "designated requirement" derived from the code signature. Every unsigned or differently-signed build has a different designated requirement, so TCC treats it as a new app. With a stable Developer ID certificate (same Team ID), the designated requirement stays constant across versions, and TCC permissions persist. Without a stable certificate, permissions are revoked on every rebuild.

**Root cause identified in Tauri community:** When `tauri.conf.json` is used without a fixed Developer ID certificate, each build generates a new ad-hoc signature, triggering permission reset. This is confirmed in Tauri GitHub issue #10567.

**Prevention:**
- Use a single Developer ID Application certificate consistently — never rotate the signing certificate for an app that already has TCC permissions in the wild.
- After auto-update, the new binary must be signed with the same certificate (same Team ID). The `tauri-plugin-updater` replaces the binary in `/Applications` — macOS re-evaluates the signature of the new binary.
- Include user-facing instructions in the beta onboarding: "After an update, you may need to re-grant screen recording permission in System Settings → Privacy & Security → Screen Recording."
- Build a programmatic check at app startup: use `tauri-plugin-macos-permissions` or a direct Rust call to `CGRequestScreenCaptureAccess()` to detect the permission state and redirect users to System Settings if needed.

**Detection warning signs:** Beta users re-asked for screen recording permission after every update. Permission appears in System Settings but the checkbox shows unchecked.

**Phase:** macOS notarization phase AND auto-updater phase. The auto-updater phase must test permission persistence across an update cycle.

---

### Pitfall D-04: Apple Notarization Timeout / Stuck Submission in CI

**What goes wrong:** `cargo tauri build` hangs at the notarization step for 15-60+ minutes in CI with no output. The build appears frozen. Sometimes it eventually fails with a timeout error; other times it succeeds but takes far longer than expected.

**Why it happens:** Apple's notary service is an external HTTP request. The first submission for a new app (or after a long gap between submissions) can take significantly longer — Apple's infrastructure adds submissions to a queue. Large app binaries take longer to scan. The `altool` / `notarytool` process does a polling loop with no visible output in Tauri's log.

**CI-specific problem:** GitHub Actions' default runner has a 6-hour job limit, but macOS runners are more expensive and the CI step has no explicit timeout configured. If the macOS-hosted runner is cold, the total wall time (Rust compile + notarization wait) can approach 60-90 minutes.

**Prevention:**
- Set an explicit timeout on the notarization CI step (30 minutes is reasonable; notarization rarely exceeds this for apps under 50MB).
- Use App Store Connect API credentials (`APPLE_API_KEY` + `APPLE_API_ISSUER` + `APPLE_API_KEY_PATH`) instead of Apple ID + password for CI. The API method is faster and more reliable than the Apple ID method, which can fail with 2FA complications in CI.
- Store `APPLE_API_KEY_PATH` (the `.p8` key file) as a base64 GitHub secret; decode it to a temp file in the CI step before running `cargo tauri build`.
- Break the build into two steps: compile → sign → notarize. A failed notarization does not require recompiling the entire Rust binary.

**Required GitHub Actions secrets for macOS notarization:**
- `APPLE_CERTIFICATE` — base64-encoded `.p12` Developer ID Application certificate
- `APPLE_CERTIFICATE_PASSWORD` — certificate password
- `APPLE_SIGNING_IDENTITY` — identity string, e.g. `Developer ID Application: Your Name (TEAMID)`
- `APPLE_API_ISSUER` — Issuer ID from App Store Connect
- `APPLE_API_KEY` — Key ID from App Store Connect
- `APPLE_API_KEY_BASE64` — base64-encoded `.p8` key file content
- `APPLE_TEAM_ID` — 10-character Apple Team ID

**Paid Developer Program required:** A free Apple Developer account cannot notarize applications. A $99/year Apple Developer Program membership is mandatory before starting the notarization phase.

**Detection warning signs:** CI job runs for 20+ minutes with no log output after "Notarizing..." message. Locally, notarization succeeds in 2-5 minutes.

**Phase:** macOS notarization phase. CI setup must account for notarization time budget.

---

### Pitfall D-05: DMG Notarization Requires Notarizing the .app First, Then the .dmg Separately

**What goes wrong:** The DMG is rejected by Apple with "The binary is not signed with a valid certificate" or Gatekeeper blocks it on the user's machine, even though the `.app` inside the DMG was previously notarized.

**Why it happens:** The notarization ticket is stapled to the specific file that was submitted. If you notarize the `.app`, then package it into a `.dmg`, then distribute the `.dmg` — the `.dmg` itself has no stapled ticket. Gatekeeper checks the outermost container first. If the container (the `.dmg`) has no ticket, it fails or shows a warning.

**Correct sequence:**
1. Sign the `.app` with Developer ID
2. Notarize the `.app`
3. Staple the notarization ticket to the `.app`: `xcrun stapler staple YourApp.app`
4. Package the stapled `.app` into the `.dmg`
5. Notarize the `.dmg`
6. Staple the notarization ticket to the `.dmg`: `xcrun stapler staple YourApp.dmg`

Tauri's `cargo tauri build` handles steps 1-6 automatically when `hardenedRuntime: true` and credentials are configured. The failure mode occurs when developers manually create or re-package the DMG after the automated build.

**Prevention:**
- Never re-package the DMG manually after the build pipeline runs. If you need to modify the DMG contents, re-run the full Tauri build pipeline.
- Validate the final DMG: `xcrun stapler validate YourApp.dmg` should return "The validate action worked!".
- On a separate Mac, run `spctl -a -vvv -t install YourApp.dmg` to verify Gatekeeper accepts it.

**Phase:** macOS notarization phase.

---

### Pitfall D-06: Auto-Updater Signature in update.json Is the File Content, Not a Path

**What goes wrong:** The auto-updater fires, downloads the binary, then throws `InvalidSignature` or `UnexpectedKeyId` and refuses to install. This is one of the most reported Tauri v2 updater bugs (GitHub issues #9565, #10316, #10425, #4610, discussion #12692).

**Why it happens:** The `signature` field in `update.json` (or `latest.json`) must contain the literal text content of the `.sig` file generated during `cargo tauri build` — it is a base64-encoded string starting with `dW50cnVzdGVk`. It is NOT a URL to the `.sig` file, and it is NOT a file path. Developers often put the download URL of the `.sig` artifact here, which causes `InvalidSignature`.

**Correct `update.json` structure:**
```json
{
  "version": "1.0.1",
  "notes": "Bug fixes",
  "pub_date": "2026-04-13T00:00:00Z",
  "platforms": {
    "darwin-aarch64": {
      "url": "https://example.com/releases/v1.0.1/ai-buddy_1.0.1_aarch64.dmg",
      "signature": "dW50cnVzdGVkY29tbWVudDogc2lnbmF0dXJlIG9mIHR5cGU..."
    },
    "darwin-x86_64": {
      "url": "https://example.com/releases/v1.0.1/ai-buddy_1.0.1_x86_64.dmg",
      "signature": "dW50cnVzdGVkY29tbWVudDogc2lnbmF0dXJlIG9mIHR5cGU..."
    },
    "windows-x86_64": {
      "url": "https://example.com/releases/v1.0.1/ai-buddy_1.0.1_x64-setup.exe",
      "signature": "dW50cnVzdGVkY29tbWVudDogc2lnbmF0dXJlIG9mIHR5cGU..."
    }
  }
}
```

**`UnexpectedKeyId` root cause:** This specific error occurs when the public key embedded in `tauri.conf.json` (under `plugins.updater.pubkey`) does not match the private key used to sign the artifact. It happens when:
- The keypair was regenerated (running `cargo tauri signer generate` again) without updating both `tauri.conf.json` and all update artifacts.
- Different keys were used for macOS and Windows builds in CI.
- The private key env var `TAURI_SIGNING_PRIVATE_KEY` was not set during the build, so the artifact was signed with a default or no key.

**Prevention:**
- Generate the keypair exactly once: `cargo tauri signer generate -w ~/.tauri/myapp.key`. Store the private key as `TAURI_SIGNING_PRIVATE_KEY` secret in GitHub Actions. Paste the public key into `tauri.conf.json`. Never regenerate the keypair unless you invalidate all previously distributed binaries.
- Use `tauri-action` with `includeUpdaterJson: true` — it generates the correctly-formatted `latest.json` with the literal `.sig` content, not a URL.
- After generating `update.json` manually, verify the signature value by running: `cargo tauri signer verify --pub-key <pubkey> /path/to/artifact.dmg /path/to/artifact.dmg.sig`.
- All platforms in `update.json` must have valid entries. Tauri validates the entire file before checking the version. A malformed Windows entry blocks the macOS update even if only macOS users are updating.

**Phase:** Auto-updater phase. Set up keypair before the first signed build.

---

### Pitfall D-07: Auto-Updater Doesn't Fire Because Version Wasn't Bumped (or Endpoint Returns Cached Old Version)

**What goes wrong:** You ship a new build with a bug fix but users never receive the update. The updater silently does nothing.

**Why it happens — three root causes:**

1. **Version not bumped:** `tauri.conf.json` still has `"version": "1.0.0"` in `package.version`. The updater checks if the endpoint's `version` is greater than the installed version. If they're equal, no update. Tauri uses semantic version comparison — `1.0.0` is NOT less than `1.0.0`.

2. **Endpoint serves stale cached version:** The `update.json` URL is served through a CDN or GitHub's release CDN. After updating the file, the CDN continues serving the cached old version for minutes or hours. Users who check for updates during this window receive the old JSON and see no update.

3. **Updater check only on app launch, not periodically:** If `tauri-plugin-updater` is only called once at startup, users who leave the app running indefinitely (system tray app!) never check for updates until they manually quit and relaunch.

**Prevention:**
- Bump `version` in `tauri.conf.json` as part of the release process. Consider automating this with a release script that bumps the version, commits, tags, and triggers CI.
- When using GitHub Releases for `update.json` hosting: add a `?v={{current_version}}` query parameter or use a version-specific URL to bust CDN caches: `https://github.com/user/repo/releases/download/v{{new_version}}/latest.json`.
- For a system tray app (always-on), implement a periodic update check: call `check()` on app startup AND on a 24-hour timer. Use `tauri-plugin-updater`'s async API with a background task.
- The endpoint URL in `tauri.conf.json` supports `{{current_version}}`, `{{target}}`, and `{{arch}}` template variables. Use them to build a server-side check that can return `204 No Content` when no update is available, which is more efficient than serving a static file.

**Phase:** Auto-updater phase AND release process definition.

---

### Pitfall D-08: Windows SmartScreen Warning Scares Beta Users Away

**What goes wrong:** Beta users on Windows download the installer, double-click it, and see: "Windows protected your PC — Microsoft Defender SmartScreen prevented an unrecognized app from starting." Most non-technical users stop here and do not click "More info → Run anyway."

**Why it happens:** SmartScreen assigns reputation based on how many users have downloaded and run an app signed with a specific certificate. A brand-new certificate — even a valid OV (Organization Validated) code signing certificate — has zero reputation. SmartScreen shows a warning until enough downloads accumulate. This is not a signing failure; the app IS signed correctly. It is a reputation cold-start problem.

**EV vs OV distinction (post-June 2023):**
- Before June 2023, EV (Extended Validation) certificates granted immediate SmartScreen reputation.
- After March 2024, Microsoft changed this behavior. EV certificates no longer guarantee instant reputation bypass; they reduce warnings but do not eliminate them for brand-new certificates.
- OV certificates (the most accessible option) almost always trigger the warning for new apps.

**Azure Trusted Signing (Microsoft's recommended path for new apps):**
- Microsoft's own signing service, priced at ~$9.99/month, stores keys in FIPS 140-3 HSMs.
- Does NOT require physical hardware tokens, making it CI-compatible.
- Tauri v2 supports Azure Trusted Signing through the `AZURE_*` environment variables and custom sign command. (Tauri issue #9578 added this in later releases — verify your Tauri version supports it.)
- Still subject to SmartScreen reputation cold-start, but Microsoft has indicated Trusted Signing apps build reputation faster than third-party certificates.

**Prevention:**
- Accept SmartScreen warnings as expected for the first few hundred installs. Include instructions in the beta onboarding email: "Click 'More info' then 'Run anyway' — this is normal for apps not yet recognized by Microsoft."
- For v3.0 closed beta: OV cert + brief warning instructions is the pragmatic path. Chase EV or Azure Trusted Signing for public launch if SmartScreen becomes a real barrier.
- Never ship unsigned on Windows. An unsigned app produces a harder, scarier warning and Windows Defender may quarantine it entirely.
- Sign both the app binary AND the NSIS installer wrapper. If only one is signed, the wrapper triggers an additional warning.

**Phase:** Windows signing phase. Budgeting and cert procurement must happen before the phase begins (EV certs take 1-5 business days for validation; Azure Trusted Signing account setup is faster).

---

### Pitfall D-09: Windows EV Certificate Requires Hardware Token — Incompatible With Cloud CI

**What goes wrong:** You purchase an EV (Extended Validation) code signing certificate and receive a physical USB token in the mail. You can sign locally but CI fails because GitHub Actions' hosted runners have no USB port and cannot access the physical token.

**Why it happens:** As of June 2023, the CA/Browser Forum mandates that all code signing private keys (including OV and EV) be stored on FIPS 140-2 Level 2+ hardware security modules. For EV certificates, CAs ship the keys pre-loaded on a physical USB token (YubiKey, SafeNet, etc.) that cannot be exported or backed up.

**Solutions in priority order:**

1. **Azure Key Vault (Recommended for CI):** Store the certificate in Azure Key Vault (an HSM in the cloud). Use the `relic` tool (open source) or `AzureSignTool` to sign from CI. Tauri v2 docs describe this approach for OV certs acquired after June 2023. Requires an Azure subscription.

2. **Azure Trusted Signing:** Microsoft's fully managed signing service. No physical token. CI-native. ~$9.99/month. No cert procurement from a CA — Microsoft issues the certificate as part of the service. The best option for new apps targeting CI.

3. **Self-hosted runner with USB token:** Physically connect the USB token to a machine you control; run a GitHub Actions self-hosted runner on that machine. Viable for solo developers but adds operational overhead (machine must stay online and connected).

**Prevention:**
- Before purchasing a certificate, decide on the CI signing strategy. If you cannot use Azure Key Vault or a self-hosted runner, Azure Trusted Signing is the friction-free path.
- OV certificates acquired before June 2023 can be exported as `.pfx` / `.p12` and base64-encoded as a GitHub secret — the legacy approach that works for cloud CI. These certificates are no longer issued; if you don't have one, use Azure Key Vault or Azure Trusted Signing.

**Phase:** Windows signing phase. Certificate and infrastructure decisions must happen before the phase starts, not during it.

---

### Pitfall D-10: Cloudflare Worker KV — Missing `preview_id` Blocks Local Development After Adding Production Namespace

**What goes wrong:** You create the production KV namespace, add its ID to `wrangler.toml`, and then `wrangler dev` fails with: "In development, you should use a separate KV namespace than the one you'd use in production." Or worse — `wrangler dev` silently reads from the production namespace, and you accidentally write test data into production.

**Why it happens:** Wrangler requires a separate `preview_id` for the KV namespace used during `wrangler dev`. The production `id` is used for `wrangler deploy`. Without `preview_id`, Wrangler refuses to start in dev mode (as a protection against accidental production writes).

**Correct `wrangler.toml` structure:**
```toml
name = "ai-buddy-proxy"
main = "src/index.ts"
compatibility_date = "2024-01-01"

kv_namespaces = [
  { binding = "RATE_LIMITS", id = "abc123productionid", preview_id = "xyz789previewid" }
]
```

Create the preview namespace:
```bash
wrangler kv:namespace create "RATE_LIMITS" --preview
# Returns: preview_id = "xyz789previewid"
```

**Additional KV pitfall — bindings not inherited by environments:** If `wrangler.toml` uses `[env.production]` sections, KV bindings defined at the top level are NOT inherited by the environment section. You must redeclare them:
```toml
[env.production]
kv_namespaces = [
  { binding = "RATE_LIMITS", id = "abc123productionid" }
]
```

**Prevention:**
- Create both the production namespace and the preview namespace before writing any Worker code that touches KV. Run `wrangler deploy --dry-run` to verify the binding resolves before actual deployment.
- The binding name in `wrangler.toml` (e.g., `RATE_LIMITS`) must exactly match the variable name used in the Worker code (`env.RATE_LIMITS.get(...)`). A name mismatch causes a runtime `TypeError: Cannot read properties of undefined` in production but works in local mode (where Wrangler uses an in-memory KV stub).
- After deploying, verify the binding is live: use the Cloudflare dashboard Workers → your worker → Settings → Variables and Bindings.

**Phase:** Cloudflare Worker deploy phase.

---

### Pitfall D-11: Cloudflare Worker KV Namespace ID Placeholder Left in wrangler.toml

**What goes wrong:** The Worker deploys successfully (no build error), but at runtime, all KV reads return `null` and writes silently fail. Rate limiting is bypassed. User sessions that should be tracked are not.

**Why it happens:** The AI Buddy codebase already has a documented "PRODUCTION REQUIRED" banner in `wrangler.toml` noting that the KV namespace ID is missing. If this placeholder is never filled in before `wrangler deploy`, Cloudflare may create an empty binding or reject the binding — behavior depends on the Wrangler version. In some versions, an empty `id = ""` deploys without error but the KV binding is non-functional.

**Prevention:**
- Add a CI check: `grep -q 'PRODUCTION_REQUIRED' wrangler.toml && echo "ERROR: KV namespace ID not set" && exit 1`. This fails the CI job if the placeholder is still present.
- The `wrangler deploy` command itself may warn about empty IDs in newer Wrangler versions, but do not rely on this — verify the namespace ID is populated before deploying.
- After deploying, make a test request to the Worker that performs a KV `put` followed by a `get`. Verify the returned value matches what was written.

**Phase:** Cloudflare Worker deploy phase. This is day-one of the phase — fill in the placeholder before writing any other Worker code.

---

### Pitfall D-12: CI Build Matrix Secrets Leak Between Platforms / Secrets Not Scoped Correctly

**What goes wrong:** The Windows build job inadvertently has access to macOS Apple ID credentials. Or macOS notarization fails because a Windows-only secret is incorrectly named and shadows the macOS credential. Or the private key for the updater is not passed to all build jobs, so one platform's artifacts are unsigned.

**Why it happens:** GitHub Actions secrets are global to the repository by default. In a matrix build, all jobs share the same secrets namespace. If secrets are not referenced explicitly in each job's `env:` block, some jobs may not have the variables they need, or may receive the wrong value.

**Required secrets per platform:**

macOS build job:
- `APPLE_CERTIFICATE` (base64 `.p12`)
- `APPLE_CERTIFICATE_PASSWORD`
- `APPLE_SIGNING_IDENTITY`
- `APPLE_API_KEY`
- `APPLE_API_ISSUER`
- `APPLE_API_KEY_BASE64` (decoded to a file at build time)
- `APPLE_TEAM_ID`
- `TAURI_SIGNING_PRIVATE_KEY` (updater)
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` (if key is password-protected)

Windows build job:
- `WINDOWS_CERTIFICATE` (base64 `.pfx` or Azure Key Vault credentials)
- `WINDOWS_CERTIFICATE_PASSWORD`
- `TAURI_SIGNING_PRIVATE_KEY` (updater)
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`

**Critical:** `TAURI_SIGNING_PRIVATE_KEY` must be identical across all platform jobs. The public key embedded in `tauri.conf.json` corresponds to one specific private key. If the macOS build uses a different private key than the Windows build, the `update.json` will contain mismatched signatures, and some platform's users will get `UnexpectedKeyId` on update.

**Prevention:**
- Define `TAURI_SIGNING_PRIVATE_KEY` once globally. Use it in all build jobs without modification.
- Use `fail-fast: false` in the build matrix so a Windows signing failure does not cancel an in-progress macOS notarization (which takes minutes of non-refundable time).
- Set explicit `timeout-minutes: 30` on the notarization step specifically.
- GitHub token must have write permissions for creating releases. Default `GITHUB_TOKEN` is read-only in fork PRs — configure `permissions: contents: write` in the workflow.

**Phase:** CI/CD setup phase. Design the workflow YAML before buying any certificates.

---

### Pitfall D-13: Developer ID Certificate Expiration Silently Breaks Future Builds

**What goes wrong:** 5 years from now (or in your case, 5 years from when you created the Developer ID certificate), `cargo tauri build` suddenly fails with a signing error. Or worse: it succeeds but produces an app that Gatekeeper immediately rejects on user machines.

**Why it happens:** Apple Developer ID Application certificates expire after 5 years. Once expired, they cannot sign new binaries. However, previously signed and notarized binaries remain valid because their notarization tickets were stapled before expiry (and the ticket is not time-limited — only the signing validity window matters for notarization).

**Prevention:**
- Set a calendar reminder for 6 months before the certificate's expiration date. The certificate's expiration date is visible in Keychain Access or `security find-certificate -a -c "Developer ID Application"`.
- When renewing, generate a new certificate via the Apple Developer portal. The new certificate has the same Team ID but a new signing identity string. Update the `APPLE_SIGNING_IDENTITY` secret and `APPLE_CERTIFICATE` secret in CI.
- After renewing, all new builds must be signed with the new certificate. Old builds remain valid (they're already stapled). Users must update to a new build signed with the new certificate before the old certificate expires from a renewal standpoint.

**Phase:** Ongoing operational concern. Document the expiry date in `PROJECT.md` or a `CERTIFICATES.md` operations doc.

---

### Pitfall D-14: Tauri v2 `macOSPrivateApi: true` Permanently Disqualifies App from Mac App Store

**What goes wrong:** This is an existing constraint documented in the v1.0 pitfalls but carries forward as a deployment decision: setting `macOSPrivateApi: true` in `tauri.conf.json` (required for the Tauri overlay to appear above other windows without App Sandbox restrictions) permanently prevents Mac App Store submission.

**Current status for AI Buddy:** The overlay requires `NSWindowLevel` overrides (NSFloatingWindowLevel or above) to appear over other apps. This is achievable without `macOSPrivateApi: true` in most cases — but if `macOSPrivateApi` is true in the current codebase, distribution is limited to Developer ID (direct download), not Mac App Store.

**For v3.0 closed beta this is acceptable.** Direct download via a signed DMG with Developer ID is the correct distribution model for this app. Do not attempt App Store submission for v3.0.

**Phase:** Not a phase risk — a documented architectural constraint. Distribution model: direct download only.

---

## Phase-Specific Warnings for v3.0

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|----------------|------------|
| macOS signing setup | App crashes after notarization (JIT) | Add Entitlements.plist with JIT entitlements before first signing attempt (D-01) |
| macOS signing setup | Screen capture silently denied | Add NSScreenCaptureUsageDescription to Info.plist (D-02) |
| macOS signing setup | Paid developer account not ready | $99/year Apple Developer Program membership is a hard requirement — procure before starting the phase (D-04) |
| macOS notarization CI | Build hangs for 60+ minutes | App Store Connect API credentials in CI, explicit 30-min timeout on notarization step (D-04) |
| macOS notarization CI | Apple ID secrets missing or wrong format | 7 specific secrets needed — verify all are present before first CI run (D-04, D-12) |
| DMG distribution | Gatekeeper rejects DMG despite notarized .app | Notarize AND staple the DMG separately, after stapling the .app (D-05) |
| Beta updates | TCC permission reset on every update | Use stable Developer ID cert; include reset instructions in beta onboarding (D-03) |
| Auto-updater keypair | InvalidSignature / UnexpectedKeyId | One keypair, generated once, private key in CI secret, public key in tauri.conf.json (D-06) |
| Auto-updater JSON | Signature field is URL not content | Paste literal .sig file content into signature field; use tauri-action to generate automatically (D-06) |
| Auto-updater trigger | Update never fires | Always bump version in tauri.conf.json; periodic check for system tray app (D-07) |
| Windows signing | SmartScreen warning scares users | Acceptable for closed beta; include "More info → Run anyway" instructions in onboarding (D-08) |
| Windows signing CI | EV cert hardware token incompatible with cloud CI | Use Azure Key Vault or Azure Trusted Signing instead of physical USB token (D-09) |
| Cloudflare Worker | KV namespace ID placeholder not filled | Fill placeholder before any deploy; add CI check for placeholder string (D-11) |
| Cloudflare Worker | Missing preview_id blocks local dev | Create preview namespace immediately after production namespace (D-10) |
| Cloudflare Worker | KV bindings not inherited by environment sections | Redeclare bindings in [env.production] section explicitly (D-10) |
| CI/CD setup | TAURI_SIGNING_PRIVATE_KEY mismatch between platforms | One key, used identically in macOS and Windows jobs (D-12) |
| CI/CD setup | GITHUB_TOKEN read-only, can't create release | Set permissions: contents: write in workflow YAML (D-12) |
| CI/CD setup | macOS notarization cancelled by fail-fast when Windows fails | Set fail-fast: false in matrix strategy (D-12) |

---

## Prior Pitfalls (v1.0 and v2.0 — Retained for Reference)

The pitfalls documented in v1.0 and v2.0 remain relevant and are not superseded by v3.0 additions. The full text is below.

---

## v2.0 Critical Pitfalls

These are the mistakes most likely to cause regressions in the working v1.0 system or require significant rework on v2 features.

---

### Pitfall V2-1: Async Classification Arrival After State Has Already Changed

**What goes wrong:** In `submitIntent`, the app calls `prepareGuidanceContext(intent)` to get tier/taskLabel before starting the stream. If the user submits a new query before the classification resolves (rapid successive submissions), or presses the Close/hide shortcut while classification is pending, the classification result arrives and mutates `currentTier` / `taskLabel` for the wrong query or into an already-aborted request.

**Prevention:** Gate classification result application on a request ID. Increment a counter on every `submitIntent`. After `await prepareGuidanceContext()`, check if the closed-over ID still matches current; if not, discard.

**Phase relevance:** Any phase that modifies `submitIntent` or adds async steps before streaming begins.

---

### Pitfall V2-2: Conversation Continuity Context Window Bloat

**What goes wrong:** Naively appending screenshots to every history turn. A 10-turn session with screenshots reaches 100K+ input tokens.

**Prevention:** Text-only history for prior turns. Cap history depth at 3-5 turns. Screenshot only in the current turn.

**Phase relevance:** Conversation continuity phase.

---

### Pitfall V2-3: App Detection — macOS Requires Accessibility Permission for Window Title

**What goes wrong:** `NSWorkspace` gives bundle name without permission. Window title requires Accessibility API. Conflating the two triggers unexpected permission dialogs.

**Prevention:** Bundle name only via NSWorkspace; treat window title as best-effort. Design app detection to work with bundle name alone.

**Phase relevance:** App detection phase.

---

### Pitfall V2-4: Multi-Monitor Mixed Physical/Logical Coordinate Bug

**What goes wrong:** On Retina + non-Retina multi-monitor setups, `available_monitors()` reports incorrect `PhysicalPosition` for the secondary monitor. Overlay opens on wrong monitor.

**Prevention:** Use `available_monitors()` + cursor position range check. Fix existing mixed-unit pattern in `window.rs` first.

**Phase relevance:** Multi-monitor phase.

---

### Pitfall V2-5: Step Tracker Broken by AI Output Variability During Streaming

**What goes wrong:** Step count unknown until stream ends. Live parsing produces flickering count. Sub-bullets counted as steps. Tier 3 (hints-only) responses produce 0 steps.

**Prevention:** Parse steps from final completed text only (`onDone`). Hide tracker for tier 3 or when no steps detected.

**Phase relevance:** Step tracking phase.

---

### Pitfall V2-6: Breaking the Existing Streaming Flow by Modifying contentState Transitions

**What goes wrong:** `contentState` is a 6-state machine. Adding new states or transitions without mapping the full diagram breaks abort logic, causes double submissions, or flashes empty state.

**Prevention:** Treat as a formal state machine. Use `batch()` for atomic signal mutations. Map all transitions before adding new states.

**Phase relevance:** Every v2 phase that touches `SidebarShell` or `GuidanceList`.

---

## v1.0 Critical Pitfalls (Retained for Reference)

### Pitfall 1: macOS Screen Recording Permission Breaks on App Update

Every new signed binary = new code signature hash = permission revoked silently. Build permission check + repair flow.

### Pitfall 2: macOS Private API Requirement Locks Out App Store

`macOSPrivateApi: true` permanently disqualifies from Mac App Store. Direct distribution is the only path.

### Pitfall 3: Overlay Invisible Over Fullscreen Apps

NSWindowLevel override required for fullscreen app visibility. Test against Figma fullscreen, Final Cut Pro.

### Pitfall 4: CPU Polling for Click-Through

60fps Rust cursor poll for `setIgnoreCursorEvents`. Add idle detection at 10fps when cursor stationary.

### Pitfall 5: xcap Active Bugs

Hang on macOS (#209), memory leak on M4 (#203). Abstract the capture interface for swap-out. Pin version.

### Pitfall 6: Voice Latency Stack

825ms–2100ms total. Requires streaming STT + streaming Claude + streaming TTS from first integration.

### Pitfall 7: Claude Vision Hallucination on Compact UI

Small icons misidentified. Use directional language; require region selection for precise guidance.

### Pitfall 8: Learning Memory Schema Lock-In

No migrations = data loss on schema change. Use rusqlite migrations + event sourcing from first schema.

### Pitfall 9: API Proxy Without Per-User Rate Limiting

Installation token + Cloudflare WAF rate limit required before public access.

### Pitfall 10: WebView2 Not Pre-Installed on Windows 10

Bundle WebView2 bootstrapper in NSIS installer.

---

## Sources

- Tauri v2 macOS Code Signing: https://v2.tauri.app/distribute/sign/macos/
- Tauri v2 Windows Code Signing: https://v2.tauri.app/distribute/sign/windows/
- Tauri v2 Updater Plugin: https://v2.tauri.app/plugin/updater/
- Tauri v2 GitHub CI Pipeline: https://v2.tauri.app/distribute/pipelines/github/
- Tauri v2 macOS Application Bundle: https://v2.tauri.app/distribute/macos-application-bundle/
- Tauri GitHub issue #10567 — macOS permissions not stored between updates: https://github.com/tauri-apps/tauri/issues/10567
- Tauri GitHub issue #9565 — V2 updater InvalidSignature: https://github.com/tauri-apps/tauri/issues/9565
- Tauri GitHub issue #10316 — UnexpectedKeyId: https://github.com/tauri-apps/tauri/issues/10316
- Tauri GitHub discussion #12692 — Updater always raises InvalidSignature: https://github.com/orgs/tauri-apps/discussions/12692
- Tauri GitHub issue #9578 — Azure Trusted Signing support: https://github.com/tauri-apps/tauri/issues/9578
- Tauri GitHub issue #7188 — Windows EV cert hardware token CI: https://github.com/tauri-apps/tauri/issues/7188
- Apple Hardened Runtime documentation: https://developer.apple.com/documentation/security/hardened-runtime
- Apple Resolving common notarization issues: https://developer.apple.com/documentation/security/resolving-common-notarization-issues
- Apple Configuring the Hardened Runtime: https://developer.apple.com/documentation/xcode/configuring-the-hardened-runtime
- Apple ScreenCaptureKit TCC discussion: https://developer.apple.com/forums/thread/760483
- Sequoia screen recording prompt changes: https://mjtsai.com/blog/2024/08/08/sequoia-screen-recording-prompts-and-the-persistent-content-capture-entitlement/
- xcap issue #138 — screen capture permission check: https://github.com/nashaofu/xcap/issues/138
- Cloudflare KV namespaces: https://developers.cloudflare.com/kv/concepts/kv-namespaces/
- Cloudflare KV bindings: https://developers.cloudflare.com/kv/concepts/kv-bindings/
- Cloudflare KV environments: https://developers.cloudflare.com/kv/reference/environments/
- Cloudflare Workers wrangler configuration: https://developers.cloudflare.com/workers/wrangler/configuration/
- Cloudflare workers-sdk issue #3062 — local KV error: https://github.com/cloudflare/workers-sdk/issues/3062
- Wrangler legacy issue #1458 — preview_id error message: https://github.com/cloudflare/wrangler-legacy/issues/1458
- EV cert signing on GitHub Actions (Melatonin blog): https://melatonin.dev/blog/how-to-code-sign-windows-installers-with-an-ev-cert-on-github-actions/
- Scott Hanselman — Azure Trusted Signing: https://www.hanselman.com/blog/automatically-signing-a-windows-exe-with-azure-trusted-signing-dotnet-sign-and-github-actions
- Signing and Notarizing Tauri Apps (December 2024 guide): https://loewald.com/blog/2024/12/18/signing-and-notarizing-tauri-apps
- Tauri v2 Ship guide (DEV Community): https://dev.to/tomtomdu73/ship-your-tauri-v2-app-like-a-pro-code-signing-for-macos-and-windows-part-12-3o9n
- Tauri v2 GitHub Actions automation: https://dev.to/tomtomdu73/ship-your-tauri-v2-app-like-a-pro-github-actions-and-release-automation-part-22-2ef7
- tauri-plugin-macos-permissions: https://crates.io/crates/tauri-plugin-macos-permissions
- SolidJS stale signal in async: https://github.com/solidjs/solid/issues/2180
- Tauri multi-monitor physical position bug (macOS): https://github.com/tauri-apps/tauri/issues/7890
