use std::sync::atomic::Ordering;
use tauri::Manager;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

/// Register the global shortcut from preferences (per D-06 -- customizable).
/// The shortcut is a toggle (per D-07): press to show, press again to hide.
pub fn register_shortcut(app: &tauri::AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let prefs = crate::preferences::load_preferences(app);
    let shortcut: Shortcut = match prefs.shortcut.parse() {
        Ok(s) => s,
        Err(_) => {
            eprintln!(
                "Invalid shortcut in preferences: {}, using default",
                prefs.shortcut
            );
            "CommandOrControl+Shift+Space"
                .parse()
                .expect("Default shortcut must be valid")
        }
    };

    app.global_shortcut()
        .on_shortcut(shortcut, move |app, _shortcut, event| {
            if event.state == ShortcutState::Pressed {
                if let Some(window) = app.get_webview_window("overlay") {
                    let _ = crate::window::toggle_overlay(&window);
                }
            }
        })?;

    Ok(())
}

/// Register the PTT push-to-talk shortcut.
/// Handles ShortcutState::Pressed (start session) and ShortcutState::Released (stop session).
/// The shortcut key is read from preferences (D-03: configurable).
pub fn register_ptt_shortcut(app: &tauri::AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let prefs = crate::preferences::load_preferences(app);
    let ptt_key_str = prefs.ptt_key.clone();

    let ptt_shortcut: Shortcut = match ptt_key_str.parse() {
        Ok(s) => s,
        Err(_) => {
            eprintln!(
                "Invalid PTT key in preferences: {}, using default",
                ptt_key_str
            );
            "CommandOrControl+Shift+V"
                .parse()
                .expect("Default PTT key must be valid")
        }
    };

    app.global_shortcut()
        .on_shortcut(ptt_shortcut, move |app, _shortcut, event| {
            let prefs = crate::preferences::load_preferences(app);
            let audio_cues = prefs.audio_cues_enabled;

            match event.state {
                ShortcutState::Pressed => {
                    // Early exit if already active — T-03-01 CAS guard also handles this inside
                    if crate::voice::ptt::IS_PTT_ACTIVE.load(Ordering::SeqCst) {
                        return;
                    }

                    let app_handle = app.clone();
                    // Worker URL: embedded at build time via WORKER_URL env var; fallback to localhost for dev
                    let worker_url = option_env!("WORKER_URL")
                        .unwrap_or("http://localhost:8787")
                        .to_string();
                    let app_token = crate::preferences::cmd_get_token(app_handle.clone());

                    // Bridge sync shortcut callback → async PTT session via tokio runtime handle
                    if let Ok(handle) = tokio::runtime::Handle::try_current() {
                        handle.spawn(async move {
                            let _ = crate::voice::ptt::start_ptt_session(
                                app_handle,
                                worker_url,
                                app_token,
                                audio_cues,
                            )
                            .await;
                        });
                    } else {
                        eprintln!("PTT: no tokio runtime handle available");
                    }
                }
                ShortcutState::Released => {
                    crate::voice::ptt::stop_ptt_session(audio_cues);
                }
            }
        })?;

    Ok(())
}

/// Update the global shortcut: unregister old, register new (per D-06).
pub fn update_shortcut(
    app: &tauri::AppHandle,
    old_shortcut_str: &str,
    new_shortcut_str: &str,
) -> Result<(), Box<dyn std::error::Error>> {
    // Unregister old shortcut
    if let Ok(old_shortcut) = old_shortcut_str.parse::<Shortcut>() {
        let _ = app.global_shortcut().unregister(old_shortcut);
    }

    // Register new shortcut
    let new_shortcut: Shortcut = new_shortcut_str
        .parse()
        .map_err(|_| {
            Box::<dyn std::error::Error>::from(format!("Invalid shortcut: {}", new_shortcut_str))
        })?;

    app.global_shortcut()
        .on_shortcut(new_shortcut, move |app, _shortcut, event| {
            if event.state == ShortcutState::Pressed {
                if let Some(window) = app.get_webview_window("overlay") {
                    let _ = crate::window::toggle_overlay(&window);
                }
            }
        })?;

    Ok(())
}
