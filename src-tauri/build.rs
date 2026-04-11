fn main() {
    // Fail the build immediately if APP_HMAC_SECRET is missing.
    // Without this, the app compiles and launches but panics at runtime on first token use.
    if std::env::var("APP_HMAC_SECRET").is_err() {
        panic!("APP_HMAC_SECRET env var must be set at build time");
    }
    tauri_build::build()
}
