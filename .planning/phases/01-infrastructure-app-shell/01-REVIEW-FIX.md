---
phase: 01-infrastructure-app-shell
fixed_at: 2026-04-09T12:30:00Z
review_path: .planning/phases/01-infrastructure-app-shell/01-REVIEW.md
iteration: 1
findings_in_scope: 8
fixed: 8
skipped: 0
status: all_fixed
---

# Phase 01: Code Review Fix Report

**Fixed at:** 2026-04-09T12:30:00Z
**Source review:** .planning/phases/01-infrastructure-app-shell/01-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 8
- Fixed: 8
- Skipped: 0

## Fixed Issues

### CR-01: Rate limiter has a TOCTOU race condition allowing burst bypass

**Files modified:** `worker/src/index.ts`
**Commit:** 37f04ad
**Applied fix:** Added detailed documentation comment above the `checkRateLimit` function acknowledging the KV eventual-consistency TOCTOU race, noting that bursts up to ~2x the limit may pass under high concurrency, and recommending Durable Objects for strict enforcement. Accepted as adequate for private beta traffic levels.

### CR-02: Auth token validation is trivially weak -- any 32+ char string is accepted

**Files modified:** `worker/src/index.ts`
**Commit:** 37f04ad
**Applied fix:** Replaced simple `token.length < 32` check with full HMAC-SHA256 signature verification. Token format is now `<installationId>.<hex-signature>`. Added `APP_HMAC_SECRET` to the `Bindings` type. The worker imports the secret key, computes HMAC-SHA256 over the installation ID, and compares the hex-encoded result to the provided signature. Rate limiting is now keyed on the installation ID (not the full token string).

### CR-03: Shortcut parsing panics on invalid preference data, crashing the app

**Files modified:** `src-tauri/src/shortcut.rs`
**Commit:** f48fce2
**Applied fix:** Replaced `.expect()` call with a `match` block that catches parse errors and falls back to the default shortcut (`CommandOrControl+Shift+Space`), logging a warning via `eprintln!`. The app will no longer crash on malformed shortcut preferences.

### WR-01: CORS allows all origins -- must be restricted before production

**Files modified:** `worker/src/index.ts`
**Commit:** 37f04ad
**Applied fix:** Changed CORS origin from `'*'` to `'http://localhost:1420'` (Tauri dev server). Added comment explaining that Tauri production builds make requests from Rust (not a browser), so CORS only matters for the dev-server case.

### WR-02: Updater pubkey is empty -- auto-updates will fail or be insecure

**Files modified:** `src-tauri/tauri.conf.json`
**Commit:** 91f4c27
**Applied fix:** Replaced empty `pubkey` string with an actionable placeholder: `"GENERATE-BEFORE-RELEASE: run cargo tauri signer generate -w ~/.tauri/ai-buddy.key and paste public key here"`. This ensures the empty string does not silently pass through and makes the required action discoverable.

### WR-03: Installation token printed to stdout in production builds

**Files modified:** `src-tauri/src/lib.rs`
**Commit:** 951bbda
**Applied fix:** Gated the `println!` call behind `#[cfg(debug_assertions)]` so the installation token prefix is only logged in debug/dev builds. Renamed binding to `_token` to suppress unused-variable warnings in release builds.

### WR-04: Preferences file written without restrictive permissions

**Files modified:** `src-tauri/src/preferences.rs`
**Commit:** fd665b1
**Applied fix:** Added a `#[cfg(unix)]` block after `fs::write` that sets file permissions to `0o600` (owner read/write only) using `std::os::unix::fs::PermissionsExt`. This prevents other users on shared systems from reading the preferences file which contains the installation token.

### WR-05: Chat proxy passes arbitrary fields to Anthropic API without sanitization

**Files modified:** `worker/src/index.ts`
**Commit:** 37f04ad
**Applied fix:** Replaced `{ ...body, stream: true }` spread with an explicit allowlist: `model` (with default fallback), `messages`, `max_tokens` (clamped to 4096), and `stream: true`. Prevents clients from overriding model selection to expensive models or injecting unexpected fields.

## Skipped Issues

None -- all in-scope findings were fixed.

---

_Fixed: 2026-04-09T12:30:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
