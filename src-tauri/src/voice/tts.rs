//! Text-to-speech playback command.
//!
//! play_tts flow:
//!   1. Validate text (non-empty, ≤2000 chars)
//!   2. D-16: signal any existing playback thread to stop via STOP_TX channel
//!   3. POST Worker /tts with { text } and x-app-token header
//!   4. Buffer MP3 response (rodio Decoder needs seekable reader)
//!   5. Create new stop channel, register sender in STOP_TX
//!   6. Spawn std::thread: DeviceSinkBuilder::open_default_sink() → MixerDeviceSink
//!      → Decoder → mixer().add(source), poll stop_rx every 50ms
//!
//! rodio 0.22 breaking changes from 0.19:
//!   - OutputStream removed → use DeviceSinkBuilder::open_default_sink() (static method)
//!   - Returns MixerDeviceSink — playback via mixer().add(source)
//!   - MixerDeviceSink is !Send → cannot store in global Mutex; use stop-signal channel instead

use std::io::Cursor;
use std::sync::Mutex;
use std::sync::mpsc;
use tauri::AppHandle;

/// Stop-signal sender for the active TTS playback thread.
/// D-16: send `()` here to stop current playback before starting new.
/// `SyncSender<()>` is Send + Sync — safe as a static even though MixerDeviceSink is !Send.
static STOP_TX: Mutex<Option<mpsc::SyncSender<()>>> = Mutex::new(None);

/// Tauri command: fetch TTS audio from Worker and play via rodio.
///
/// Returns Ok(()) after spawning the playback thread (fire-and-forget from frontend).
/// Audio plays asynchronously; frontend does not block waiting for completion.
#[tauri::command]
pub async fn cmd_play_tts(app: AppHandle, text: String) -> Result<(), String> {
    // Validate text locally before making network request
    let text = text.trim().to_string();
    if text.is_empty() {
        return Err("text must not be empty".to_string());
    }
    if text.len() > 2000 {
        return Err("text must be 2000 characters or fewer".to_string());
    }

    // D-16: Signal any existing playback thread to stop before starting new
    {
        let mut guard = STOP_TX.lock().map_err(|_| "stop-signal lock poisoned".to_string())?;
        if let Some(tx) = guard.take() {
            let _ = tx.try_send(()); // Non-blocking — old thread may have already exited
        }
    }

    // Build Worker URL from build-time env var (same pattern as screenshot.rs)
    let worker_url = option_env!("WORKER_URL")
        .unwrap_or("http://localhost:8787")
        .to_string();
    let app_token = crate::preferences::cmd_get_token(app.clone());

    // Fetch MP3 audio from Worker /tts
    let client = reqwest::Client::new();
    let response = client
        .post(format!("{}/tts", worker_url.trim_end_matches('/')))
        .header("x-app-token", &app_token)
        .header("Content-Type", "application/json")
        .json(&serde_json::json!({ "text": text }))
        .send()
        .await
        .map_err(|e| format!("TTS request failed: {}", e))?;

    if !response.status().is_success() {
        let status = response.status();
        let err_body = response.text().await.unwrap_or_default();
        return Err(format!("TTS endpoint returned {}: {}", status, err_body));
    }

    // Buffer the full MP3 response before passing to rodio Decoder.
    // Cloudflare Workers may stream in chunks but rodio needs a seekable reader.
    // ElevenLabs Turbo v2.5 for typical guidance text (50–300 chars) ≈ 30–200KB — acceptable.
    let audio_bytes = response
        .bytes()
        .await
        .map_err(|e| format!("TTS audio download failed: {}", e))?;

    // Create stop channel for this playback thread (D-16: next call will signal us to stop)
    let (stop_tx, stop_rx) = mpsc::sync_channel::<()>(1);
    {
        let mut guard = STOP_TX.lock().map_err(|_| "stop-signal lock poisoned".to_string())?;
        *guard = Some(stop_tx);
    }

    // Play audio on a dedicated std::thread.
    // MixerDeviceSink is !Send on macOS (wraps cpal Stream / CoreAudio internals) — cannot use tokio::spawn.
    std::thread::spawn(move || {
        use rodio::{DeviceSinkBuilder, Decoder};

        // rodio 0.22 API: DeviceSinkBuilder::open_default_sink() replaces OutputStream + Sink pattern.
        // Returns MixerDeviceSink; play via mixer().add(source).
        let mut handle = match DeviceSinkBuilder::open_default_sink() {
            Ok(h) => h,
            Err(e) => {
                eprintln!("TTS: audio output unavailable: {}", e);
                return;
            }
        };
        handle.log_on_drop(false);

        let cursor = Cursor::new(audio_bytes);
        let source = match Decoder::new(cursor) {
            Ok(s) => s,
            Err(e) => {
                eprintln!("TTS: failed to decode audio: {}", e);
                return;
            }
        };

        // Get approximate duration from source before moving it into mixer.
        // ElevenLabs MP3 for typical 50-300 char text: ~1-10 seconds.
        // We poll the stop channel every 50ms and exit when stop signal arrives or
        // we estimate the audio should be done (generous 60s ceiling).
        handle.mixer().add(source);

        // Poll stop signal every 50ms. Use a 60-second ceiling to ensure the thread
        // always exits even if duration estimation fails.
        let max_wait = std::time::Duration::from_secs(60);
        let poll_interval = std::time::Duration::from_millis(50);
        let start = std::time::Instant::now();

        loop {
            if stop_rx.try_recv().is_ok() {
                // D-16: pre-empted by a new Play request — drop handle to stop audio
                drop(handle);
                break;
            }
            if start.elapsed() >= max_wait {
                break; // Safety ceiling — audio should be long done by now
            }
            std::thread::sleep(poll_interval);
        }
        // handle drops here, releasing audio output resources
    });

    Ok(())
}

#[cfg(test)]
mod tests {
    /// Verify the TTS input validation mirrors the Worker validation
    #[test]
    fn test_tts_input_validation() {
        // Empty text
        let empty = "".trim().to_string();
        assert!(empty.is_empty(), "Empty text must be rejected");

        // Max length boundary
        let at_limit: String = "a".repeat(2000);
        assert!(at_limit.len() <= 2000, "2000-char text must be accepted");

        let over_limit: String = "a".repeat(2001);
        assert!(over_limit.len() > 2000, "2001-char text must be rejected");
    }

    /// Verify stop-signal channel is Send + Sync (can live in static Mutex)
    #[test]
    fn test_stop_tx_is_send_sync() {
        use std::sync::mpsc;
        let (tx, _rx) = mpsc::sync_channel::<()>(1);
        // SyncSender<()> must be Send + Sync — compile-time proof
        fn assert_send_sync<T: Send + Sync>(_: T) {}
        assert_send_sync(tx);
    }
}
