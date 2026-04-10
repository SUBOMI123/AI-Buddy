use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, WebviewWindow};

#[derive(Serialize, Clone)]
pub struct RegionCoords {
    pub x: u32,
    pub y: u32,
    pub width: u32,
    pub height: u32,
}

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
            // Use half the screen height, anchored to top-right below menu bar
            let menu_bar_height: f64 = if cfg!(target_os = "macos") { 25.0 } else { 0.0 };
            let screen_height = monitor_size.height as f64 / scale;
            let y = monitor_position.y + (menu_bar_height * scale) as i32;
            let height = (screen_height - menu_bar_height) * 0.5;

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

/// Show the full-screen region-select overlay window.
/// Positions to cover the primary monitor exactly before showing.
/// Sets focus so Escape key events are received by the WebView. (D-10)
#[tauri::command]
pub async fn cmd_open_region_select(app: AppHandle) -> Result<(), String> {
    let win = app
        .get_webview_window("region-select")
        .ok_or_else(|| "region-select window not found".to_string())?;

    // Size to cover primary monitor exactly (Pitfall 3: never use fixed pixel dims)
    if let Ok(Some(monitor)) = win.primary_monitor() {
        let pos = monitor.position();
        let size = monitor.size();
        let _ = win.set_position(tauri::Position::Physical(
            tauri::PhysicalPosition::new(pos.x, pos.y),
        ));
        let _ = win.set_size(tauri::Size::Physical(
            tauri::PhysicalSize::new(size.width, size.height),
        ));
    }

    win.show().map_err(|e| e.to_string())?;
    win.set_focus().map_err(|e| e.to_string())?; // Pitfall 2: must set focus after show
    Ok(())
}

/// Hide the region-select overlay window without destroying it. (Pitfall 5)
#[tauri::command]
pub async fn cmd_close_region_select(app: AppHandle) -> Result<(), String> {
    let win = app
        .get_webview_window("region-select")
        .ok_or_else(|| "region-select window not found".to_string())?;
    win.hide().map_err(|e| e.to_string())
}

/// Confirm region selection: hide the overlay and broadcast region-selected to all windows.
/// Combining hide + emit in Rust avoids the JS suspend-on-hide race condition.
#[tauri::command]
pub async fn cmd_confirm_region(
    app: AppHandle,
    x: u32,
    y: u32,
    width: u32,
    height: u32,
) -> Result<(), String> {
    if let Some(win) = app.get_webview_window("region-select") {
        let _ = win.hide();
    }
    app.emit("region-selected", RegionCoords { x, y, width, height })
        .map_err(|e| e.to_string())
}

/// Cancel region selection: hide the overlay and broadcast region-cancelled to all windows.
#[tauri::command]
pub async fn cmd_cancel_region(app: AppHandle) -> Result<(), String> {
    if let Some(win) = app.get_webview_window("region-select") {
        let _ = win.hide();
    }
    app.emit("region-cancelled", ())
        .map_err(|e| e.to_string())
}
