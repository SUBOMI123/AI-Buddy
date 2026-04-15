//! Push-to-talk state machine and AssemblyAI WebSocket pipeline.
//!
//! Architecture:
//!   PTT Pressed → start_ptt_session()
//!     1. GET Worker /stt → { token }
//!     2. std::thread::spawn → cpal mic capture (Stream is !Send on macOS)
//!     3. tokio WebSocket to AssemblyAI using token
//!     4. mpsc bridge: PCM frames from std::thread → async WebSocket sender
//!     5. Emit stt-partial events on partial transcripts
//!   PTT Released → stop_ptt_session()
//!     1. Signal WebSocket to terminate via STOP_TX channel
//!     2. cpal stream drops when std::thread exits
//!     3. Store false in IS_PTT_ACTIVE

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use futures_util::{SinkExt, StreamExt};
use serde::Deserialize;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use tauri::Emitter;
use tokio::sync::mpsc;
use tokio_tungstenite::{connect_async, tungstenite::Message};

/// Global PTT active guard — prevents key-repeat from opening multiple sessions (T-03-01).
pub static IS_PTT_ACTIVE: AtomicBool = AtomicBool::new(false);

/// Per-session stop signal — replaced each press.
static SESSION_STOP: Mutex<Option<tokio::sync::watch::Sender<bool>>> = Mutex::new(None);

#[derive(Debug, Deserialize)]
struct SttTokenResponse {
    token: String,
}

#[derive(Debug, Deserialize)]
struct AssemblyAiMessage {
    #[serde(rename = "type")]
    msg_type: String,
    transcript: Option<String>,
    end_of_turn: Option<bool>,
}

/// Fetch a short-lived AssemblyAI streaming token from the Worker /stt endpoint.
/// Worker validates HMAC auth before issuing the token (T-03-04).
async fn fetch_stt_token(worker_url: &str, app_token: &str) -> Result<String, String> {
    let client = reqwest::Client::new();
    let url = format!("{}/stt", worker_url.trim_end_matches('/'));
    let resp = client
        .post(&url)
        .header("x-app-token", app_token)
        .header("Content-Type", "application/json")
        .send()
        .await
        .map_err(|e| format!("STT token request failed: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!("STT token endpoint returned {}", resp.status()));
    }

    let body: SttTokenResponse = resp
        .json()
        .await
        .map_err(|e| format!("STT token parse failed: {}", e))?;

    Ok(body.token)
}

/// Start a PTT session: open mic, stream to AssemblyAI, emit Tauri events.
///
/// SAFETY: cpal::Stream is !Send on macOS — mic capture runs in std::thread.
/// PCM frames are sent via tokio::sync::mpsc to the async WebSocket sender.
pub async fn start_ptt_session(
    app: tauri::AppHandle,
    worker_url: String,
    app_token: String,
    audio_cues_enabled: bool,
) -> Result<(), String> {
    // T-03-01: CAS guard — reject key repeat
    if IS_PTT_ACTIVE
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .is_err()
    {
        return Ok(()); // Key repeat — silently ignore
    }

    // Signal frontend immediately so mic indicator appears on key press,
    // not on first transcript (which can take 1-2s of speech).
    let _ = app.emit("ptt-start", ());

    // Audio cue: PTT start click
    if audio_cues_enabled {
        crate::voice::audio_cue::play_start_cue();
    }

    // Fetch short-lived AssemblyAI token from Worker
    let token = match fetch_stt_token(&worker_url, &app_token).await {
        Ok(t) => t,
        Err(e) => {
            IS_PTT_ACTIVE.store(false, Ordering::SeqCst);
            let _ = app.emit("stt-error", e);
            return Ok(());
        }
    };

    // Session stop watch channel — stored so stop_ptt_session can signal
    let (stop_tx, mut stop_rx) = tokio::sync::watch::channel(false);
    if let Ok(mut guard) = SESSION_STOP.lock() {
        *guard = Some(stop_tx);
    }

    // PCM frame channel: std::thread (cpal) → tokio task (WebSocket sender)
    let (pcm_tx, mut pcm_rx) = mpsc::channel::<Vec<u8>>(32);

    // Oneshot channel: cpal thread sends actual sample_rate to async context
    // so the WebSocket URL uses the correct rate (avoids hardcoding 16000).
    let (sr_tx, sr_rx) = tokio::sync::oneshot::channel::<Result<u32, String>>();

    // --- std::thread for cpal mic capture (T-03-02: Stream is !Send on macOS) ---
    let pcm_tx_clone = pcm_tx.clone();
    let app_for_cpal = app.clone();
    std::thread::spawn(move || {
        let host = cpal::default_host();
        let device = match host.default_input_device() {
            Some(d) => d,
            None => {
                let _ = sr_tx.send(Err("No microphone available".to_string()));
                return;
            }
        };

        let supported = match device.default_input_config() {
            Ok(c) => c,
            Err(e) => {
                let _ = sr_tx.send(Err(format!("Mic config error: {}", e)));
                return;
            }
        };

        let sample_rate_val = supported.sample_rate();
        let sample_format = supported.sample_format();
        let config: cpal::StreamConfig = supported.into();
        let channels = config.channels as usize;
        // Decimate to 16 kHz — AssemblyAI pcm_s16le only supports 8/16 kHz.
        // For 48 kHz: keep every 3rd frame. For 44100 Hz: keep every 2nd (~22 kHz,
        // acceptable). For devices already at 16 kHz: factor=1 (no decimation).
        let resample_factor = ((sample_rate_val / 16000) as usize).max(1);

        eprintln!(
            "PTT: mic config — {}Hz, {} ch, {:?}, decimating by {}→16kHz",
            sample_rate_val, channels, sample_format, resample_factor
        );

        // Unblock the async WebSocket task — always 16 kHz after decimation.
        let _ = sr_tx.send(Ok(16000u32));

        // Build stream: mix channels to mono, decimate to 16 kHz, encode as i16 LE.
        let pcm_tx_f32 = pcm_tx_clone.clone();
        let stream = match sample_format {
            cpal::SampleFormat::F32 => device.build_input_stream(
                &config,
                move |data: &[f32], _| {
                    let bytes: Vec<u8> = data
                        .chunks(channels)         // one frame per channel group
                        .step_by(resample_factor) // decimate to 16 kHz
                        .flat_map(|frame| {
                            let mono = if channels == 1 {
                                frame[0]
                            } else {
                                frame.iter().sum::<f32>() / channels as f32
                            };
                            let i = (mono.clamp(-1.0, 1.0) * i16::MAX as f32) as i16;
                            i.to_le_bytes()
                        })
                        .collect();
                    let _ = pcm_tx_f32.try_send(bytes);
                },
                |err| eprintln!("cpal stream error: {}", err),
                None,
            ),
            cpal::SampleFormat::I16 => device.build_input_stream(
                &config,
                move |data: &[i16], _| {
                    let bytes: Vec<u8> = data
                        .chunks(channels)
                        .step_by(resample_factor)
                        .flat_map(|frame| {
                            let mono = if channels == 1 {
                                frame[0]
                            } else {
                                let avg = frame.iter().map(|s| *s as i32).sum::<i32>()
                                    / channels as i32;
                                avg as i16
                            };
                            mono.to_le_bytes()
                        })
                        .collect();
                    let _ = pcm_tx_clone.try_send(bytes);
                },
                |err| eprintln!("cpal stream error: {}", err),
                None,
            ),
            fmt => {
                eprintln!("Unsupported mic sample format: {:?}", fmt);
                IS_PTT_ACTIVE.store(false, Ordering::SeqCst);
                let _ = app_for_cpal.emit("stt-error", "Unsupported microphone format");
                return;
            }
        };

        let stream = match stream {
            Ok(s) => s,
            Err(e) => {
                eprintln!("Failed to build input stream: {}", e);
                IS_PTT_ACTIVE.store(false, Ordering::SeqCst);
                let _ = app_for_cpal.emit("stt-error", format!("Mic error: {}", e));
                return;
            }
        };

        let _ = stream.play();

        // Hold stream alive until IS_PTT_ACTIVE goes false (released or error)
        while IS_PTT_ACTIVE.load(Ordering::SeqCst) {
            std::thread::sleep(std::time::Duration::from_millis(50));
        }
        // stream drops here, mic capture stops
    });

    // Await actual sample_rate from the cpal thread before connecting WebSocket.
    let sample_rate = match sr_rx.await {
        Ok(Ok(sr)) => sr,
        Ok(Err(e)) => {
            IS_PTT_ACTIVE.store(false, Ordering::SeqCst);
            let _ = app.emit("stt-error", e);
            return Ok(());
        }
        Err(_) => {
            IS_PTT_ACTIVE.store(false, Ordering::SeqCst);
            let _ = app.emit("stt-error", "Mic initialisation failed");
            return Ok(());
        }
    };

    // --- Tokio task: WebSocket connection to AssemblyAI ---
    let app_for_ws = app.clone();
    tokio::spawn(async move {
        let ws_url = format!(
            "wss://streaming.assemblyai.com/v3/ws?token={}&sample_rate={}&encoding=pcm_s16le&speech_model=universal-streaming-english",
            token, sample_rate
        );

        eprintln!("PTT: connecting WebSocket");
        let (ws_stream, _) = match connect_async(&ws_url).await {
            Ok(conn) => conn,
            Err(e) => {
                IS_PTT_ACTIVE.store(false, Ordering::SeqCst);
                let _ = app_for_ws.emit("stt-error", format!("WebSocket connection failed: {}", e));
                eprintln!("PTT: WebSocket connect failed: {}", e);
                return;
            }
        };
        eprintln!("PTT: WebSocket connected");

        let (mut ws_write, mut ws_read) = ws_stream.split();

        // Wait for AssemblyAI v3 "Begin" handshake before sending audio.
        // The server closes the connection immediately if the token is wrong.
        match ws_read.next().await {
            Some(Ok(Message::Text(_))) | Some(Ok(Message::Binary(_))) => {
                // Begin handshake received
            }
            Some(Ok(Message::Close(frame))) => {
                let reason = frame.map(|f| format!("{}: {}", f.code, f.reason)).unwrap_or_default();
                eprintln!("PTT: WS closed at handshake: {}", reason);
                IS_PTT_ACTIVE.store(false, Ordering::SeqCst);
                let _ = app_for_ws.emit("stt-error", format!("STT rejected: {}", reason));
                return;
            }
            Some(Ok(_)) => {}
            Some(Err(e)) => {
                eprintln!("PTT: WS error during handshake: {}", e);
                IS_PTT_ACTIVE.store(false, Ordering::SeqCst);
                let _ = app_for_ws.emit("stt-error", format!("STT handshake error: {}", e));
                return;
            }
            None => {
                eprintln!("PTT: WS closed by server before handshake — token rejected or session limit");
                IS_PTT_ACTIVE.store(false, Ordering::SeqCst);
                let _ = app_for_ws.emit("stt-error", "STT connection rejected");
                return;
            }
        }
        eprintln!("PTT: session live, starting audio stream");

        // Spawn PCM sender task
        // AssemblyAI v3 requires frames of 50–1000 ms.
        // At 16 kHz / s16le: 100 ms = 3200 bytes.  Buffer until we hit that.
        let mut stop_rx_clone = stop_rx.clone();
        tokio::spawn(async move {
            let mut pcm_buf: Vec<u8> = Vec::with_capacity(6400);
            const MIN_BYTES: usize = 3200; // 100 ms @ 16 kHz s16le

            loop {
                tokio::select! {
                    frame = pcm_rx.recv() => {
                        match frame {
                            Some(bytes) => {
                                pcm_buf.extend_from_slice(&bytes);
                                if pcm_buf.len() >= MIN_BYTES {
                                    let to_send = std::mem::take(&mut pcm_buf);
                                    let _ = ws_write.send(Message::Binary(to_send.into())).await;
                                }
                            }
                            None => {
                                // Flush remaining audio before exit
                                if !pcm_buf.is_empty() {
                                    let to_send = std::mem::take(&mut pcm_buf);
                                    let _ = ws_write.send(Message::Binary(to_send.into())).await;
                                }
                                break;
                            }
                        }
                    }
                    _ = stop_rx_clone.changed() => {
                        if *stop_rx_clone.borrow() {
                            // Flush buffered audio so final words aren't lost
                            if !pcm_buf.is_empty() {
                                let to_send = std::mem::take(&mut pcm_buf);
                                let _ = ws_write.send(Message::Binary(to_send.into())).await;
                            }
                            // T-03-03: Send AssemblyAI v3 terminate message before closing
                            let terminate = r#"{"type":"Terminate"}"#;
                            let _ = ws_write.send(Message::Text(terminate.to_string().into())).await;
                            let _ = ws_write.close().await;
                            break;
                        }
                    }
                }
            }
        });

        // Read loop: emit Tauri events for transcript messages
        // 30-second session timeout (T-03-03)
        let deadline = tokio::time::Instant::now() + std::time::Duration::from_secs(30);

        loop {
            tokio::select! {
                _ = tokio::time::sleep_until(deadline) => {
                    IS_PTT_ACTIVE.store(false, Ordering::SeqCst);
                    // Reset UI — timeout counts as end of session
                    let _ = app_for_ws.emit("stt-final", "");
                    break;
                }
                _ = stop_rx.changed() => {
                    if *stop_rx.borrow() {
                        eprintln!("PTT: stop signal received, resetting UI");
                        let _ = app_for_ws.emit("stt-final", "");
                        break;
                    }
                }
                msg = ws_read.next() => {
                    match msg {
                        Some(Ok(Message::Text(text))) => {
                            if let Ok(parsed) = serde_json::from_str::<AssemblyAiMessage>(&text) {
                                match parsed.msg_type.as_str() {
                                    "Turn" => {
                                        if let Some(transcript) = parsed.transcript {
                                            if !transcript.is_empty() {
                                                if parsed.end_of_turn.unwrap_or(false) {
                                                    let _ = app_for_ws.emit("stt-final", transcript);
                                                } else {
                                                    let _ = app_for_ws.emit("stt-partial", transcript);
                                                }
                                            }
                                        }
                                    }
                                    "error" => {
                                        eprintln!("PTT: AssemblyAI error: {}", text);
                                        let _ = app_for_ws.emit("stt-error", format!("STT error: {}", text));
                                        IS_PTT_ACTIVE.store(false, Ordering::SeqCst);
                                        break;
                                    }
                                    _ => {}
                                }
                            }
                        }
                        Some(Ok(Message::Binary(bytes))) => {
                            // AssemblyAI v3 may send Turn messages as binary frames
                            let text = match std::str::from_utf8(&bytes) {
                                Ok(s) => s.to_string(),
                                Err(_) => continue,
                            };
                            if let Ok(parsed) = serde_json::from_str::<AssemblyAiMessage>(&text) {
                                match parsed.msg_type.as_str() {
                                    "Turn" => {
                                        if let Some(transcript) = parsed.transcript {
                                            if !transcript.is_empty() {
                                                if parsed.end_of_turn.unwrap_or(false) {
                                                    let _ = app_for_ws.emit("stt-final", transcript);
                                                } else {
                                                    let _ = app_for_ws.emit("stt-partial", transcript);
                                                }
                                            }
                                        }
                                    }
                                    "error" => {
                                        eprintln!("PTT: AssemblyAI error: {}", text);
                                        let _ = app_for_ws.emit("stt-error", format!("STT error: {}", text));
                                        IS_PTT_ACTIVE.store(false, Ordering::SeqCst);
                                        break;
                                    }
                                    _ => {}
                                }
                            }
                        }
                        Some(Ok(Message::Close(frame))) => {
                            let reason = frame.map(|f| format!("{}: {}", f.code, f.reason)).unwrap_or_default();
                            eprintln!("PTT: WS closed by server during stream: {}", reason);
                            let _ = app_for_ws.emit("stt-final", "");
                            break;
                        }
                        Some(Err(e)) => {
                            let _ = app_for_ws.emit("stt-error", format!("WebSocket error: {}", e));
                            IS_PTT_ACTIVE.store(false, Ordering::SeqCst);
                            break;
                        }
                        None => {
                            eprintln!("PTT: WS stream ended by server");
                            let _ = app_for_ws.emit("stt-final", "");
                            break;
                        }
                        _ => {}
                    }
                }
            }
        }
    });

    Ok(())
}

/// Tauri command: start PTT session from frontend (mic button hold-to-record).
/// Reuses the same start_ptt_session pipeline as the keyboard shortcut handler.
/// No-op if PTT is already active (IS_PTT_ACTIVE CAS guard inside start_ptt_session).
#[tauri::command]
pub async fn cmd_ptt_start(app: tauri::AppHandle) -> Result<(), String> {
    if IS_PTT_ACTIVE.load(std::sync::atomic::Ordering::SeqCst) {
        return Ok(()); // already recording
    }
    let worker_url = option_env!("WORKER_URL")
        .unwrap_or("http://localhost:8787")
        .to_string();
    let app_token = crate::preferences::cmd_get_token(app.clone());
    let prefs = crate::preferences::load_preferences(&app);
    let audio_cues = prefs.audio_cues_enabled;
    start_ptt_session(app, worker_url, app_token, audio_cues)
        .await
        .map_err(|e| e.to_string())
}

/// Tauri command: stop PTT session from frontend (mic button release).
/// Reuses the same stop_ptt_session pipeline as the keyboard shortcut handler.
#[tauri::command]
pub fn cmd_ptt_stop(app: tauri::AppHandle) -> Result<(), String> {
    let prefs = crate::preferences::load_preferences(&app);
    stop_ptt_session(prefs.audio_cues_enabled);
    Ok(())
}

/// Stop the current PTT session. Called on ShortcutState::Released.
/// T-03-03: Signals WebSocket to send terminate message and close.
pub fn stop_ptt_session(audio_cues_enabled: bool) {
    // Signal WebSocket task to terminate
    if let Ok(guard) = SESSION_STOP.lock() {
        if let Some(tx) = guard.as_ref() {
            let _ = tx.send(true);
        }
    }
    // AtomicBool reset — allows next key press to open new session
    IS_PTT_ACTIVE.store(false, Ordering::SeqCst);

    // Audio cue: PTT stop click
    if audio_cues_enabled {
        crate::voice::audio_cue::play_stop_cue();
    }
}
