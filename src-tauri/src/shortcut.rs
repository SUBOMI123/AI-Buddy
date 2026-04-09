use tauri::Manager;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

/// Register the global shortcut from preferences (per D-06 -- customizable).
/// The shortcut is a toggle (per D-07): press to show, press again to hide.
pub fn register_shortcut(app: &tauri::AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let prefs = crate::preferences::load_preferences(app);
    let shortcut: Shortcut = prefs
        .shortcut
        .parse()
        .expect("Failed to parse shortcut from preferences");

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
