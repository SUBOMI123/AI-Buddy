use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, WebviewWindow};

#[cfg(target_os = "macos")]
use tauri_nspanel::{tauri_panel, CollectionBehavior, StyleMask, WebviewWindowExt};

// Declare all NSPanel subclasses in a single tauri_panel! block.
// The macro imports ObjC types into the current module namespace — calling it
// twice in the same module causes "defined multiple times" compile errors.
//
// AiBuddyOverlayPanel — the sidebar overlay.
//   NonactivatingPanel style mask set at runtime so it never steals focus.
//
// AiBuddyRegionSelectPanel — the fullscreen selection overlay.
//   can_become_key_window=true is REQUIRED so the WebView receives
//   mouse-down/move/up events for drawing the selection rectangle.
//   No NonactivatingPanel style mask (unlike the sidebar) — it MUST be key.
#[cfg(target_os = "macos")]
tauri_panel! {
    panel!(AiBuddyOverlayPanel {
        config: {
            can_become_key_window: true,
            is_floating_panel: true
        }
    })
    panel!(AiBuddyRegionSelectPanel {
        config: {
            can_become_key_window: true,
            is_floating_panel: true
        }
    })
}

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

        let mut geometry: Option<(i32, i32, u32, u32)> = None;
        if let Some(monitor) = monitor {
            let pos = monitor.position();
            let size = monitor.size();
            let scale = monitor.scale_factor();
            let window_width_logical = 300.0_f64;
            let menu_bar_height_logical: f64 = if cfg!(target_os = "macos") { 25.0 } else { 0.0 };

            // All units in physical pixels (Retina scale=2: logical 300 → physical 600).
            let window_width_physical = (window_width_logical * scale) as u32;
            let menu_bar_height_physical = (menu_bar_height_logical * scale) as i32;
            let height_physical = ((size.height as f64 - menu_bar_height_logical * scale) * 0.5) as u32;

            let x = pos.x + size.width as i32 - window_width_physical as i32;
            let y = pos.y + menu_bar_height_physical;

            geometry = Some((x, y, window_width_physical, height_physical));
        }

        // Position/size: Tauri methods handle their own thread dispatch.
        if let Some((x, y, w, h)) = geometry {
            let _ = window.set_position(tauri::Position::Physical(
                tauri::PhysicalPosition::new(x, y),
            ));
            let _ = window.set_size(tauri::Size::Physical(
                tauri::PhysicalSize::new(w, h),
            ));
        }

        // show() dispatches to the main thread internally on macOS — no
        // run_on_main_thread wrapper needed. Vibrancy is set once at startup.
        window.show()?;
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
///
/// NSNonactivatingPanelMask (set in setup_region_select_window) is what makes
/// this work on top of any app without activation. It is the same mask the
/// overlay sidebar uses — clicks are delivered directly to the WKWebView
/// regardless of which app is active or which window is key. No event monitors,
/// no activateIgnoringOtherApps, no makeKeyWindow hacks required.
#[tauri::command]
pub async fn cmd_open_region_select(app: AppHandle) -> Result<(), String> {
    let win = app
        .get_webview_window("region-select")
        .ok_or_else(|| "region-select window not found".to_string())?;

    // Position the overlay to cover the monitor containing the cursor.
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

    let monitor = active_monitor
        .or_else(|| monitors.iter().find(|m| m.position().x == 0 && m.position().y == 0))
        .or_else(|| monitors.first());

    if let Some(m) = monitor {
        let pos = m.position();
        let size = m.size();
        let _ = win.set_position(tauri::Position::Physical(
            tauri::PhysicalPosition::new(pos.x, pos.y),
        ));
        let _ = win.set_size(tauri::Size::Physical(
            tauri::PhysicalSize::new(size.width, size.height),
        ));
    }

    win.show().map_err(|e| e.to_string())
}

/// Hide the region-select overlay window without destroying it.
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
    // WR-03: Reject zero-dimension regions before they reach xcap.
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

/// Convert the region-select NSWindow → NSPanel at app startup.
///
/// Without this, the region-select window is a plain NSWindow. With
/// ActivationPolicy::Accessory, macOS hides NSWindows the moment another app
/// gains focus — so the selection overlay appears for a split second then
/// vanishes (or never renders) when the user is in VS Code, Finder, etc.
///
/// NSPanel with hidesOnDeactivate=false bypasses this: the panel stays on
/// screen above any foreground app. No NonactivatingPanel style mask here —
/// the region-select window MUST become key window so its WebView receives
/// mouse-down/move/up events for drawing the selection rectangle.
pub fn setup_region_select_window(window: &WebviewWindow) -> tauri::Result<()> {
    #[cfg(target_os = "macos")]
    {
        let window_clone = window.clone();
        window.run_on_main_thread(move || {
            match window_clone.to_panel::<AiBuddyRegionSelectPanel>() {
                Ok(panel) => {
                    // Same level as the overlay (NSStatusWindowLevel=25) so it floats
                    // above all normal app windows.
                    panel.set_level(25);

                    // NSNonactivatingPanelMask — the same mask the overlay sidebar uses.
                    // This is the key that makes clicks reach the WKWebView without
                    // requiring the app to be active or the window to be key.
                    // Without this mask, clicks try to activate the app first; on
                    // macOS 14+ activateIgnoringOtherApps is a no-op, so the app stays
                    // inactive, makeKeyWindow fails, and acceptsFirstMouse:NO swallows
                    // the first click — mousedown never fires in JS.
                    // With this mask, clicks are delivered directly to the WKWebView
                    // view hierarchy regardless of app activation state.
                    panel.set_style_mask(StyleMask::empty().nonactivating_panel().into());

                    // CRITICAL: do not hide when another app gains focus.
                    panel.set_hides_on_deactivate(false);

                    // Visible on all Spaces + alongside full-screen apps.
                    panel.set_collection_behavior(
                        CollectionBehavior::new()
                            .can_join_all_spaces()
                            .full_screen_auxiliary()
                            .into(),
                    );
                }
                Err(e) => eprintln!("[setup_region_select_window] ERROR — to_panel failed: {:?}", e),
            }
        })?;
    }
    Ok(())
}

/// Convert the overlay NSWindow → NSPanel at app startup.
///
/// This is the architectural fix for the "invisible on other apps" bug.
/// Root cause: Tauri creates NSWindow. With ActivationPolicy::Accessory, macOS
/// hides NSWindow instances whenever another app gains focus — regardless of
/// window level. NSPanel with isFloatingPanel=true + hidesOnDeactivate=false
/// bypasses this: the panel persists on screen above any foreground app.
///
/// Must be called once at startup (on main thread via run_on_main_thread).
/// Does NOT show or focus the window — that happens in toggle_overlay.
pub fn setup_overlay_window(window: &WebviewWindow) -> tauri::Result<()> {
    #[cfg(target_os = "macos")]
    {
        let window_clone = window.clone();
        window.run_on_main_thread(move || {
            match window_clone.to_panel::<AiBuddyOverlayPanel>() {
                Ok(panel) => {
                    // NSStatusWindowLevel = 25: above all normal app windows
                    panel.set_level(25);

                    // NSNonactivatingPanelMask: panel never steals focus from active app.
                    panel.set_style_mask(StyleMask::empty().nonactivating_panel().into());

                    // CRITICAL: do not hide when another app gains focus.
                    // This is why is_visible=true but the window was invisible —
                    // macOS was removing it from the screen whenever Notion/VS Code
                    // became frontmost. NSPanel + hidesOnDeactivate=false prevents this.
                    panel.set_hides_on_deactivate(false);

                    // Visible on all Spaces + alongside full-screen apps
                    panel.set_collection_behavior(
                        CollectionBehavior::new()
                            .can_join_all_spaces()
                            .full_screen_auxiliary()
                            .into(),
                    );

                    // Apply vibrancy once at startup — NSVisualEffectView persists
                    // across show/hide cycles. Doing this on every show() adds ~30ms
                    // of latency per toggle for no benefit.
                    use window_vibrancy::{apply_vibrancy, NSVisualEffectMaterial};
                    let _ = apply_vibrancy(&window_clone, NSVisualEffectMaterial::Sidebar, None, Some(10.0));
                }
                Err(e) => eprintln!("[setup_overlay_window] ERROR — to_panel failed: {:?}", e),
            }
        })?;
    }
    Ok(())
}
