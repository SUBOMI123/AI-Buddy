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
    let visible = window.is_visible().unwrap_or(false);
    eprintln!("[toggle_overlay] is_visible={}", visible);
    if visible {
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

        eprintln!("[toggle_overlay] cursor={:?} monitors={}", cursor, monitors.len());
        let mut geometry: Option<(i32, i32, u32, u32)> = None;
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

            eprintln!("[toggle_overlay] monitor pos={:?} size={:?} scale={} → window x={} y={} w={} h={}", pos, size, scale, x, y, window_width_physical, height_physical);

            // Capture geometry — applied on main thread below (AppKit requires it).
            geometry = Some((x, y, window_width_physical, height_physical));
        } else {
            eprintln!("[toggle_overlay] WARNING: no monitor found, showing without repositioning");
        }

        // All AppKit operations must run on the main thread.
        // orderFrontRegardless is the correct API for overlay apps on macOS Sonoma+:
        // it brings the window to front at its level WITHOUT requiring app activation,
        // so the user's current app keeps focus. activateIgnoringOtherApps steals
        // focus and is wrong for a sidebar UX.
        // Set position/size before entering main-thread block.
        // Tauri's own methods handle thread dispatch internally and must NOT be
        // called from within run_on_main_thread (risk of GCD deadlock on macOS).
        if let Some((x, y, w, h)) = geometry {
            let _ = window.set_position(tauri::Position::Physical(
                tauri::PhysicalPosition::new(x, y),
            ));
            let _ = window.set_size(tauri::Size::Physical(
                tauri::PhysicalSize::new(w, h),
            ));
            eprintln!("[toggle_overlay] set_position/size called: x={} y={} w={} h={}", x, y, w, h);
        }

        let window_main = window.clone();
        window.run_on_main_thread(move || {
            // Log actual position to verify it stuck
            if let Ok(pos) = window_main.outer_position() {
                eprintln!("[toggle_overlay] actual outer_position after set: {:?}", pos);
            }

            // show() only — do NOT call set_always_on_top here.
            // set_always_on_top(true) maps to NSFloatingWindowLevel=3 and would
            // RESET our level-25 if it fires after our setLevel:25 objc call.
            let _ = window_main.show();

            // Apply vibrancy AFTER show() — NSVisualEffectView requires an on-screen
            // backing store. Calling it before show() is a silent no-op.
            #[cfg(target_os = "macos")]
            {
                use window_vibrancy::{apply_vibrancy, NSVisualEffectMaterial};
                let vibrancy_result = apply_vibrancy(&window_main, NSVisualEffectMaterial::Sidebar, None, Some(10.0));
                eprintln!("[toggle_overlay] apply_vibrancy result: {:?}", vibrancy_result.is_ok());
            }

            // Raise to NSStatusWindowLevel (25) — above ALL normal app windows
            // including VS Code, browsers, Finder, Notion etc.
            // NSFloatingWindowLevel (3) is not sufficient: frontmost apps can
            // override it. NSStatusWindowLevel sits above all normal app windows
            // and is the correct level for overlay/HUD apps (Alfred, Raycast, etc.).
            #[cfg(target_os = "macos")]
            {
                use objc::{msg_send, sel, sel_impl};
                if let Ok(ns_window_ptr) = window_main.ns_window() {
                    let ns_window = ns_window_ptr as *mut objc::runtime::Object;
                    if !ns_window.is_null() {
                        unsafe {
                            // NSStatusWindowLevel = 25: above all normal app windows.
                            let _: () = msg_send![ns_window, setLevel: 25_i64];
                            let actual_level: i64 = msg_send![ns_window, level];
                            eprintln!("[toggle_overlay] window level after setLevel:25 = {}", actual_level);

                            // NSWindowCollectionBehavior flags (bitfield):
                            //   CanJoinAllSpaces     = 1   — visible on every Space
                            //   Stationary           = 16  — stays put when switching Spaces
                            //   IgnoresCycle         = 64  — excluded from Exposé cycling
                            //   FullScreenAuxiliary  = 256 — appears alongside full-screen apps
                            // Total = 337
                            let _: () = msg_send![ns_window, setCollectionBehavior: 337_u64];
                            let actual_behavior: u64 = msg_send![ns_window, collectionBehavior];
                            eprintln!("[toggle_overlay] collectionBehavior after set = {}", actual_behavior);

                            // orderFrontRegardless: brings window to front without
                            // activating the app (no focus steal).
                            let _: () = msg_send![ns_window, orderFrontRegardless];
                        }
                        eprintln!("[toggle_overlay] orderFrontRegardless called");
                    }
                }
            }

            let _ = window_main.emit("overlay-shown", ());
            eprintln!("[toggle_overlay] main-thread show done, is_visible={:?}", window_main.is_visible());
        })?;
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

/// Apply NSWindowLevel and NSWindowCollectionBehavior to the overlay window at app startup.
/// macOS requires collection behavior to be registered at window creation time — before the
/// user switches to a full-screen Space — so the window is admitted into those Spaces.
/// This is a registration-only call: it does NOT show, focus, or present the window.
pub fn setup_overlay_window(window: &WebviewWindow) -> tauri::Result<()> {
    #[cfg(target_os = "macos")]
    {
        let window_clone = window.clone();
        window.run_on_main_thread(move || {
            use objc::{msg_send, sel, sel_impl};
            if let Ok(ns_window_ptr) = window_clone.ns_window() {
                let ns_window = ns_window_ptr as *mut objc::runtime::Object;
                if !ns_window.is_null() {
                    unsafe {
                        let _: () = msg_send![ns_window, setLevel: 25_i64];
                        eprintln!("[setup_overlay_window] setLevel:25 applied");
                        let _: () = msg_send![ns_window, setCollectionBehavior: 337_u64];
                        eprintln!("[setup_overlay_window] setCollectionBehavior:337 applied");
                    }
                }
            }
        })?;
    }
    Ok(())
}
