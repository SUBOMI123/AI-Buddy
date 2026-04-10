use hmac::{Hmac, Mac};
use serde::{Deserialize, Serialize};
use sha2::Sha256;
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};
use uuid::Uuid;

type HmacSha256 = Hmac<Sha256>;

// Shared secret -- must match APP_HMAC_SECRET in Worker env.
// This is an app identity proof, not a user secret.
// Embedded at build time; the Worker holds the same value.
const APP_HMAC_SECRET: &str = env!("APP_HMAC_SECRET");

/// Compute signed token: "<uuid>.<hmac_hex>"
fn sign_token(installation_id: &str) -> String {
    let mut mac = HmacSha256::new_from_slice(APP_HMAC_SECRET.as_bytes())
        .expect("HMAC can take key of any size");
    mac.update(installation_id.as_bytes());
    let result = mac.finalize();
    let hex_sig = hex::encode(result.into_bytes());
    format!("{}.{}", installation_id, hex_sig)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Preferences {
    pub shortcut: String,
    pub installation_token: String,
    pub sidebar_edge: String, // "right" or "left"
}

impl Default for Preferences {
    fn default() -> Self {
        Self {
            shortcut: "CommandOrControl+Shift+Space".to_string(),
            installation_token: Uuid::new_v4().to_string(),
            sidebar_edge: "right".to_string(),
        }
    }
}

fn prefs_path(app: &AppHandle) -> PathBuf {
    let dir = app
        .path()
        .app_data_dir()
        .expect("Failed to get app data dir");
    fs::create_dir_all(&dir).ok();
    dir.join("settings.json")
}

pub fn load_preferences(app: &AppHandle) -> Preferences {
    let path = prefs_path(app);
    match fs::read_to_string(&path) {
        Ok(contents) => serde_json::from_str(&contents).unwrap_or_default(),
        Err(_) => {
            // First launch: generate new preferences with unique token
            let prefs = Preferences::default();
            save_preferences(app, &prefs);
            prefs
        }
    }
}

pub fn save_preferences(app: &AppHandle, prefs: &Preferences) {
    let path = prefs_path(app);
    if let Ok(json) = serde_json::to_string_pretty(prefs) {
        let _ = fs::write(&path, json);

        // Restrict file permissions to owner-only on Unix (contains installation token)
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let _ = fs::set_permissions(&path, fs::Permissions::from_mode(0o600));
        }
    }
}

/// Returns the installation token, generating one on first launch if needed.
pub fn get_installation_token(app: &AppHandle) -> String {
    load_preferences(app).installation_token
}

/// Tauri command: get current shortcut binding
#[tauri::command]
pub fn cmd_get_shortcut(app: AppHandle) -> String {
    load_preferences(&app).shortcut
}

/// Tauri command: update shortcut binding and re-register
#[tauri::command]
pub fn cmd_set_shortcut(app: AppHandle, shortcut: String) -> Result<String, String> {
    // Validate the shortcut parses before saving
    let parsed: Result<tauri_plugin_global_shortcut::Shortcut, _> = shortcut.parse();
    if parsed.is_err() {
        return Err(format!("Invalid shortcut: {}", shortcut));
    }

    let mut prefs = load_preferences(&app);
    let old_shortcut = prefs.shortcut.clone();
    prefs.shortcut = shortcut.clone();
    save_preferences(&app, &prefs);

    // Re-register the shortcut
    crate::shortcut::update_shortcut(&app, &old_shortcut, &shortcut)
        .map_err(|e| format!("Failed to update shortcut: {}", e))?;

    Ok(shortcut)
}

/// Tauri command: get signed installation token (used by frontend to set x-app-token header)
/// Returns format: "<uuid>.<hmac_hex_signature>" validated by the Worker auth middleware.
#[tauri::command]
pub fn cmd_get_token(app: AppHandle) -> String {
    let installation_id = get_installation_token(&app);
    sign_token(&installation_id)
}
