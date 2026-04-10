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
    std::thread::spawn(move || {
        use rodio::{DeviceSinkBuilder, Decoder};
        use std::io::Cursor;
        // rodio 0.22 API: DeviceSinkBuilder::open_default_sink() returns MixerDeviceSink.
        // Add source via mixer().add(), then sleep until playback completes.
        let Ok(handle) = DeviceSinkBuilder::open_default_sink() else {
            return; // No audio device — silently skip
        };
        let Ok(source) = Decoder::new(Cursor::new(wav_bytes)) else {
            return; // Decode error — silently skip
        };
        // Estimate duration: WAV at 44100Hz, 16-bit mono ~= n_samples/44100 seconds
        // We parse from the WAV header: data chunk size / (sr * channels * bits/8)
        let duration_secs = {
            // ptt_start/stop are ~0.06s at 44100Hz — use a 200ms ceiling for safety
            std::time::Duration::from_millis(200)
        };
        handle.mixer().add(source);
        // Hold the handle alive until playback finishes
        std::thread::sleep(duration_secs);
        // handle drops here, stopping the output stream
    });
}
