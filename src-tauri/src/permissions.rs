/// Check if screen capture permission is granted (macOS only).
/// On Windows and Linux, always returns true.
#[tauri::command]
pub fn check_screen_permission() -> bool {
    #[cfg(target_os = "macos")]
    {
        // Use xcap to attempt a test capture -- if it fails, permission is not granted.
        // This is more reliable than raw CoreGraphics FFI.
        match xcap::Monitor::all() {
            Ok(monitors) => {
                if let Some(monitor) = monitors.first() {
                    monitor.capture_image().is_ok()
                } else {
                    false
                }
            }
            Err(_) => false,
        }
    }
    #[cfg(not(target_os = "macos"))]
    {
        true
    }
}

/// Request screen capture permission (macOS only).
/// On macOS, triggers the system permission dialog.
/// Returns true if permission was already granted or just granted.
#[tauri::command]
pub fn request_screen_permission() -> bool {
    #[cfg(target_os = "macos")]
    {
        // Attempt capture to trigger OS permission dialog
        if let Ok(monitors) = xcap::Monitor::all() {
            if let Some(monitor) = monitors.first() {
                return monitor.capture_image().is_ok();
            }
        }
        false
    }
    #[cfg(not(target_os = "macos"))]
    {
        true
    }
}
