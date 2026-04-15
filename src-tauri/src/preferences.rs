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
    // Phase 3: Voice settings
    #[serde(default = "default_ptt_key")]
    pub ptt_key: String,
    #[serde(default = "default_audio_cues_enabled")]
    pub audio_cues_enabled: bool,
    #[serde(default = "default_tts_enabled")]
    pub tts_enabled: bool,
    // First launch tracking — false on first read (field absent), true after first launch recorded
    #[serde(default = "default_has_launched_before")]
    pub has_launched_before: bool,
}

fn default_ptt_key() -> String {
    "CommandOrControl+Shift+V".to_string()
}
fn default_audio_cues_enabled() -> bool {
    true
}
fn default_tts_enabled() -> bool {
    false
}
fn default_has_launched_before() -> bool {
    false
}

impl Default for Preferences {
    fn default() -> Self {
        Self {
            shortcut: "CommandOrControl+Shift+Space".to_string(),
            installation_token: Uuid::new_v4().to_string(),
            sidebar_edge: "right".to_string(),
            ptt_key: default_ptt_key(),
            audio_cues_enabled: default_audio_cues_enabled(),
            tts_enabled: default_tts_enabled(),
            has_launched_before: default_has_launched_before(),
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

/// Returns true the very first time it is called (ever) for this installation.
/// Writes the "has_launched_before" marker so all subsequent calls return false.
pub fn is_first_launch(app: &AppHandle) -> bool {
    let mut prefs = load_preferences(app);
    if prefs.has_launched_before {
        return false;
    }
    prefs.has_launched_before = true;
    save_preferences(app, &prefs);
    true
}

/// Tauri command: returns true only on the very first launch of the app.
/// The marker is written atomically on the first call, so subsequent calls
/// (including across restarts) always return false.
#[tauri::command]
pub fn cmd_is_first_launch(app: AppHandle) -> bool {
    is_first_launch(&app)
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

/// Tauri command: get the configured PTT key binding
#[tauri::command]
pub fn cmd_get_ptt_key(app: AppHandle) -> String {
    load_preferences(&app).ptt_key
}

/// Tauri command: update PTT key binding (validates parse before saving)
#[tauri::command]
pub fn cmd_set_ptt_key(app: AppHandle, key: String) -> Result<String, String> {
    let parsed: Result<tauri_plugin_global_shortcut::Shortcut, _> = key.parse();
    if parsed.is_err() {
        return Err(format!("Invalid PTT key: {}", key));
    }
    let mut prefs = load_preferences(&app);
    prefs.ptt_key = key.clone();
    save_preferences(&app, &prefs);
    Ok(key)
}

/// Tauri command: update PTT key binding AND live re-register the global shortcut.
/// Use this (not cmd_set_ptt_key) when changing the PTT key from the settings UI.
/// cmd_set_ptt_key persists only; this command persists + re-registers so the change
/// takes effect immediately without an app restart.
#[tauri::command]
pub fn cmd_update_ptt_shortcut(app: AppHandle, key: String) -> Result<String, String> {
    // Validate key format before touching any state
    let _parsed: Result<tauri_plugin_global_shortcut::Shortcut, _> = key.parse();
    if _parsed.is_err() {
        return Err(format!("Invalid PTT key: {}", key));
    }

    // WR-04: Single read to avoid TOCTOU — two separate load_preferences calls would allow
    // a concurrent preference write (e.g., toggling audio cues) to be silently overwritten.
    let mut prefs = load_preferences(&app);
    let old_key = prefs.ptt_key.clone();
    prefs.ptt_key = key.clone();
    save_preferences(&app, &prefs);

    // Live re-register the shortcut
    crate::shortcut::update_ptt_shortcut(&app, &old_key, &key)
        .map_err(|e| format!("Failed to update PTT shortcut: {}", e))?;

    Ok(key)
}

/// Tauri command: get whether audio cues are enabled
#[tauri::command]
pub fn cmd_get_audio_cues_enabled(app: AppHandle) -> bool {
    load_preferences(&app).audio_cues_enabled
}

/// Tauri command: set whether audio cues are enabled
#[tauri::command]
pub fn cmd_set_audio_cues_enabled(app: AppHandle, enabled: bool) {
    let mut prefs = load_preferences(&app);
    prefs.audio_cues_enabled = enabled;
    save_preferences(&app, &prefs);
}

/// Tauri command: get whether TTS is enabled
#[tauri::command]
pub fn cmd_get_tts_enabled(app: AppHandle) -> bool {
    load_preferences(&app).tts_enabled
}

/// Tauri command: set whether TTS is enabled
#[tauri::command]
pub fn cmd_set_tts_enabled(app: AppHandle, enabled: bool) {
    let mut prefs = load_preferences(&app);
    prefs.tts_enabled = enabled;
    save_preferences(&app, &prefs);
}

#[cfg(test)]
mod tests {
    use tauri_plugin_global_shortcut::Shortcut;

    fn is_valid_shortcut(key: &str) -> bool {
        key.parse::<Shortcut>().is_ok()
    }

    #[test]
    fn valid_ptt_key_parses() {
        assert!(is_valid_shortcut("CommandOrControl+Shift+B"));
    }

    #[test]
    fn default_ptt_key_parses() {
        assert!(is_valid_shortcut("CommandOrControl+Shift+V"));
    }

    #[test]
    fn invalid_ptt_key_does_not_parse() {
        assert!(!is_valid_shortcut("not a shortcut"));
        assert!(!is_valid_shortcut("ctrl alt 5"));
        assert!(!is_valid_shortcut(""));
    }
}
