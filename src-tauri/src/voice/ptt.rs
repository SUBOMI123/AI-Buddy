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
use serde::{Deserialize, Serialize};
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

    // --- std::thread for cpal mic capture (T-03-02: Stream is !Send on macOS) ---
    let pcm_tx_clone = pcm_tx.clone();
    std::thread::spawn(move || {
        let host = cpal::default_host();
        let device = match host.default_input_device() {
            Some(d) => d,
            None => {
                eprintln!("No input device available");
                return;
            }
        };

        let config = match device.default_input_config() {
            Ok(c) => c,
            Err(e) => {
                eprintln!("Failed to get input config: {}", e);
                return;
            }
        };

        let stream = device.build_input_stream(
            &config.into(),
            move |data: &[i16], _| {
                // Convert i16 samples to raw bytes (little-endian PCM)
                let bytes: Vec<u8> = data.iter().flat_map(|s| s.to_le_bytes()).collect();
                let _ = pcm_tx_clone.try_send(bytes);
            },
            |err| eprintln!("cpal stream error: {}", err),
            None,
        );

        let stream = match stream {
            Ok(s) => s,
            Err(e) => {
                eprintln!("Failed to build input stream: {}", e);
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

    // --- Tokio task: WebSocket connection to AssemblyAI ---
    let app_for_ws = app.clone();
    tokio::spawn(async move {
        let ws_url = format!(
            "wss://streaming.assemblyai.com/v3/ws?token={}&sample_rate=16000&encoding=pcm_s16le",
            token
        );

        let (ws_stream, _) = match connect_async(&ws_url).await {
            Ok(conn) => conn,
            Err(e) => {
                IS_PTT_ACTIVE.store(false, Ordering::SeqCst);
                let _ = app_for_ws.emit("stt-error", format!("WebSocket connection failed: {}", e));
                return;
            }
        };

        let (mut ws_write, mut ws_read) = ws_stream.split();

        // Spawn PCM sender task
        let mut stop_rx_clone = stop_rx.clone();
        tokio::spawn(async move {
            loop {
                tokio::select! {
                    frame = pcm_rx.recv() => {
                        match frame {
                            Some(bytes) => {
                                let _ = ws_write.send(Message::Binary(bytes.into())).await;
                            }
                            None => break,
                        }
                    }
                    _ = stop_rx_clone.changed() => {
                        if *stop_rx_clone.borrow() {
                            // T-03-03: Send AssemblyAI v3 terminate message before closing
                            // v3 format: {"type":"Terminate"} (NOT v2 {"terminate_session":true})
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
        // 30-second session timeout (T-03-03: auto-close if session exceeds limit)
        let deadline = tokio::time::Instant::now() + std::time::Duration::from_secs(30);

        loop {
            tokio::select! {
                _ = tokio::time::sleep_until(deadline) => {
                    // Session timeout — stop silently
                    IS_PTT_ACTIVE.store(false, Ordering::SeqCst);
                    break;
                }
                _ = stop_rx.changed() => {
                    if *stop_rx.borrow() { break; }
                }
                msg = ws_read.next() => {
                    match msg {
                        Some(Ok(Message::Text(text))) => {
                            if let Ok(parsed) = serde_json::from_str::<AssemblyAiMessage>(&text) {
                                if parsed.msg_type == "Turn" {
                                    if let Some(transcript) = parsed.transcript {
                                        if parsed.end_of_turn.unwrap_or(false) {
                                            let _ = app_for_ws.emit("stt-final", transcript);
                                        } else {
                                            let _ = app_for_ws.emit("stt-partial", transcript);
                                        }
                                    }
                                }
                            }
                        }
                        Some(Err(e)) => {
                            let _ = app_for_ws.emit("stt-error", format!("WebSocket error: {}", e));
                            IS_PTT_ACTIVE.store(false, Ordering::SeqCst);
                            break;
                        }
                        None => break,
                        _ => {}
                    }
                }
            }
        }
    });

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
