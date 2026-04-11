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
/// When showing, positions to right edge of the monitor containing the cursor and emits "overlay-shown" event.
/// When hiding, emits "overlay-hidden" event.
/// PLAT-01: overlay opens on the monitor where the cursor is, not always primary.
pub fn toggle_overlay(app: &AppHandle, window: &WebviewWindow) -> tauri::Result<()> {
    if window.is_visible().unwrap_or(false) {
        window.hide()?;
        let _ = window.emit("overlay-hidden", ());
    } else {
        // Detect monitor containing cursor; fall back to primary, then first.
        // DO NOT use monitor_from_point() — has coordinate bug on macOS mixed-DPI (Tauri #7890).
        // PLAT-01: overlay must open on the monitor where the cursor is.
        let cursor = app.cursor_position().unwrap_or(tauri::PhysicalPosition::new(0.0, 0.0));
        let monitors = app.available_monitors().unwrap_or_default();

        let active_monitor = monitors.iter().find(|m| {
            let pos = m.position();
            let size = m.size();
            let right = pos.x as f64 + size.width as f64;
            let bottom = pos.y as f64 + size.height as f64;
            cursor.x >= pos.x as f64
                && cursor.x < right
                && cursor.y >= pos.y as f64
                && cursor.y < bottom
        });

        // Fallback chain: cursor's monitor → monitor at (0,0) origin → first in list
        let monitor = active_monitor
            .or_else(|| monitors.iter().find(|m| m.position().x == 0 && m.position().y == 0))
            .or_else(|| monitors.first());

        if let Some(monitor) = monitor {
            let pos = monitor.position();
            let size = monitor.size();
            let scale = monitor.scale_factor();
            let window_width_logical = 300.0_f64;
            let menu_bar_height_logical: f64 = if cfg!(target_os = "macos") { 25.0 } else { 0.0 };

            // FIX Pitfall 2: Use all-Physical units. Old code mixed Physical position + Logical size.
            // On Retina (scale=2.0): logical 300 → physical 600. All math done in physical pixels.
            let window_width_physical = (window_width_logical * scale) as u32;
            let menu_bar_height_physical = (menu_bar_height_logical * scale) as i32;
            let height_physical = ((size.height as f64 - menu_bar_height_logical * scale) * 0.5) as u32;

            let x = pos.x + size.width as i32 - window_width_physical as i32;
            let y = pos.y + menu_bar_height_physical;

            let _ = window.set_position(tauri::Position::Physical(
                tauri::PhysicalPosition::new(x, y),
            ));
            let _ = window.set_size(tauri::Size::Physical(
                tauri::PhysicalSize::new(window_width_physical, height_physical),
            ));
        }

        window.show()?;
        window.set_focus()?;
        let _ = window.emit("overlay-shown", ());
    }
    Ok(())
}

/// Tauri command for frontend to toggle overlay
#[tauri::command]
pub fn cmd_toggle_overlay(app: AppHandle, window: WebviewWindow) -> Result<(), String> {
    toggle_overlay(&app, &window).map_err(|e| e.to_string())
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
    // WR-03: Reject zero-dimension regions before they reach xcap — a 0×0 crop can panic
    // or produce a 0-byte buffer that causes base64/JPEG encode errors downstream.
    if width == 0 || height == 0 {
        return Err("Region dimensions must be greater than zero".to_string());
    }
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
