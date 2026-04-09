use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::TrayIconBuilder,
    AppHandle, Manager,
};

pub fn create_tray(app: &AppHandle) -> tauri::Result<()> {
    let show_hide = MenuItem::with_id(app, "show_hide", "Show AI Buddy", true, None::<&str>)?;
    let preferences =
        MenuItem::with_id(app, "preferences", "Preferences...", false, None::<&str>)?;
    let separator = PredefinedMenuItem::separator(app)?;
    let quit = MenuItem::with_id(app, "quit", "Quit AI Buddy", true, None::<&str>)?;

    let menu = Menu::with_items(app, &[&show_hide, &separator, &preferences, &separator, &quit])?;

    TrayIconBuilder::new()
        .menu(&menu)
        .tooltip("AI Buddy")
        .on_menu_event(move |app, event| match event.id.as_ref() {
            "show_hide" => {
                if let Some(window) = app.get_webview_window("overlay") {
                    let _ = crate::window::toggle_overlay(&window);
                }
            }
            "quit" => {
                app.exit(0);
            }
            _ => {}
        })
        .build(app)?;

    Ok(())
}
