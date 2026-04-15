mod app_context;
mod memory;
mod permissions;
mod preferences;
mod screenshot;
mod shortcut;
mod tray;
mod voice;
mod window;

use tauri::Manager;



#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[allow(unused_mut)]
    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init());

    // tauri-nspanel converts Tauri's NSWindow to NSPanel so the overlay can
    // persist above other apps. NSWindow with ActivationPolicy::Accessory gets
    // hidden by macOS when another app gains focus; NSPanel with
    // hidesOnDeactivate=false bypasses this entirely.
    #[cfg(target_os = "macos")]
    {
        builder = builder.plugin(tauri_nspanel::init());
    }

    builder
        .invoke_handler(tauri::generate_handler![
            window::cmd_toggle_overlay,
            permissions::check_screen_permission,
            permissions::request_screen_permission,
            preferences::cmd_is_first_launch,
            preferences::cmd_get_shortcut,
            preferences::cmd_set_shortcut,
            preferences::cmd_get_token,
            preferences::cmd_get_ptt_key,
            preferences::cmd_set_ptt_key,
            preferences::cmd_update_ptt_shortcut,
            preferences::cmd_get_audio_cues_enabled,
            preferences::cmd_set_audio_cues_enabled,
            preferences::cmd_get_tts_enabled,
            preferences::cmd_set_tts_enabled,
            screenshot::capture_screenshot,
            screenshot::capture_region,
            window::cmd_open_region_select,
            window::cmd_close_region_select,
            window::cmd_confirm_region,
            window::cmd_cancel_region,
            voice::tts::cmd_play_tts,
            memory::cmd_prepare_guidance_context,
            memory::cmd_record_interaction,
            memory::cmd_get_memory_context,
            memory::cmd_get_skill_profile,
            app_context::cmd_get_active_app,
        ])
        .setup(|app| {
            // Hide from macOS Dock and Cmd+Tab (per FOUND-01, INFRA-02)
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);

            // Ensure installation token is generated on first launch (per D-10)
            let _token = preferences::get_installation_token(app.handle());
            #[cfg(debug_assertions)]
            println!("Installation token generated: {}...", &_token[..8]);

            // Create system tray
            tray::create_tray(app.handle())?;

            // Apply overlay window collection behavior at startup so macOS admits
            // the window into full-screen Spaces before the user first shows it.
            if let Some(overlay_win) = app.get_webview_window("overlay") {
                window::setup_overlay_window(&overlay_win)
                    .map_err(|e| Box::new(std::io::Error::new(std::io::ErrorKind::Other, e.to_string())))?;
            } else {
                eprintln!("[setup] WARNING: overlay window not found, skipping setup_overlay_window");
            }

            // Convert region-select NSWindow → NSPanel so it persists above other apps.
            // Without this, ActivationPolicy::Accessory causes macOS to hide the window
            // the moment any real app gains focus, making region select invisible/broken
            // from VS Code, Finder, Notion, etc.
            if let Some(region_select_win) = app.get_webview_window("region-select") {
                window::setup_region_select_window(&region_select_win)
                    .map_err(|e| Box::new(std::io::Error::new(std::io::ErrorKind::Other, e.to_string())))?;
            } else {
                eprintln!("[setup] WARNING: region-select window not found, skipping setup_region_select_window");
            }

            // Register global shortcut from preferences (per D-06)
            shortcut::register_shortcut(app.handle())
                .map_err(|e| Box::new(std::io::Error::new(std::io::ErrorKind::Other, e.to_string())))?;

            // Register PTT shortcut (Ctrl+Shift+V by default, configurable via preferences)
            shortcut::register_ptt_shortcut(app.handle())
                .map_err(|e| Box::new(std::io::Error::new(std::io::ErrorKind::Other, e.to_string())))?;

            // Phase 5: Initialize learning memory DB (D-07)
            let conn = memory::open_db(app.handle())
                .map_err(|e| Box::new(std::io::Error::new(std::io::ErrorKind::Other, e.to_string())))?;
            app.handle().manage(memory::MemoryDb(std::sync::Mutex::new(conn)));

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
