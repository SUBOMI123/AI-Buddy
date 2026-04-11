---
phase: 08-backend-foundations
reviewed: 2026-04-10T00:00:00Z
depth: standard
files_reviewed: 9
files_reviewed_list:
  - src-tauri/src/window.rs
  - src-tauri/src/shortcut.rs
  - src-tauri/src/tray.rs
  - src-tauri/src/app_context.rs
  - src-tauri/Cargo.toml
  - src-tauri/src/lib.rs
  - src/lib/tauri.ts
  - src/lib/ai.ts
  - src/components/SidebarShell.tsx
findings:
  critical: 2
  warning: 4
  info: 3
  total: 9
status: issues_found
---

# Phase 8: Code Review Report

**Reviewed:** 2026-04-10T00:00:00Z
**Depth:** standard
**Files Reviewed:** 9
**Status:** issues_found

## Summary

Phase 8 adds OS-native active app detection (`app_context.rs`, `cmd_get_active_app`) and wires the detected app name through the frontend AI prompt pipeline (CTX-01, CTX-02). The core implementation is correct and well-commented. Several pre-existing issues surfaced during review.

Two critical issues were found: `APP_HMAC_SECRET` is required at build time via a hard `env!()` macro — a missing env var will **silently panic at runtime** on first token use rather than failing at link/compile time; and the `onDone` handler in `SidebarShell.tsx` reads `streamingText()` to pass to `playTts` / `recordInteraction` before the signal has been flushed, so it may capture an incomplete or empty string. Four warnings cover a race condition on double-submit, unlistened event handles that can leak, no validation on zero-dimension region coords, and a TOCTOU re-read of preferences. Three info items cover minor dead code and code duplication.

---

## Critical Issues

### CR-01: `APP_HMAC_SECRET` panic at runtime, not compile-time

**File:** `src-tauri/src/preferences.rs:14`

**Issue:** `const APP_HMAC_SECRET: &str = env!("APP_HMAC_SECRET");` uses the `env!()` macro, which panics with a cryptic message if the env var is absent **at the callsite** (the first call to `cmd_get_token`), not at build time. On a fresh developer checkout where `APP_HMAC_SECRET` is not exported, the app compiles and launches successfully but crashes the moment the frontend requests a token. There is no compile-time failure, no startup check, and no user-visible error — only an opaque Tauri IPC panic.

**Fix:** Add a build-time assertion so the problem is caught during `cargo build`, not at runtime:

```rust
// In build.rs (create if absent):
fn main() {
    // Fail the build immediately if secret is missing.
    if std::env::var("APP_HMAC_SECRET").is_err() {
        panic!("APP_HMAC_SECRET env var must be set at build time");
    }
    tauri_build::build();
}
```

Alternatively, use `option_env!` with an explicit startup panic in `run()`:
```rust
const APP_HMAC_SECRET: &str = match option_env!("APP_HMAC_SECRET") {
    Some(s) => s,
    None => panic!("APP_HMAC_SECRET must be set at build time"),
};
```
The second form still panics at runtime, so the build.rs approach is preferred.

---

### CR-02: `onDone` reads `streamingText()` before the last `onToken` flush is guaranteed

**File:** `src/components/SidebarShell.tsx:302-313`

**Issue:** The `onDone` callback reads `streamingText()` to feed `playTts()` and `recordInteraction()` immediately:

```ts
onDone: () => {
  if (contentState() === "loading") {
    setContentState("streaming");
  }
  if (ttsEnabled()) {
    playTts(streamingText()).catch(() => {});   // may be stale/empty
  }
  if (ctx.taskLabel) {
    recordInteraction(
      ctx.taskLabel,
      intent,
      streamingText(),    // may be stale/empty
      ctx.tier,
      ...
    ).catch(() => {});
  }
},
```

SolidJS signal updates triggered by `onToken` are **synchronous** within a single reactive batch, but `onDone` arrives via a separate micro-task boundary from the SSE reader loop. If a browser task boundary separates the final `onToken` call from `onDone` (which the event loop can produce under load), `streamingText()` may be read before the last token is committed to the signal. This is a race. The safe pattern is to accumulate text in a local variable and read the local, not the signal, in `onDone`.

**Fix:**

```ts
// In submitIntent, before streamGuidance call:
let accumulatedText = "";

await streamGuidance({
  ...
  onToken: (text) => {
    accumulatedText += text;           // local accumulator — synchronous, no signal read lag
    if (contentState() === "loading") setContentState("streaming");
    setStreamingText(accumulatedText); // signal for UI
  },
  onDone: () => {
    if (contentState() === "loading") setContentState("streaming");
    if (ttsEnabled()) {
      playTts(accumulatedText).catch(() => {});   // use local, not signal
    }
    if (ctx.taskLabel) {
      recordInteraction(
        ctx.taskLabel, intent, accumulatedText, ctx.tier, detectedApp() ?? undefined,
      ).catch(() => {});
    }
  },
});
```

---

## Warnings

### WR-01: Double-submit race — `abortController` reassigned before previous request finishes teardown

**File:** `src/components/SidebarShell.tsx:212-213`

**Issue:**

```ts
abortController?.abort();
abortController = new AbortController();
```

If `submitIntent` is called twice in rapid succession (e.g., user presses Enter twice quickly, or `handleRetry` fires while a previous stream is mid-flight), the first request's `AbortError` propagates into the `catch` block of the first `streamGuidance` call, which correctly returns early. However, `abortController` is a plain closure variable — there is no guard preventing a second call from entering `submitIntent` while the first is still in the `try/catch` around `fetch`. The second call replaces `abortController` with a new instance; if the first call's catch block then calls `onError`, it updates the shared signals with stale context (the first request's error overwrites the second request's loading state).

**Fix:** Add a generation counter or set a "submitting" boolean guard at the top of `submitIntent`:

```ts
const submitIntent = async (intent: string, forceFullSteps = false) => {
  const thisGen = ++submitGenRef; // useRef-like: let submitGen = 0 in component scope
  ...
  onError: (err) => {
    if (thisGen !== submitGenRef) return; // stale response, discard
    setErrorMessage(err);
    setContentState("error");
  },
  onDone: () => {
    if (thisGen !== submitGenRef) return;
    ...
  },
};
```

---

### WR-02: Event listener handles from `onMount` can leak on hot-reload / early unmount

**File:** `src/components/SidebarShell.tsx:100-171`

**Issue:** All `listen(...)` calls inside `onMount` are `await`ed and their unlisten functions stored in `let` variables (e.g., `unlistenOverlay`). However, if `onMount`'s async body is still executing (e.g., awaiting `onOverlayShown`) when the component unmounts (hot-reload or fast close), `onCleanup` runs before the `await` resolves. The unlisten function has not been assigned yet, so the cleanup call `unlistenOverlay?.()` is a no-op and the listener leaks for the lifetime of the WebView. This is a known SolidJS async-in-onMount pitfall.

**Fix:** Register cleanup inside the async callback immediately after the await:

```ts
onMount(() => {
  // Wrap the whole async body; synchronously return a cleanup function
  let cancelled = false;
  const cleanups: Array<() => void> = [];

  (async () => {
    const ul = await onOverlayShown(async () => { ... });
    if (cancelled) { ul(); return; }
    cleanups.push(ul);

    const ul2 = await onPttStart(() => { ... });
    if (cancelled) { ul2(); return; }
    cleanups.push(ul2);
    // ... etc
  })();

  onCleanup(() => {
    cancelled = true;
    cleanups.forEach((fn) => fn());
    abortController?.abort();
  });
});
```

---

### WR-03: Zero-dimension region coordinates pass through unchecked to Rust capture

**File:** `src-tauri/src/window.rs:118-130` / `src/lib/tauri.ts:111-118`

**Issue:** `cmd_confirm_region` accepts `x: u32, y: u32, width: u32, height: u32` with no validation. A `width` or `height` of `0` reaches `capture_region` in `screenshot.rs` and is passed directly to the `xcap` image crop. Depending on the xcap version, a zero-width/height crop either panics (integer overflow in crop math) or returns a 0-byte buffer that later causes a base64/JPEG encode error. The RegionSelect frontend is supposed to enforce a minimum drag size, but that check could be bypassed via direct IPC.

**Fix:** Add a server-side guard in `cmd_confirm_region`:

```rust
#[tauri::command]
pub async fn cmd_confirm_region(
    app: AppHandle,
    x: u32,
    y: u32,
    width: u32,
    height: u32,
) -> Result<(), String> {
    if width == 0 || height == 0 {
        return Err("Region dimensions must be greater than zero".to_string());
    }
    if let Some(win) = app.get_webview_window("region-select") {
        let _ = win.hide();
    }
    app.emit("region-selected", RegionCoords { x, y, width, height })
        .map_err(|e| e.to_string())
}
```

---

### WR-04: `cmd_update_ptt_shortcut` reads preferences twice (TOCTOU)

**File:** `src-tauri/src/preferences.rs:163-183`

**Issue:**

```rust
let old_key = load_preferences(&app).ptt_key.clone();   // first read
let mut prefs = load_preferences(&app);                  // second read
prefs.ptt_key = key.clone();
save_preferences(&app, &prefs);
```

There are two separate `load_preferences` calls. If preferences are written by another command between these two reads (e.g., the user toggles audio cues from a second window while the PTT key is being changed), the second read gets stale or partial data and the save overwrites the concurrent change. The same double-read pattern appears in `cmd_set_shortcut` (line 119-121).

**Fix:** Read once:

```rust
pub fn cmd_update_ptt_shortcut(app: AppHandle, key: String) -> Result<String, String> {
    let _parsed: Result<tauri_plugin_global_shortcut::Shortcut, _> = key.parse();
    if _parsed.is_err() {
        return Err(format!("Invalid PTT key: {}", key));
    }

    let mut prefs = load_preferences(&app);     // single read
    let old_key = prefs.ptt_key.clone();
    prefs.ptt_key = key.clone();
    save_preferences(&app, &prefs);

    crate::shortcut::update_ptt_shortcut(&app, &old_key, &key)
        .map_err(|e| format!("Failed to update PTT shortcut: {}", e))?;

    Ok(key)
}
```

---

## Info

### IN-01: `update_ptt_shortcut` and `register_ptt_shortcut` duplicate the full PTT handler body

**File:** `src-tauri/src/shortcut.rs:55-93` and `src-tauri/src/shortcut.rs:113-142`

**Issue:** The PTT shortcut handler closure (`on_shortcut` callback with `Pressed`/`Released` match) is copy-pasted verbatim into both `register_ptt_shortcut` and `update_ptt_shortcut`. Any change to PTT behavior (audio cue logic, error handling, session options) must be made in two places.

**Fix:** Extract the handler into a named function or closure-returning helper:

```rust
fn ptt_handler(app: &tauri::AppHandle, event: &ShortcutEvent) {
    let prefs = crate::preferences::load_preferences(app);
    let audio_cues = prefs.audio_cues_enabled;
    match event.state {
        ShortcutState::Pressed => { ... }
        ShortcutState::Released => { ... }
    }
}
```

---

### IN-02: `tray.rs` — "Preferences..." menu item is disabled with no handler

**File:** `src-tauri/src/tray.rs:9-10`

**Issue:**

```rust
let preferences =
    MenuItem::with_id(app, "preferences", "Preferences...", false, None::<&str>)?;
```

The third argument `false` marks the item as disabled (grayed out). The `on_menu_event` handler also has no arm for `"preferences"`. If a Preferences screen is intended (the Settings screen exists in the frontend), the tray item should either be enabled and wired up, or removed to avoid user confusion.

**Fix:** Either wire up the handler or remove the item until the feature is ready:

```rust
// Option A: remove until ready
// let preferences = ...  // removed

// Option B: wire it up
"preferences" => {
    if let Some(window) = app.get_webview_window("overlay") {
        let _ = window.show();
        let _ = window.set_focus();
        let _ = window.emit("open-settings", ());
    }
}
```

---

### IN-03: `console.error` left in production path for STT errors

**File:** `src/components/SidebarShell.tsx:141`

**Issue:**

```ts
unlistenSttError = await onSttError((error) => {
  console.error("STT error:", error);  // debug artifact
  ...
});
```

`console.error` will appear in production WebView logs. In a desktop app this leaks raw error strings to system log aggregators. STT errors are already surfaced to the user via `setSttError(...)`.

**Fix:** Remove the `console.error` line, or gate it on `import.meta.env.DEV`:

```ts
if (import.meta.env.DEV) console.error("STT error:", error);
```

---

_Reviewed: 2026-04-10T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
