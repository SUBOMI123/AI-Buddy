// src-tauri/src/app_context.rs
// Phase 8: CTX-01, CTX-03 — OS-native active application detection
// Source: active-win-pos-rs 0.10.0 docs + 08-RESEARCH.md Pattern 1

use active_win_pos_rs::get_active_window;

/// Returns the bundle/process name of the frontmost application at time of call.
/// Uses OS-native API: NSWorkspace on macOS, GetForegroundWindow on Windows.
///
/// Returns Ok(Some(name)) on success.
/// Returns Ok(None) if no window has focus, app_name is empty, or detection fails.
///
/// IMPORTANT: Uses only `app_name` — does NOT read `title`.
/// On macOS, `title` requires Screen Recording permission and returns "" without it.
/// `app_name` is available without any special permission on macOS Sequoia (Pitfall 5).
///
/// Intentionally synchronous — get_active_window() is a fast synchronous OS call.
/// Do NOT add async. The caller (JS) calls this non-blocking (fire-and-forget).
///
/// CTX-03: No screenshot analysis involved. OS process table only.
#[tauri::command]
pub fn cmd_get_active_app() -> Result<Option<String>, String> {
    match get_active_window() {
        Ok(win) => {
            // Trim whitespace; cap at 100 chars to prevent prompt bloat from adversarial names
            let name = win.app_name.trim().chars().take(100).collect::<String>();
            if name.is_empty() {
                Ok(None)
            } else {
                Ok(Some(name))
            }
        }
        // Best-effort: never fail hard on app detection (Pitfall 3: Windows elevated process)
        Err(_) => Ok(None),
    }
}
