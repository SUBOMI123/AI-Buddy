# Phase 14: Code Signing — Context

**Gathered:** 2026-04-13
**Status:** Ready for planning

<domain>
## Phase Boundary

Get macOS builds to pass Gatekeeper and notarization without warnings, and document Windows SmartScreen click-through for beta users. Phase 14 ends with a working signed+notarized DMG that can be handed to a beta user today.

Fixes two existing plist files (`entitlements.plist`, `Info.plist`) that are currently incomplete for a notarized build, provisions the Apple Developer ID Application certificate, runs the full sign+notarize+staple pipeline manually, and writes a Windows beta install guide.

Phase 15 (CI) will automate the signing pipeline — Phase 14 establishes the correct config and proves the pipeline works with a single manual run.

</domain>

<decisions>
## Implementation Decisions

### Signing scope — full manual run in Phase 14

**D-01:** Phase 14 produces an actual signed+notarized+stapled DMG. Not config-only. The plan must include:
1. Fix `entitlements.plist` (add missing keys per SIGN-03)
2. Fix `Info.plist` (add `NSScreenCaptureUsageDescription` per SIGN-04)
3. Set `signingIdentity` in `tauri.conf.json`
4. Run `cargo tauri build`
5. Sign with `codesign`
6. Notarize with `notarytool`
7. Staple the ticket with `xcrun stapler`
8. Verify with `spctl` and `codesign --verify`

This satisfies SIGN-01, SIGN-02, SIGN-03, SIGN-04 with verifiable runtime evidence before Phase 15 CI.

### Developer ID Application certificate — needs provisioning

**D-02:** The user does not have a Developer ID Application certificate installed. The plan must include steps to:
- Visit developer.apple.com → Certificates, Identifiers & Profiles
- Create a Developer ID Application certificate (requires Apple Developer Program enrollment at $99/yr)
- Download and install into macOS Keychain

The plan should document the `security find-identity -v -p codesigning` command to verify the certificate is installed and extract the exact signing identity string (e.g., `"Developer ID Application: Your Name (TEAMID)"`).

### Credentials — local Keychain profile (notarytool)

**D-03:** Notarization credentials stored as a named Keychain profile using:
```
xcrun notarytool store-credentials "ai-buddy-notarize" \
  --apple-id "your@email.com" \
  --team-id "TEAMID" \
  --password "xxxx-xxxx-xxxx-xxxx"  # app-specific password from appleid.apple.com
```

The build script and plan reference the profile by name (`--keychain-profile "ai-buddy-notarize"`). No credentials in env vars, no credentials in config files. Profile lives in the user's Keychain only.

Phase 15 CI will use env vars instead (CI has no Keychain) — that's Phase 15's concern, not Phase 14's.

### Entitlements completion (SIGN-03)

**D-04:** Current `entitlements.plist` has `com.apple.security.cs.allow-unsigned-executable-memory` and `com.apple.security.device.audio-input`. Missing keys that must be added:
- `com.apple.security.cs.allow-jit` — required by WKWebView (Tauri's renderer)
- `com.apple.security.cs.allow-dyld-environment-variables` — required by Tauri
- `com.apple.security.cs.disable-library-validation` — required for dynamic library loading

The updated file must have all 5 keys. `com.apple.security.device.audio-input` stays (mic for PTT). `allow-unsigned-executable-memory` stays.

### Info.plist completion (SIGN-04)

**D-05:** Add `NSScreenCaptureUsageDescription` to `Info.plist`. Current file only has `NSMicrophoneUsageDescription`. The description string should explain screen capture is used to help the AI understand the active application.

Example string: `"AI Buddy captures your screen to understand what you're working on and provide step-by-step guidance. Captures are sent to Claude (Anthropic) for analysis and are not stored."`

### Windows SmartScreen documentation (SIGN-05)

**D-06:** Create `docs/windows-beta-install.md` — a markdown file in the repo. This file is what gets linked from the GitHub Release and included in the beta invite email. Content must include:
- Why SmartScreen shows a warning (unsigned binary, expected for beta)
- Step-by-step with callouts: "More info" → "Run anyway"
- Screenshot placeholder markers (or actual screenshots if possible)
- Note that the warning goes away in v1.0 with EV code signing

The plan should include this doc as a required deliverable.

### Claude's Discretion

- Exact `codesign` flags (e.g., `--deep`, `--options runtime`) — researcher should verify correct flags for Tauri builds
- Whether to use a build script (`scripts/sign-and-notarize.sh`) vs inline plan steps — researcher should check Tauri community patterns
- Notarization wait strategy (`--wait` vs polling)

</decisions>

<specifics>
## Specific Ideas

- The plan should document the exact command to verify signing: `spctl --assess --type execute --verbose=4 /path/to/AI\ Buddy.app`
- After notarization + staple, the user should test offline (disable WiFi, relaunch) to confirm SIGN-02
- Phase 15 CI will use environment variables for credentials instead of Keychain profile — the Phase 14 plan should note this handoff point so Phase 15 knows what to change

</specifics>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Code signing requirements
- `.planning/REQUIREMENTS.md` — SIGN-01 through SIGN-05 (lines with `SIGN-` prefix) — exact acceptance criteria for each signing requirement
- `.planning/ROADMAP.md` §Phase 14 — success criteria, depends-on, phase boundary

### Existing config files (read before modifying)
- `src-tauri/entitlements.plist` — current state (2 keys present, 3 missing per SIGN-03)
- `src-tauri/Info.plist` — current state (NSMicrophoneUsageDescription present, NSScreenCaptureUsageDescription missing per SIGN-04)
- `src-tauri/tauri.conf.json` — current bundle config (`macOS.entitlements` and `macOS.infoPlist` already set; `signingIdentity` not yet set)

### Project docs
- `CLAUDE.md` — Tech stack constraints (Tauri v2, Rust 1.85+, cross-platform target)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src-tauri/entitlements.plist` — exists, partially correct, needs 3 additional keys
- `src-tauri/Info.plist` — exists, needs `NSScreenCaptureUsageDescription` added
- `src-tauri/tauri.conf.json` — already wires both plist files into the macOS bundle config

### Established Patterns
- No existing signing scripts — Phase 14 creates the first one (or documents manual steps)
- The app already uses `com.aibuddy.app` as bundle identifier (set in `tauri.conf.json`)

### Integration Points
- Phase 15 CI will consume whatever signing pattern Phase 14 establishes — keep the sign+notarize steps scripted and environment-variable-ready even though Phase 14 uses Keychain profiles

</code_context>

<deferred>
## Deferred Ideas

- EV code signing for Windows (eliminates SmartScreen entirely) — v1.0 / future phase
- Deep link (`ai-buddy://`) for post-payment return flow — already deferred from Phase 13
- GitHub Actions signing automation — Phase 15

</deferred>

---

*Phase: 14-code-signing*
*Context gathered: 2026-04-13*
