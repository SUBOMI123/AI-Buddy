---
phase: 08-backend-foundations
fixed_at: 2026-04-10T00:00:00Z
review_path: .planning/phases/08-backend-foundations/08-REVIEW.md
iteration: 1
findings_in_scope: 6
fixed: 6
skipped: 0
status: all_fixed
---

# Phase 8: Code Review Fix Report

**Fixed at:** 2026-04-10T00:00:00Z
**Source review:** .planning/phases/08-backend-foundations/08-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 6
- Fixed: 6
- Skipped: 0

## Fixed Issues

### CR-01: `APP_HMAC_SECRET` panic at runtime, not compile-time

**Files modified:** `src-tauri/build.rs`
**Commit:** 7d1b973
**Applied fix:** Added a `std::env::var("APP_HMAC_SECRET").is_err()` check at the top of `build.rs` that panics with a clear message during `cargo build` if the env var is absent. Previously the app compiled and launched silently, only crashing on the first `cmd_get_token` call at runtime.

---

### CR-02: `onDone` reads `streamingText()` before last `onToken` flush is guaranteed

**Files modified:** `src/components/SidebarShell.tsx`
**Commit:** 88d585d
**Applied fix:** Introduced a local `accumulatedText` string variable in `submitIntent`. `onToken` now appends to it synchronously (`accumulatedText += text`) and uses it to set the signal (`setStreamingText(accumulatedText)`). `onDone` reads `accumulatedText` directly instead of calling `streamingText()`, eliminating the micro-task boundary race where the signal could be stale or empty.

---

### WR-01: Double-submit race — `abortController` reassigned before previous request finishes teardown

**Files modified:** `src/components/SidebarShell.tsx`
**Commit:** 5b702f0
**Applied fix:** Added a `submitGen` counter at component scope. Each `submitIntent` call captures `const thisGen = ++submitGen` before any await. The `onError` and `onDone` callbacks guard with `if (thisGen !== submitGen) return` to discard callbacks from superseded requests, preventing stale error/done state from overwriting a newer request's loading state.

---

### WR-02: Event listener handles from `onMount` can leak on hot-reload / early unmount

**Files modified:** `src/components/SidebarShell.tsx`
**Commit:** b43b99f
**Applied fix:** Refactored `onMount` from `async () => {}` to a synchronous wrapper that spawns an IIFE `(async () => { ... })()`. A `cancelled` flag and `cleanups` array are declared synchronously. After each `await listen(...)` call, the code checks `if (cancelled) { ul(); return; }` before pushing to `cleanups`. The `onCleanup` callback (now registered synchronously inside `onMount`) sets `cancelled = true` and calls all accumulated cleanup functions. This ensures listeners registered after unmount are immediately unlistened, and the cleanup always runs regardless of async timing.

Note: this fix also incorporated IN-03 — the `console.error("STT error:", error)` line in the same block was changed to `if (import.meta.env.DEV) console.error("STT error:", error)`.

---

### WR-03: Zero-dimension region coordinates pass through unchecked to Rust capture

**Files modified:** `src-tauri/src/window.rs`
**Commit:** dbbb62d
**Applied fix:** Added an early return guard at the top of `cmd_confirm_region`: `if width == 0 || height == 0 { return Err("Region dimensions must be greater than zero".to_string()); }`. This rejects zero-dimension regions at the IPC boundary before they reach xcap, preventing potential integer overflow panics or 0-byte buffer encode errors.

---

### WR-04: `cmd_update_ptt_shortcut` reads preferences twice (TOCTOU)

**Files modified:** `src-tauri/src/preferences.rs`
**Commit:** e708233
**Applied fix:** Collapsed the two `load_preferences(&app)` calls into one. The single `let mut prefs = load_preferences(&app)` now serves both purposes: `old_key` is cloned from `prefs.ptt_key` before it is overwritten with the new value. This eliminates the window where a concurrent preference write between the two reads could be silently overwritten by the second load.

---

_Fixed: 2026-04-10T00:00:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
