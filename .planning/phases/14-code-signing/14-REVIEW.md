---
phase: 14-code-signing
reviewed: 2026-04-14T00:00:00Z
depth: standard
files_reviewed: 5
files_reviewed_list:
  - src-tauri/entitlements.plist
  - src-tauri/Info.plist
  - src-tauri/tauri.conf.json
  - scripts/sign-and-notarize.sh
  - docs/windows-beta-install.md
findings:
  critical: 1
  warning: 4
  info: 3
  total: 8
status: issues_found
---

# Phase 14: Code Review Report

**Reviewed:** 2026-04-14
**Depth:** standard
**Files Reviewed:** 5
**Status:** issues_found

## Summary

Phase 14 adds macOS code signing infrastructure: entitlements.plist, Info.plist usage descriptions, `signingIdentity` in tauri.conf.json, a sign-and-notarize pipeline script, and a Windows beta install guide for SmartScreen bypass.

The signing pipeline itself is structurally sound — `set -euo pipefail`, required env var validation, and the staple/validate/verify sequence are all correct. The entitlements set is appropriate for a Tauri WKWebView app.

Three issues require attention before shipping: (1) the updater `pubkey` in tauri.conf.json is a placeholder instruction string — if this config ships to users, the auto-updater will be non-functional or exploitable; (2) the CSP is missing `connect-src`, which will block API calls from the WebView in production; (3) a missing `com.apple.security.network.client` entitlement may silently prevent outbound network connections on macOS under Hardened Runtime. One user-facing document contains an unfilled placeholder URL.

---

## Critical Issues

### CR-01: Updater Public Key Is a Placeholder String

**File:** `src-tauri/tauri.conf.json:71`
**Issue:** The `pubkey` field in the updater config contains the literal instruction text `"PRODUCTION REQUIRED — run: cargo tauri signer generate ..."` rather than an actual Ed25519 public key. Tauri's updater plugin uses this key to verify update signatures. Shipping this config means one of two outcomes: (a) the updater rejects all updates because the key is invalid, breaking auto-update entirely; or (b) if the plugin fails open on invalid key format, it could accept unsigned/malicious update payloads. Either outcome is unacceptable for a production binary.

**Fix:** Generate the real signing key before any release build and substitute the actual public key:
```bash
cargo tauri signer generate -w ~/.tauri/ai-buddy.key
# Paste the printed public key (base64 string) into tauri.conf.json "pubkey"
# Store ~/.tauri/ai-buddy.key securely — never commit it
```

The `pubkey` field should look like:
```json
"pubkey": "dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYy..."
```

If auto-update is not active for beta, remove the `updater` plugin block entirely from `tauri.conf.json` to eliminate the dead configuration.

---

## Warnings

### WR-01: CSP Missing `connect-src` — API Calls Blocked in WebView

**File:** `src-tauri/tauri.conf.json:48`
**Issue:** The Content Security Policy is `default-src 'self'; style-src 'self' 'unsafe-inline'`. This `default-src 'self'` blocks all outbound network requests from the WebView (fetch, XHR, WebSocket). The frontend JavaScript makes calls to the Cloudflare Worker proxy (Claude, AssemblyAI, ElevenLabs endpoints). Without an explicit `connect-src` directive allowing those origins, these requests will be blocked by Tauri's WebView CSP enforcement in production builds.

Note: `tauri dev` may not enforce CSP the same way a bundled build does, so this can appear to work in development but fail silently in release.

**Fix:** Add a `connect-src` directive covering the Cloudflare Worker domain:
```json
"csp": "default-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self' https://your-worker.workers.dev wss://api.assemblyai.com"
```

Replace `your-worker.workers.dev` with the actual Worker URL. If the Worker domain is not yet finalized, use `https://*.workers.dev` as a temporary scope and tighten before v1.0.

---

### WR-02: Missing `com.apple.security.network.client` Entitlement

**File:** `src-tauri/entitlements.plist`
**Issue:** The entitlements file enables microphone access and JIT/memory entitlements but does not include `com.apple.security.network.client`. Under Hardened Runtime (which is required for notarization), outbound network access from the app process requires this entitlement. The app makes HTTP/WebSocket connections to Cloudflare Worker, AssemblyAI, and ElevenLabs. Without this entitlement, connections may be silently refused by the OS sandbox on some macOS versions or configurations.

The WKWebView (frontend) has its own process entitlements and is typically exempt, but the Rust backend (reqwest, tokio-tungstenite) runs in the main app process and will be affected.

**Fix:** Add the network client entitlement:
```xml
<!-- Required for outbound HTTP/WebSocket connections from Rust backend -->
<key>com.apple.security.network.client</key>
<true/>
```

---

### WR-03: `disable-library-validation` Weakens Hardened Runtime Meaningfully

**File:** `src-tauri/entitlements.plist:16-17`
**Issue:** `com.apple.security.cs.disable-library-validation` allows the app to load dylibs that are not signed by the same team certificate or Apple. When combined with `com.apple.security.cs.allow-dyld-environment-variables` (line 13), an attacker with local access can inject arbitrary code into the app process via `DYLD_INSERT_LIBRARIES`. This is a known Hardened Runtime bypass when both entitlements are present together.

For a Tauri v2 app, `disable-library-validation` is sometimes needed for loading bundled dylibs. If Tauri actually requires it, this is an accepted tradeoff — but it should be verified rather than assumed.

**Fix:** Test the signed build without `disable-library-validation` first:
1. Remove the `disable-library-validation` key from entitlements.plist
2. Run `cargo tauri build` and test that the app launches correctly
3. Only re-add if the build fails to launch or logs dylib validation errors

If it is required, document the specific dylib that requires it (e.g., in a comment) so future maintainers understand the scope of the exception.

---

### WR-04: DMG Discovery Silently Picks First Match — Wrong Artifact Risk

**File:** `scripts/sign-and-notarize.sh:38`
**Issue:** The DMG path is resolved with:
```bash
DMG_PATH=$(ls target/release/bundle/macos/*.dmg 2>/dev/null | head -1)
```

If the build directory contains multiple DMGs (e.g., from previous builds or both `x86_64` and `aarch64` variants), `head -1` silently picks the first one alphabetically. The wrong DMG could be stapled and shipped without any error or warning.

**Fix:** Fail explicitly if multiple DMGs are found:
```bash
DMG_COUNT=$(ls target/release/bundle/macos/*.dmg 2>/dev/null | wc -l | tr -d ' ')
if [ "$DMG_COUNT" -eq 0 ]; then
  echo "ERROR: No DMG found in target/release/bundle/macos/. Build may have failed."
  exit 1
elif [ "$DMG_COUNT" -gt 1 ]; then
  echo "ERROR: Multiple DMGs found. Clean build directory and retry:"
  ls target/release/bundle/macos/*.dmg
  exit 1
fi
DMG_PATH=$(ls target/release/bundle/macos/*.dmg)
```

---

## Info

### IN-01: Placeholder GitHub URL in User-Facing Document

**File:** `docs/windows-beta-install.md:19`
**Issue:** The document contains a literal placeholder URL: `https://github.com/[your-github-org]/ai-buddy/releases`. This is the canonical download source cited for user safety — users are told to only install from this URL. If distributed with the placeholder unfilled, it provides no actionable guidance and undermines the safety messaging.

**Fix:** Replace with the actual GitHub organization URL before distributing:
```markdown
`https://github.com/YOUR-ORG/ai-buddy/releases`
```

---

### IN-02: Apple ID Echoed to Terminal Output

**File:** `scripts/sign-and-notarize.sh:30`
**Issue:** The script prints `Apple ID: $APPLE_ID` to stdout. While the Apple ID itself is not a secret (it is an email address), it may appear in CI logs if this script is adapted for GitHub Actions. CI logs are sometimes accessible to collaborators who should not see account details.

**Fix:** Either omit the Apple ID from the echo, or in CI contexts ensure the log line is masked. The `APPLE_PASSWORD` is correctly not echoed (good). For consistency:
```bash
echo "    Apple ID: [set]"
```

---

### IN-03: `signingIdentity` Hardcoded in Committed Config

**File:** `src-tauri/tauri.conf.json:64`
**Issue:** The signing identity `"Developer ID Application: Oreski Group LLC (8Q87GSTTX3)"` including the Team ID `8Q87GSTTX3` is hardcoded in the committed config file. The Team ID is not a secret (it appears in signed binaries), but hardcoding it creates friction if the signing certificate is ever rotated or if another developer needs to build with their own identity during development.

**Fix (optional):** Consider using an environment variable substitution pattern or a separate `tauri.macos.conf.json` override file that is gitignored for CI, keeping `tauri.conf.json` with a placeholder for local development. This is a low-priority ergonomic concern — the current approach is common in Tauri projects and not a security risk.

---

_Reviewed: 2026-04-14_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
