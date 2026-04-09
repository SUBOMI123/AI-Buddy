use tauri::{Emitter, WebviewWindow};

/// Toggle the overlay window visibility.
/// When showing, positions to right edge of primary monitor and emits "overlay-shown" event.
/// When hiding, emits "overlay-hidden" event.
pub fn toggle_overlay(window: &WebviewWindow) -> tauri::Result<()> {
    if window.is_visible().unwrap_or(false) {
        window.hide()?;
        let _ = window.emit("overlay-hidden", ());
    } else {
        // Position at right edge of primary monitor
        if let Ok(Some(monitor)) = window.primary_monitor() {
            let monitor_size = monitor.size();
            let monitor_position = monitor.position();
            let window_width = 300;
            let scale = monitor.scale_factor();
            let x = monitor_position.x + (monitor_size.width as i32)
                - (window_width as f64 * scale) as i32;
            let y = monitor_position.y;
            let height = monitor_size.height as f64 / scale;

            let _ = window.set_position(tauri::Position::Physical(
                tauri::PhysicalPosition::new(x, y),
            ));
            let _ = window.set_size(tauri::Size::Logical(tauri::LogicalSize::new(
                300.0, height,
            )));
        }
        window.show()?;
        window.set_focus()?;
        let _ = window.emit("overlay-shown", ());
    }
    Ok(())
}

/// Tauri command for frontend to toggle overlay
#[tauri::command]
pub fn cmd_toggle_overlay(window: WebviewWindow) -> Result<(), String> {
    toggle_overlay(&window).map_err(|e| e.to_string())
}
