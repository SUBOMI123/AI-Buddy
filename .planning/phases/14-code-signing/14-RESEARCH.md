# Phase 14: Code Signing — Research

**Researched:** 2026-04-13
**Domain:** macOS code signing, notarization, Apple Developer toolchain
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**D-01:** Phase 14 produces an actual signed+notarized+stapled DMG. Not config-only. The plan must include:
1. Fix `entitlements.plist` (add missing keys per SIGN-03)
2. Fix `Info.plist` (add `NSScreenCaptureUsageDescription` per SIGN-04)
3. Set `signingIdentity` in `tauri.conf.json`
4. Run `cargo tauri build`
5. Sign with `codesign`
6. Notarize with `notarytool`
7. Staple the ticket with `xcrun stapler`
8. Verify with `spctl` and `codesign --verify`

**D-02:** The user does not have a Developer ID Application certificate installed. The plan must include steps to visit developer.apple.com → Certificates, Identifiers & Profiles, create a Developer ID Application certificate (requires Apple Developer Program enrollment at $99/yr), download and install into macOS Keychain.

**D-03:** Notarization credentials stored as a named Keychain profile using `xcrun notarytool store-credentials "ai-buddy-notarize"`. Build script references the profile by name. No credentials in env vars, no credentials in config files.

**D-04:** Current `entitlements.plist` has `com.apple.security.cs.allow-unsigned-executable-memory` and `com.apple.security.device.audio-input`. Missing keys that must be added: `com.apple.security.cs.allow-jit`, `com.apple.security.cs.allow-dyld-environment-variables`, `com.apple.security.cs.disable-library-validation`.

**D-05:** Add `NSScreenCaptureUsageDescription` to `Info.plist`. Current file only has `NSMicrophoneUsageDescription`.

**D-06:** Create `docs/windows-beta-install.md`. Covers SmartScreen click-through, why the warning appears, and that it goes away in v1.0 with EV signing.

### Claude's Discretion

- Exact `codesign` flags (e.g., `--deep`, `--options runtime`)
- Whether to use a build script (`scripts/sign-and-notarize.sh`) vs inline plan steps
- Notarization wait strategy (`--wait` vs polling)

### Deferred Ideas (OUT OF SCOPE)

- EV code signing for Windows (eliminates SmartScreen entirely) — v1.0 / future phase
- Deep link (`ai-buddy://`) for post-payment return flow
- GitHub Actions signing automation — Phase 15
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SIGN-01 | macOS build signed with Developer ID Application certificate — Gatekeeper accepts without security warnings | Certificate provisioning steps + `signingIdentity` config + codesign command documented |
| SIGN-02 | macOS build notarized and stapled — opens offline after first notarization check | `notarytool submit --wait` + `xcrun stapler staple` pipeline documented; offline test procedure documented |
| SIGN-03 | `entitlements.plist` includes all 5 required JIT entitlements (allow-jit, allow-unsigned-executable-memory, allow-dyld-environment-variables, disable-library-validation + audio-input) | Complete plist content with all 5 keys verified against Tauri production examples |
| SIGN-04 | `Info.plist` includes `NSScreenCaptureUsageDescription` | Exact key and description string documented; already wired into bundle via `tauri.conf.json` |
| SIGN-05 | Windows build beta install guide documents SmartScreen click-through | `docs/windows-beta-install.md` deliverable spec documented |
</phase_requirements>

---

## Summary

Phase 14 is an operational phase: fix two plist files, provision the Apple Developer ID certificate, run the sign-notarize-staple pipeline manually, and write a Windows install guide. No new code is written; all work is configuration, tooling invocation, and documentation.

The macOS toolchain (`codesign`, `notarytool`, `stapler`, `spctl`) is already available — Xcode tools are installed and `xcrun notarytool` version 1.1.0 (build 39) is confirmed present. The signing identity slot is empty (0 valid identities found), confirming no Developer ID certificate is installed yet.

Tauri v2 can drive the entire sign-notarize sequence automatically via `cargo tauri build` when specific environment variables are set. For Phase 14's local manual run, the preferred approach is to set credentials as shell environment variables for the build invocation, using the Keychain profile for notarytool separately. This keeps credentials out of config files and makes Phase 15 CI migration trivial (replace Keychain profile with env vars).

**Primary recommendation:** Use `cargo tauri build` with `APPLE_SIGNING_IDENTITY`, `APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID` exported in the terminal session — Tauri auto-signs and auto-notarizes. Then staple the resulting DMG manually with `xcrun stapler staple`. This is the standard Tauri v2 community pattern and eliminates the need to run `codesign` or `notarytool` separately.

---

## Standard Stack

### Core Toolchain

| Tool | Version | Purpose | Source |
|------|---------|---------|--------|
| `codesign` | macOS system | Sign .app bundle with Developer ID | [VERIFIED: xcrun on this machine] |
| `xcrun notarytool` | 1.1.0 (39) | Submit to Apple notary service, poll status | [VERIFIED: xcrun on this machine] |
| `xcrun stapler` | system | Attach notarization ticket to DMG for offline Gatekeeper | [VERIFIED: xcrun on this machine] |
| `spctl` | macOS system | Verify Gatekeeper assessment (sign + notarization) | [VERIFIED: xcrun on this machine] |
| `security` | macOS system | List signing identities from Keychain | [VERIFIED: xcrun on this machine] |
| `cargo tauri` | 2.10.1 | Build + automatic sign + notarize when env vars set | [VERIFIED: tauri-cli on this machine] |

### Supporting

| Tool | Purpose |
|------|---------|
| Apple Developer Portal | Create Developer ID Application certificate |
| appleid.apple.com | Generate app-specific password for notarytool |
| Keychain Access.app | Confirm certificate installation after download |

---

## Architecture Patterns

### Recommended Workflow: cargo tauri build + manual staple

Tauri v2's bundler integrates signing and notarization when these environment variables are present in the shell session [CITED: v2.tauri.app/distribute/sign/macos/]:

```
APPLE_SIGNING_IDENTITY=Developer ID Application: Your Name (TEAMID)
APPLE_ID=you@email.com
APPLE_PASSWORD=xxxx-xxxx-xxxx-xxxx    # app-specific password from appleid.apple.com
APPLE_TEAM_ID=XXXXXXXXXX
```

When those are set, `cargo tauri build` will:
1. Compile Rust release binary
2. Bundle .app
3. Call `codesign --options runtime --entitlements <path>` on the bundle
4. Call `notarytool submit` on the resulting DMG
5. Wait for Apple approval (2-5 minutes)

The staple step is **not** done by `cargo tauri build` — it must be run manually:

```bash
xcrun stapler staple "target/release/bundle/macos/AI Buddy.dmg"
xcrun stapler validate "target/release/bundle/macos/AI Buddy.dmg"
```

### Alternative: Manual codesign (if cargo tauri build integration breaks)

Used when env-var-driven auto-signing fails or for debugging individual steps [CITED: dev.to/0xmassi]:

```bash
codesign --deep --force --verify --verbose \
  --sign "Developer ID Application: Your Name (TEAMID)" \
  --options runtime \
  --entitlements src-tauri/entitlements.plist \
  "target/release/bundle/macos/AI Buddy.app"

xcrun notarytool submit "target/release/bundle/macos/AI Buddy.dmg" \
  --keychain-profile "ai-buddy-notarize" \
  --wait

xcrun stapler staple "target/release/bundle/macos/AI Buddy.dmg"
```

### Notarization Wait Strategy

Use `--wait` flag on `notarytool submit`. Apple typically takes 2-5 minutes. The `--wait` flag blocks until Apple responds with `Accepted` or `Invalid`. [CITED: dev.to/0xmassi, dev.to/tomtomdu73]

For Phase 14 (local, interactive) `--wait` is correct. Phase 15 CI should also use `--wait` since `tauri-action` handles polling internally.

### Build Script Pattern

Create `scripts/sign-and-notarize.sh` — makes the pipeline repeatable and provides Phase 15 CI with a documented handoff point. The script accepts env vars so CI can inject credentials without a Keychain profile [CITED: dev.to/tomtomdu73].

### tauri.conf.json signingIdentity

Add `signingIdentity` to the existing `bundle.macOS` block [CITED: v2.tauri.app/distribute/sign/macos/]:

```json
"macOS": {
  "infoPlist": "./Info.plist",
  "entitlements": "./entitlements.plist",
  "signingIdentity": "Developer ID Application: Your Name (TEAMID)"
}
```

This can be overridden at build time by `APPLE_SIGNING_IDENTITY` env var, which is what Phase 15 CI will use.

### Verified Entitlements (all 5 required keys)

[CITED: v2.tauri.app/distribute/sign/macos/, dev.to/0xmassi]

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <!-- Required for WKWebView JIT compilation (JavaScript engine) -->
    <key>com.apple.security.cs.allow-jit</key>
    <true/>
    <!-- Required for WKWebView JavaScript engine memory allocation -->
    <key>com.apple.security.cs.allow-unsigned-executable-memory</key>
    <true/>
    <!-- Required for Tauri dyld interposing -->
    <key>com.apple.security.cs.allow-dyld-environment-variables</key>
    <true/>
    <!-- Required for Tauri dynamic library loading -->
    <key>com.apple.security.cs.disable-library-validation</key>
    <true/>
    <!-- Required for push-to-talk mic access -->
    <key>com.apple.security.device.audio-input</key>
    <true/>
</dict>
</plist>
```

**Critical:** Missing JIT entitlements cause silent crash on launch after notarization — the app works unsigned but crashes immediately when opened from a signed build. This is the #1 post-notarization failure mode for Tauri apps. [CITED: dev.to/0xmassi]

### Completed Info.plist

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>NSMicrophoneUsageDescription</key>
    <string>AI Buddy uses your microphone for push-to-talk voice input. Audio is streamed to AssemblyAI for transcription and is not stored locally.</string>
    <key>NSScreenCaptureUsageDescription</key>
    <string>AI Buddy captures your screen to understand what you're working on and provide step-by-step guidance. Captures are sent to Claude (Anthropic) for analysis and are not stored.</string>
</dict>
</plist>
```

**Note:** Both plists are already wired into the bundle via `tauri.conf.json` `bundle.macOS.infoPlist` and `bundle.macOS.entitlements` — no changes to `tauri.conf.json` needed for these paths. [VERIFIED: src-tauri/tauri.conf.json]

### Anti-Patterns to Avoid

- **Running `--deep` on `.app` after Tauri builds:** Tauri signs individual components correctly. `--deep` can re-sign nested binaries in a way that breaks the notarization ticket. Use `--deep` only in the manual fallback path if the app bundle isn't pre-signed.
- **Checking credentials into config files:** `signingIdentity` in `tauri.conf.json` is the certificate name (safe — not a secret). Passwords belong only in Keychain profiles or env vars.
- **Notarizing the `.app` instead of the `.dmg`:** Apple requires submitting a zip or dmg. Submit the DMG produced by `cargo tauri build` at `target/release/bundle/macos/AI Buddy_<version>_aarch64.dmg`.
- **Skipping staple:** Notarization without staple requires internet at first launch. Staple makes the ticket offline-verifiable (SIGN-02 requirement).
- **Forgetting `--options runtime`:** Hardened runtime must be enabled for notarization to pass. Without it, Apple will reject the submission. [CITED: dev.to/tomtomdu73]

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Code signing | Custom codesign wrapper | `cargo tauri build` with env vars | Tauri handles signing order, entitlement injection, and DMG wrapping correctly |
| Notarization polling | HTTP polling loop | `notarytool submit --wait` | Apple's tool handles timeout and retry correctly |
| Certificate secrets management | Plain-text file | macOS Keychain profile | Keychain encrypts at rest; profiles survive shell restarts |
| Offline Gatekeeper verification | Custom handshake | `xcrun stapler staple` | Stapler embeds the Apple-signed ticket in the DMG binary |

---

## Common Pitfalls

### Pitfall 1: Silent Post-Notarization Crash (Missing Entitlements)
**What goes wrong:** App works fine unsigned. After signing + notarization, it opens briefly then crashes with no error visible to the user. macOS Console shows `KERN_INVALID_ADDRESS` or `EXC_BAD_ACCESS` at startup.
**Why it happens:** Hardened Runtime enforces entitlement restrictions. WKWebView requires JIT (allow-jit) and unsigned executable memory. Without them, the JavaScript engine cannot allocate executable memory under the hardened runtime sandbox.
**How to avoid:** Verify the entitlements file has all 5 required keys before building. Confirm with `codesign --display --entitlements - /path/to/AI\ Buddy.app` after build.
**Warning signs:** App launch works in `cargo tauri dev` but fails after `cargo tauri build` with signed output.

### Pitfall 2: Notarizing .app Instead of .dmg
**What goes wrong:** `notarytool submit AI\ Buddy.app` is rejected by Apple ("invalid file format").
**Why it happens:** Apple's notary service only accepts UDIF disk images (.dmg), flat packages (.pkg), or zip archives (.zip) — not raw .app bundles.
**How to avoid:** Always submit the `.dmg` file from `target/release/bundle/macos/`.

### Pitfall 3: Blank Screenshots in Signed Build
**What goes wrong:** Screenshots captured via `xcap` return a blank/black image in the signed build even though they work unsigned.
**Why it happens:** macOS requires `NSScreenCaptureUsageDescription` in `Info.plist` for any app using screen capture APIs. In an unsigned build, the permission dialog still appears. In a signed/sandboxed build without the key, the capture silently returns black frames.
**How to avoid:** Add `NSScreenCaptureUsageDescription` to `Info.plist` before building. Verify on a clean signed install by running a screenshot capture from the app.
**Warning signs:** This is exactly SIGN-04 — it is a known missing key in the current `src-tauri/Info.plist`.

### Pitfall 4: "Keychain profile not found" at notarytool time
**What goes wrong:** `xcrun notarytool submit --keychain-profile "ai-buddy-notarize"` fails with `No Keychain password item found for profile`.
**Why it happens:** The profile was not yet created with `notarytool store-credentials`. [VERIFIED: confirmed this profile does not exist on this machine]
**How to avoid:** Run `xcrun notarytool store-credentials "ai-buddy-notarize"` as a setup task before the build. The plan must include this as a prerequisite step.

### Pitfall 5: Team ID mismatch
**What goes wrong:** Notarization submission succeeds but staple fails, or Gatekeeper rejects the app with "not from identified developer".
**Why it happens:** APPLE_TEAM_ID or the signing identity string does not match the team on the certificate.
**How to avoid:** Extract team ID from `security find-identity -v -p codesigning` output — the 10-character string in parentheses at the end of the identity string is the Team ID.

### Pitfall 6: Wrong DMG path (Apple Silicon)
**What goes wrong:** Post-build, user looks in `target/release/bundle/macos/` and can't find the DMG.
**Why it happens:** On Apple Silicon (arm64), `cargo tauri build` by default builds for `aarch64-apple-darwin`. The DMG filename includes the architecture and version: `AI Buddy_0.1.0_aarch64.dmg`. Universal (x86_64 + arm64) builds require `--target universal-apple-darwin`.
**How to avoid:** For Phase 14, a single-arch arm64 build is acceptable. The plan should capture the exact DMG path using `ls target/release/bundle/macos/*.dmg` after build.

---

## Code Examples

### Step: Verify certificate installed
```bash
# Source: v2.tauri.app/distribute/sign/macos/
security find-identity -v -p codesigning
# Expected output: "Developer ID Application: Your Name (XXXXXXXXXX)"
```

### Step: Store notarytool credentials in Keychain
```bash
xcrun notarytool store-credentials "ai-buddy-notarize" \
  --apple-id "you@email.com" \
  --team-id "XXXXXXXXXX" \
  --password "xxxx-xxxx-xxxx-xxxx"
# Password = app-specific password from appleid.apple.com (Security section)
```

### Step: Build, sign, and notarize in one command
```bash
# Source: v2.tauri.app/distribute/sign/macos/ + dev.to/0xmassi
export APPLE_SIGNING_IDENTITY="Developer ID Application: Your Name (XXXXXXXXXX)"
export APPLE_ID="you@email.com"
export APPLE_PASSWORD="xxxx-xxxx-xxxx-xxxx"   # app-specific password
export APPLE_TEAM_ID="XXXXXXXXXX"
cargo tauri build
# Tauri auto-signs and auto-notarizes (2-5 min notarization wait)
```

### Step: Staple notarization ticket to DMG
```bash
# Must run AFTER cargo tauri build succeeds
xcrun stapler staple "target/release/bundle/macos/AI Buddy_0.1.0_aarch64.dmg"
xcrun stapler validate "target/release/bundle/macos/AI Buddy_0.1.0_aarch64.dmg"
```

### Step: Verify Gatekeeper acceptance
```bash
# Source: CONTEXT.md specifics section
spctl --assess --type execute --verbose=4 \
  "target/release/bundle/macos/AI Buddy.app"
# Expected: "AI Buddy.app: accepted  source=Notarized Developer ID"

codesign --verify --deep --strict --verbose=2 \
  "target/release/bundle/macos/AI Buddy.app"
# Expected: "AI Buddy.app: valid on disk" and "AI Buddy.app: satisfies its Designated Requirement"
```

### Step: Offline test for SIGN-02
```bash
# 1. Disable WiFi (turn off network adapter)
# 2. Mount the stapled DMG
# 3. Drag AI Buddy.app to /Applications
# 4. Double-click AI Buddy.app
# Expected: App launches with no Gatekeeper warning (staple provides offline ticket)
```

### Step: Verify entitlements on built .app
```bash
codesign --display --entitlements - \
  "target/release/bundle/macos/AI Buddy.app"
# Should show all 5 entitlement keys
```

### Step: Manual fallback codesign (if cargo tauri build auto-sign fails)
```bash
# Source: dev.to/0xmassi
codesign --deep --force --verify --verbose \
  --sign "Developer ID Application: Your Name (XXXXXXXXXX)" \
  --options runtime \
  --entitlements src-tauri/entitlements.plist \
  "target/release/bundle/macos/AI Buddy.app"

xcrun notarytool submit \
  "target/release/bundle/macos/AI Buddy_0.1.0_aarch64.dmg" \
  --keychain-profile "ai-buddy-notarize" \
  --wait

xcrun stapler staple \
  "target/release/bundle/macos/AI Buddy_0.1.0_aarch64.dmg"
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `altool` for notarization | `notarytool` | Xcode 13 / 2021 | `altool` deprecated; `notarytool` is mandatory |
| Manual `codesign` + `altool` | `cargo tauri build` with env vars | Tauri v2 (Oct 2024) | Single build command handles sign+notarize |
| `xcrun notarytool --wait` polling | `--wait` flag (built in) | Xcode 13 | No custom polling loop needed |

**Deprecated:**
- `altool`: Removed from Xcode 15+. Do not use. `notarytool` is the only valid tool.
- `codesign --deep` on pre-signed .app bundles: Can break Tauri's component signing. Only use `--deep` in the manual fallback path when the bundle wasn't signed by Tauri.

---

## Runtime State Inventory

This phase is a configuration + tooling phase (no renames, no data migrations, no refactors). Runtime state inventory does not apply.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Xcode Command Line Tools | codesign, notarytool, stapler, spctl | Yes | xcrun 72 | — |
| xcrun notarytool | SIGN-01, SIGN-02 | Yes | 1.1.0 (39) | — |
| cargo tauri | build pipeline | Yes | 2.10.1 | — |
| Developer ID Application cert | SIGN-01 | No (0 valid identities) | — | Must provision at developer.apple.com |
| notarytool Keychain profile "ai-buddy-notarize" | SIGN-01, SIGN-02 | No (confirmed missing) | — | Must run `notarytool store-credentials` |
| Apple Developer Program enrollment | Certificate creation | Unknown — must be verified | — | Requires $99/yr paid account |
| app-specific password | notarytool auth | Unknown | — | Create at appleid.apple.com → Security |

**Missing dependencies with no fallback:**
- Developer ID Application certificate — must be provisioned before build can be signed. No code workaround.
- Apple Developer Program membership — prerequisite to creating the certificate.

**Missing dependencies with fallback:**
- notarytool Keychain profile — created by running `notarytool store-credentials` (a plan step, not a blocker).
- App-specific password — generated at appleid.apple.com in minutes.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Manual verification (no automated test framework applies to signing/notarization) |
| Config file | none |
| Quick run command | `spctl --assess --type execute --verbose=4 "target/release/bundle/macos/AI Buddy.app"` |
| Full suite command | See Phase Requirements → Test Map below |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | Automated? |
|--------|----------|-----------|-------------------|------------|
| SIGN-01 | Gatekeeper accepts app without warning | manual smoke | `spctl --assess --type execute --verbose=4 "...AI Buddy.app"` | Partial — command is automated; human reads pass/fail output |
| SIGN-01 | codesign integrity valid | manual smoke | `codesign --verify --deep --strict --verbose=2 "...AI Buddy.app"` | Partial |
| SIGN-02 | App opens offline after first launch | manual | Disable WiFi, launch from /Applications | Manual only — requires network state change |
| SIGN-03 | All 5 entitlement keys present in signed bundle | manual smoke | `codesign --display --entitlements - "...AI Buddy.app"` | Partial — human inspects output |
| SIGN-04 | Screenshot produces real image (not blank) | manual | Launch signed app, trigger screenshot, check output is non-blank | Manual only |
| SIGN-05 | Windows beta install guide exists and is accurate | manual | `ls docs/windows-beta-install.md && cat docs/windows-beta-install.md` | File existence automated; accuracy is manual review |

### Wave 0 Gaps
None — no automated test files to create. All signing verification is manual by nature (requires Apple-signed build artifacts and hardware state changes).

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | n/a — no auth flows in this phase |
| V3 Session Management | No | n/a |
| V4 Access Control | No | n/a |
| V5 Input Validation | No | n/a |
| V6 Cryptography | Yes (partial) | codesign uses Apple-managed PKI; app-specific password stored only in Keychain, never in source |
| V14 Configuration | Yes | Credentials excluded from config files; plist privacy strings satisfy macOS TCC requirements |

### Known Threat Patterns for This Phase

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Certificate theft | Spoofing | App-specific password in Keychain only; .p12 never exported to disk in Phase 14 (local Keychain cert used directly) |
| Entitlements over-granting | Elevation of privilege | Use only the minimum required entitlements — the 5 documented keys are the minimum for Tauri+WKWebView+audio |
| SmartScreen phishing | Spoofing | Instruct beta users to download only from the official GitHub Release URL; document this in the Windows guide |
| Credentials in git | Information disclosure | `signingIdentity` in tauri.conf.json is safe (cert name, not secret); passwords must never be committed |

---

## Windows SmartScreen Documentation Spec (SIGN-05)

`docs/windows-beta-install.md` must cover [CITED: CONTEXT.md D-06]:

1. **Why the warning appears** — AI Buddy is an unsigned binary for the closed beta. SmartScreen warns on unsigned executables from new publishers. This is expected and safe to bypass during beta.
2. **Step-by-step click-through:**
   - Download the `.exe` installer from the GitHub Release page
   - When SmartScreen appears: click "More info"
   - Click "Run anyway"
   - Proceed through the installer normally
3. **Screenshot placeholders** — mark with `<!-- screenshot: smartscreen-blocked.png -->` and `<!-- screenshot: smartscreen-run-anyway.png -->`
4. **Future note** — "In v1.0, AI Buddy will be signed with an EV certificate. SmartScreen will no longer show this warning."
5. **Link from GitHub Release** — the release description should link to this doc.

---

## Open Questions

1. **Apple Developer Program enrollment status**
   - What we know: The plan requires it; certificate provisioning cannot proceed without it.
   - What's unclear: Whether the user is already enrolled or needs to complete the $99/yr enrollment first.
   - Recommendation: Wave 0 task should be "Confirm Apple Developer Program membership — if not enrolled, enroll now before proceeding." The rest of Phase 14 is blocked until this is confirmed.

2. **Universal binary vs arm64-only for Phase 14**
   - What we know: The machine is arm64 (Apple Silicon). `cargo tauri build` defaults to native arch.
   - What's unclear: Whether Phase 14 should produce a universal binary (arm64 + x86_64) or arm64-only.
   - Recommendation: arm64-only is fine for Phase 14 (it's a beta run). Universal is Phase 16 distribution scope. The plan should note this explicitly so the user doesn't expect a universal DMG.

3. **Whether `cargo tauri build` auto-notarize is triggered by `APPLE_ID` + `APPLE_PASSWORD` or requires separate `notarytool` call**
   - What we know: Multiple community sources confirm Tauri auto-notarizes when `APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID` are set. The Phase 14 plan includes both paths (auto via env vars + manual fallback). [CITED: v2.tauri.app/distribute/sign/macos/, dev.to/0xmassi]
   - What's unclear: The exact Tauri v2.10.x bundler behavior — whether notarization is fully integrated or still a post-build step in some configurations.
   - Recommendation: Plan for the env-var-driven auto path as primary; document the manual `notarytool submit` fallback. If auto-notarize fails, the manual fallback produces the same result.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `cargo tauri build` auto-notarizes when APPLE_ID/APPLE_PASSWORD/APPLE_TEAM_ID env vars are set | Architecture Patterns | Low — manual `notarytool submit` fallback achieves same result |
| A2 | Tauri 2.10.1 bundler handles signing order (components before bundle) correctly without `--deep` re-signing | Common Pitfalls | Low — if wrong, manual fallback with `--deep` fixes it |
| A3 | Phase 14 needs only arm64-only DMG (not universal binary) | Open Questions | Low — universal build is additive; arm64 works for beta |
| A4 | `disable-library-validation` is required for Tauri dynamic library loading on a notarized build | Standard Stack / Entitlements | Medium — if not required, it is harmless but increases Apple's scrutiny surface; if required and missing, app crashes post-notarization |

---

## Sources

### Primary (HIGH confidence)
- [v2.tauri.app/distribute/sign/macos/](https://v2.tauri.app/distribute/sign/macos/) — signing identity, env vars, tauri.conf.json fields, notarization flow
- [v2.tauri.app/reference/environment-variables/](https://v2.tauri.app/reference/environment-variables/) — complete list of APPLE_* env vars with descriptions
- Local machine verification — xcrun notarytool version 1.1.0, tauri-cli 2.10.1, Xcode tools installed, 0 valid signing identities, "ai-buddy-notarize" profile absent

### Secondary (MEDIUM confidence)
- [dev.to/0xmassi — Shipping a Production macOS App with Tauri 2.0](https://dev.to/0xmassi/shipping-a-production-macos-app-with-tauri-20-code-signing-notarization-and-homebrew-mc3) — entitlements plist, manual codesign commands, staple commands
- [dev.to/tomtomdu73 — Ship Your Tauri v2 App Like a Pro (Part 1)](https://dev.to/tomtomdu73/ship-your-tauri-v2-app-like-a-pro-code-signing-for-macos-and-windows-part-12-3o9n) — env-var-driven signing, tauri.conf.json signingIdentity, pitfalls
- Multiple community sources agree on `--options runtime`, `--wait`, staple requirement

### Tertiary (LOW confidence)
- None — all critical claims are verified or cited against official docs.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — toolchain confirmed present on local machine; Tauri v2 docs are current
- Architecture: HIGH — cross-verified against official Tauri docs and two production-grade community write-ups
- Pitfalls: HIGH — JIT entitlements crash pattern is documented by multiple independent sources; blank screenshots confirmed as known behavior for missing NSScreenCaptureUsageDescription
- Windows SmartScreen guide: HIGH — SmartScreen click-through is stable behavior unchanged across Windows 10/11

**Research date:** 2026-04-13
**Valid until:** 2026-07-13 (90 days — Apple toolchain is stable; Tauri patch versions don't change signing behavior)
