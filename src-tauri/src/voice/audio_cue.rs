//! PTT audio cues — click sounds on PTT start/stop.
//! Uses rodio 0.22 DeviceSinkBuilder API (breaking change from 0.19).
//! OutputStream was removed in 0.22; use DeviceSinkBuilder::open_default_sink().
//! Sounds are embedded at compile time via include_bytes!.

static PTT_START_WAV: &[u8] = include_bytes!("../../assets/ptt_start.wav");
static PTT_STOP_WAV: &[u8] = include_bytes!("../../assets/ptt_stop.wav");

/// Play the PTT start click cue on the default audio output device.
/// Spawns a short-lived std::thread to avoid blocking the caller.
/// Respects system volume — rodio uses the default output device.
pub fn play_start_cue() {
    play_cue_bytes(PTT_START_WAV);
}

/// Play the PTT stop click cue on the default audio output device.
pub fn play_stop_cue() {
    play_cue_bytes(PTT_STOP_WAV);
}

fn play_cue_bytes(wav_bytes: &'static [u8]) {
    // spawn_blocking runs on tokio's blocking thread pool, which always has a
    // runtime handle. This lets rodio's DeviceSink drop find the runtime and
    // avoids "no tokio runtime handle available" — no manual enter() needed.
    tauri::async_runtime::spawn(async move {
        let _ = tokio::task::spawn_blocking(move || {
            use rodio::{Decoder, DeviceSinkBuilder};
            use std::io::Cursor;
            let Ok(mut sink) = DeviceSinkBuilder::open_default_sink() else {
                return; // No audio device — silently skip
            };
            sink.log_on_drop(false);
            let Ok(source) = Decoder::new(Cursor::new(wav_bytes)) else {
                return; // Decode error — silently skip
            };
            // ptt_start/stop WAVs are ~0.06s — 200ms ceiling for safety
            sink.mixer().add(source);
            std::thread::sleep(std::time::Duration::from_millis(200));
        })
        .await;
    });
}
