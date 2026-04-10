mod permissions;
mod preferences;
mod screenshot;
mod shortcut;
mod tray;
mod voice;
mod window;


#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            window::cmd_toggle_overlay,
            permissions::check_screen_permission,
            permissions::request_screen_permission,
            preferences::cmd_get_shortcut,
            preferences::cmd_set_shortcut,
            preferences::cmd_get_token,
            preferences::cmd_get_ptt_key,
            preferences::cmd_set_ptt_key,
            preferences::cmd_get_audio_cues_enabled,
            preferences::cmd_set_audio_cues_enabled,
            preferences::cmd_get_tts_enabled,
            preferences::cmd_set_tts_enabled,
            screenshot::capture_screenshot,
            screenshot::capture_region,
            window::cmd_open_region_select,
            window::cmd_close_region_select,
            voice::tts::cmd_play_tts,
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

            // Register global shortcut from preferences (per D-06)
            shortcut::register_shortcut(app.handle())
                .map_err(|e| Box::new(std::io::Error::new(std::io::ErrorKind::Other, e.to_string())))?;

            // Register PTT shortcut (Ctrl+Shift+V by default, configurable via preferences)
            shortcut::register_ptt_shortcut(app.handle())
                .map_err(|e| Box::new(std::io::Error::new(std::io::ErrorKind::Other, e.to_string())))?;

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
