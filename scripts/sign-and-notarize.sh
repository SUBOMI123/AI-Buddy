#!/usr/bin/env bash
# scripts/sign-and-notarize.sh
# Phase 14: Manual sign + notarize + staple pipeline for AI Buddy macOS builds.
#
# Usage (Phase 14 — local, uses Keychain profile):
#   export APPLE_SIGNING_IDENTITY="Developer ID Application: Your Name (TEAMID)"
#   export APPLE_ID="you@email.com"
#   export APPLE_PASSWORD="<app-specific-password>"   # app-specific password (NOT your Apple ID password)
#   export APPLE_TEAM_ID="XXXXXXXXXX"
#   bash scripts/sign-and-notarize.sh
#
# Phase 15 CI note:
#   Replace APPLE_PASSWORD with $APPLE_APP_SPECIFIC_PASSWORD from GitHub Secrets.
#   KEYCHAIN_PROFILE env var is not used by cargo tauri build — env vars above are sufficient.
#   The Keychain profile (ai-buddy-notarize) is a local-only convenience; CI uses env vars directly.
#
# Requires: Xcode CLI tools, cargo tauri 2.10+, Developer ID Application cert in Keychain.

set -euo pipefail

# Validate required env vars
: "${APPLE_SIGNING_IDENTITY:?Set APPLE_SIGNING_IDENTITY before running}"
: "${APPLE_ID:?Set APPLE_ID before running}"
: "${APPLE_PASSWORD:?Set APPLE_PASSWORD before running}"
: "${APPLE_TEAM_ID:?Set APPLE_TEAM_ID before running}"

echo "==> Building, signing, and notarizing AI Buddy..."
echo "    Identity: $APPLE_SIGNING_IDENTITY"
echo "    Team ID:  $APPLE_TEAM_ID"
echo "    Apple ID: $APPLE_ID"
echo ""

# Step 1: Build (Tauri auto-signs and auto-notarizes when APPLE_* vars are set)
echo "==> Running cargo tauri build..."
cargo tauri build

# Step 2: Find the DMG (architecture-specific filename)
DMG_PATH=$(ls target/release/bundle/macos/*.dmg 2>/dev/null | head -1)
if [ -z "$DMG_PATH" ]; then
  echo "ERROR: No DMG found in target/release/bundle/macos/. Build may have failed."
  exit 1
fi
echo "==> Found DMG: $DMG_PATH"

# Step 3: Staple the notarization ticket to the DMG for offline Gatekeeper (SIGN-02)
# Note: cargo tauri build auto-notarizes but does NOT staple. Staple is always a manual step.
echo "==> Stapling notarization ticket..."
xcrun stapler staple "$DMG_PATH"

# Step 4: Validate staple succeeded
echo "==> Validating staple..."
xcrun stapler validate "$DMG_PATH"

# Step 5: Verify Gatekeeper accepts the .app inside the DMG
APP_PATH="target/release/bundle/macos/AI Buddy.app"
if [ -d "$APP_PATH" ]; then
  echo "==> Verifying codesign integrity..."
  codesign --verify --deep --strict --verbose=2 "$APP_PATH"

  echo "==> Verifying Gatekeeper acceptance (spctl)..."
  spctl --assess --type execute --verbose=4 "$APP_PATH"

  echo "==> Verifying entitlements in signed bundle..."
  codesign --display --entitlements - "$APP_PATH"
else
  echo "WARNING: .app not found at expected path for verification. Check DMG manually."
fi

echo ""
echo "==> Done. Artifacts:"
echo "    DMG (stapled): $DMG_PATH"
echo ""
echo "==> Phase 14 offline test (SIGN-02):"
echo "    1. Mount the DMG: open \"$DMG_PATH\""
echo "    2. Drag AI Buddy.app to /Applications"
echo "    3. Disable WiFi"
echo "    4. Double-click AI Buddy in /Applications — must launch with no Gatekeeper dialog"
echo ""
echo "==> Phase 15 handoff note:"
echo "    CI replaces Keychain profile with env vars: APPLE_APP_SPECIFIC_PASSWORD"
echo "    Same APPLE_* env vars work in GitHub Actions secrets."
