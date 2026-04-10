# Phase 3: Voice I/O - Research

**Researched:** 2026-04-09
**Domain:** Audio I/O, WebSocket streaming STT, HTTP streaming TTS, Tauri global shortcuts
**Confidence:** MEDIUM-HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**PTT Trigger Key**
- D-01: Push-to-talk uses a **separate** key from the overlay toggle (overlay = Ctrl+Shift+Space)
- D-02: Default PTT key: **Ctrl+Shift+V** (Cmd+Shift+V on macOS). User holds to speak, releases to stop.
- D-03: PTT key is **configurable** in preferences (no settings UI in v1, storage only)
- D-04: Mental model: overlay toggle = open/close, PTT = speak. Two distinct global shortcuts.

**STT Streaming Display**
- D-05: Transcription text **appears live** in the input field as user speaks (real-time streaming, not batch-after-release)
- D-06: Existing `TextInput` controlled value updated incrementally as AssemblyAI sends partial events
- D-07: Partial transcripts overwrite the field value in place (AssemblyAI sends full partial, not deltas)
- D-08: Visual indicator during active PTT: subtle mic icon or pulsing ring on the input field border

**PTT Release Behavior**
- D-09: On key release — transcription **stays in the input field**, user must explicitly press Enter to submit. No auto-submit.
- D-10: Lets users review and correct STT errors before submitting
- D-11: If user holds PTT but says nothing (empty transcript), field stays empty on release

**TTS Behavior**
- D-12: TTS is **opt-in, off by default**. Auto-play is never the default.
- D-13: Each guidance response in `GuidanceList` gets a **"Play" button** (speaker icon)
- D-14: TTS preference persisted in local preferences (same pattern as other prefs)
- D-15: Clicking "Play" calls Worker `/tts` → ElevenLabs → streams audio → plays via rodio
- D-16: No queue management in v1 — clicking "Play" on second item while audio plays stops current and starts new

**Voice + Text Coexistence**
- D-17: **One unified input field** — voice fills the same input as keyboard typing
- D-18: User can freely mix: speak something, edit with keyboard, speak more, hit Enter
- D-19: PTT does NOT clear the field on start

**Audio Feedback for PTT**
- D-20: Subtle audio cues **ON by default** — quiet click on PTT start and stop
- D-21: Sounds are minimal (~1-2KB embedded file). Loud/jarring sounds are unacceptable.
- D-22: Audio cues respect system mute/volume
- D-23: User can disable audio cues in settings (preference flag, no UI in v1)

**STT Failure Handling**
- D-24: STT failure: show inline message **"Didn't catch that — try again"** in input field area
- D-25: Previous text in input field preserved on failure
- D-26: PTT visual indicator returns to idle immediately on error
- D-27: No retry logic in v1 — user tries again manually
- D-28: Worker `/stt` route issues a short-lived AssemblyAI token; Rust opens WebSocket directly

**TTS Volume & Rate**
- D-29: Use **system audio defaults** — no custom volume/rate controls in v1
- D-30: No volume slider or speed control

### Claude's Discretion
- PTT key detection mechanism in Rust (global hotkey vs local key event)
- AssemblyAI WebSocket session lifecycle (open on PTT start, close on release or silence)
- rodio playback specifics (MP3 decode, stream vs buffer)
- Exact visual treatment of PTT listening state (mic icon, border color, animation)
- Worker `/stt` token endpoint implementation details (token TTL, scoping)
- ElevenLabs voice ID selection (pick a clear, natural-sounding voice)
- Whether to use `cpal` directly or `rodio` for audio cues (whichever is simpler for short clips)

### Deferred Ideas (OUT OF SCOPE)
- Barge-in / interruption support (VOICE-03, v2)
- Conversational follow-up (VOICE-04, v2)
- PTT settings UI (store preference in v1, UI later)
- TTS voice customization
- Volume/speed controls for TTS

</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| VOICE-01 | Push-to-talk voice input via speech-to-text (AssemblyAI streaming) | AssemblyAI Universal Streaming v3 WebSocket; cpal mic capture; tokio-tungstenite; Tauri global-shortcut Pressed/Released states enable hold-to-talk |
| VOICE-02 | Voice output via text-to-speech for eyes-on-screen guidance (ElevenLabs) | ElevenLabs `/v1/text-to-speech/{voice_id}/stream` endpoint; rodio 0.22 Decoder+Player for MP3 playback; Cloudflare Worker `/tts` proxy route |

</phase_requirements>

---

## Summary

Phase 3 layers two real-time audio pipelines on top of the Phase 2 text loop:

**STT pipeline (VOICE-01):** User presses and holds Ctrl+Shift+V → Tauri global-shortcut `ShortcutState::Released` triggers `start_ptt` Rust command → cpal opens mic input stream → Rust opens WebSocket to `wss://streaming.assemblyai.com/v3/ws` using a short-lived token fetched from Worker `/stt` → PCM audio frames (16kHz, 16-bit, mono) stream over WebSocket → AssemblyAI sends `{ type: "Turn", transcript: "...", end_of_turn: false }` partial messages → Rust emits `stt-partial` Tauri events → SolidJS updates input field value reactively → on key release, `stop_ptt` sends `{ type: "Terminate" }` to WebSocket, stops cpal stream, waits for final `end_of_turn: true` turn → `stt-final` event emitted → text stays in field for user to submit.

**TTS pipeline (VOICE-02):** When TTS is enabled and user clicks "Play" on a guidance item → `play_tts(text)` Rust command → POST to Worker `/tts` with text → Worker proxies to ElevenLabs `/v1/text-to-speech/{voice_id}/stream` → MP3 bytes stream back → rodio 0.22 `DeviceSinkBuilder` + `Decoder::try_from(cursor)` plays audio → any concurrent playback is stopped first (D-16).

**Critical insight:** cpal `Stream` is not `Send` on macOS (CoreAudio thread constraint). The mic stream must live on a dedicated OS thread with audio data sent over a `tokio::sync::mpsc` channel to the async WebSocket sender task. This is the single biggest architectural pitfall in this phase.

**Primary recommendation:** Spawn a dedicated `std::thread` for cpal mic capture. Use `tokio::sync::mpsc` to pass PCM frames to the tokio task that drives the WebSocket. Keep the cpal `Stream` handle alive in the thread; drop it on PTT release.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| cpal | 0.17.3 | Microphone capture (PCM input stream) | Cross-platform audio I/O; used by rodio internally; CoreAudio on macOS, WASAPI on Windows |
| tokio-tungstenite | 0.29.0 | WebSocket client for AssemblyAI STT stream | Async WebSocket on Tokio runtime (which Tauri v2 uses); most downloaded WS crate |
| rodio | 0.22.2 | TTS audio playback and PTT click cues | Built on cpal; handles MP3 decode via symphonia; used across Rust audio ecosystem |
| tauri-plugin-global-shortcut | 2.x (existing) | Hold-to-talk key detection (Pressed + Released states) | Already in project; `ShortcutState::Released` enables hold-to-talk pattern |
| reqwest | 0.12.x (existing) | HTTP call to Worker `/stt` for token | Already in Cargo.toml via Tauri; used for TTS streaming response |
| serde / serde_json | 1.x (existing) | Serialize AssemblyAI WebSocket messages | Already in project |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| tokio::sync::mpsc | (std tokio) | Channel from cpal thread to WS task | Required due to cpal Stream not being Send on macOS |
| std::io::Cursor | (stdlib) | Wrap MP3 bytes for rodio Decoder | Playing TTS response without temp file |
| dasp (optional) | 0.11.0 | Sample rate conversion if mic ≠ 16kHz | Only needed if device doesn't support 16kHz natively |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| elevenlabs-sdk (0.1.0) | Raw reqwest | elevenlabs-sdk was updated 2026-02-18 and is low-version (0.1.0) — API surface unknown; raw reqwest POST to stream endpoint is simpler, more predictable, and matches the existing reqwest pattern in the project |
| dasp resampler | Let cpal handle native rate | Most devices support 16kHz; check config.sample_rate first, only resample if needed |
| rodio for PTT click cues | OS notification sound | rodio is already a dependency; `include_bytes!` + `Decoder::try_from(Cursor::new(bytes))` is simple and self-contained |

**Installation (additions to src-tauri/Cargo.toml):**
```toml
cpal = "0.17"
tokio-tungstenite = { version = "0.29", features = ["native-tls"] }
rodio = { version = "0.22", features = ["mp3"] }
```

**Version verification:** [VERIFIED: crates.io API] — cpal 0.17.3, rodio 0.22.2, tokio-tungstenite 0.29.0 as of 2026-04-09.

---

## Architecture Patterns

### Recommended Project Structure
```
src-tauri/src/
├── voice/
│   ├── mod.rs           # Public exports
│   ├── ptt.rs           # PTT shortcut registration (start_ptt, stop_ptt commands)
│   ├── mic.rs           # cpal mic capture thread + PCM pipeline
│   ├── stt_ws.rs        # AssemblyAI WebSocket session (tokio task)
│   └── tts.rs           # ElevenLabs HTTP stream + rodio playback command
├── shortcut.rs          # Existing — extend with PTT registration
└── preferences.rs       # Existing — extend with ptt_key, tts_enabled, audio_cues_enabled

worker/src/index.ts      # Existing — implement /stt and /tts routes
src/
├── components/
│   ├── TextInput.tsx    # Existing — add pttActive prop, mic icon, border state
│   ├── SidebarShell.tsx # Existing — add "listening" ContentState, stt-partial listener
│   └── GuidanceList.tsx # Existing — add Play button per item when TTS enabled
└── lib/
    └── tauri.ts         # Existing — add startPtt, stopPtt, playTts IPC wrappers
```

### Pattern 1: Hold-to-Talk via Tauri Global Shortcut

**What:** Register PTT key with `ShortcutState::Pressed` → start pipeline; `ShortcutState::Released` → stop pipeline.

**When to use:** The existing `shortcut.rs` only handles `Pressed`. PTT requires both states. Register a second shortcut entry for the PTT key.

```rust
// Source: https://v2.tauri.app/plugin/global-shortcut/
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

pub fn register_ptt_shortcut(app: &tauri::AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let prefs = crate::preferences::load_preferences(app);
    let ptt_shortcut: Shortcut = prefs.ptt_key
        .parse()
        .unwrap_or_else(|_| "CommandOrControl+Shift+V".parse().unwrap());

    app.global_shortcut().on_shortcut(ptt_shortcut, move |app, _shortcut, event| {
        match event.state() {
            ShortcutState::Pressed => {
                // Avoid double-start if key repeat fires
                let _ = crate::voice::ptt::handle_ptt_start(app);
            }
            ShortcutState::Released => {
                let _ = crate::voice::ptt::handle_ptt_stop(app);
            }
        }
    })?;
    Ok(())
}
```

**Key issue:** Keyboard auto-repeat causes multiple `Pressed` events. Use an `AtomicBool` flag to guard against starting the pipeline twice:

```rust
static PTT_ACTIVE: AtomicBool = AtomicBool::new(false);

fn handle_ptt_start(app: &AppHandle) {
    if PTT_ACTIVE.swap(true, Ordering::SeqCst) {
        return; // Already active, ignore key repeat
    }
    // spawn mic thread + WS task
}
```

### Pattern 2: cpal Mic Capture with Channel Bridge

**What:** cpal `Stream` lives on a dedicated OS thread. PCM frames are sent via channel to the async WS task.

**When to use:** Always — cpal Stream is not `Send` on macOS (CoreAudio restriction).

```rust
// Source: https://docs.rs/cpal/latest/cpal/
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use tokio::sync::mpsc;

pub fn start_mic_capture(tx: mpsc::Sender<Vec<u8>>) -> std::thread::JoinHandle<()> {
    std::thread::spawn(move || {
        let host = cpal::default_host();
        let device = host.default_input_device().expect("no mic");

        // Prefer 16kHz mono; fall back to device default and resample if needed
        let config = cpal::StreamConfig {
            channels: 1,
            sample_rate: cpal::SampleRate(16000),
            buffer_size: cpal::BufferSize::Default,
        };

        let stream = device.build_input_stream(
            &config,
            move |data: &[f32], _| {
                // Convert f32 samples to i16 PCM (little-endian)
                let pcm_bytes: Vec<u8> = data.iter()
                    .flat_map(|&s| {
                        let i = (s.clamp(-1.0, 1.0) * i16::MAX as f32) as i16;
                        i.to_le_bytes()
                    })
                    .collect();

                // Non-blocking send — drop frames if WS is slow
                let _ = tx.try_send(pcm_bytes);
            },
            |err| eprintln!("mic error: {err}"),
            None,
        ).expect("failed to build input stream");

        stream.play().expect("failed to start mic");

        // Block thread until the sender side is dropped (ptt_stop drops the receiver)
        // Use a simple parking mechanism:
        std::thread::park();
        // Stream is dropped here, stopping capture
    })
}
```

**Note on sample rate:** macOS default is typically 44100Hz or 48000Hz. If `SampleRate(16000)` is not supported by the device, `build_input_stream` will return an error. Check `device.supported_input_configs()` and resample with `dasp` if needed. [ASSUMED — specific macOS behavior may vary by hardware]

### Pattern 3: AssemblyAI Universal Streaming v3 WebSocket Session

**What:** Tokio async task opens authenticated WebSocket, sends binary PCM frames, receives JSON Turn messages.

**WebSocket URL:** `wss://streaming.assemblyai.com/v3/ws?encoding=pcm_s16le&sample_rate=16000&token={token}` [VERIFIED: assemblyai.com blog]

**Message format:**
- Session begin: `{ "type": "Begin", "id": "session_abc123" }`
- Partial transcript: `{ "type": "Turn", "transcript": "how do I", "end_of_turn": false }`
- Final transcript: `{ "type": "Turn", "transcript": "how do I get started?", "end_of_turn": true }`
- Termination: `{ "type": "Termination" }`
- Client sends to end session: `{ "type": "Terminate" }` (text JSON message)
- Client sends audio: binary WebSocket frames (`Message::Binary(pcm_bytes)`)

```rust
// Source: https://www.assemblyai.com/blog/raw-websocket-voice-agent-with-assemblyai-universal-3-pro-streaming
use tokio_tungstenite::{connect_async, tungstenite::Message};
use futures_util::{SinkExt, StreamExt};

pub async fn run_stt_session(
    token: String,
    mut audio_rx: mpsc::Receiver<Vec<u8>>,
    app: AppHandle,
) {
    let url = format!(
        "wss://streaming.assemblyai.com/v3/ws?encoding=pcm_s16le&sample_rate=16000&token={}",
        token
    );

    let (ws_stream, _) = connect_async(&url).await
        .expect("failed to connect to AssemblyAI");
    let (mut ws_sink, mut ws_reader) = ws_stream.split();

    // Spawn reader task for server messages
    let app_clone = app.clone();
    let reader_task = tokio::spawn(async move {
        while let Some(Ok(msg)) = ws_reader.next().await {
            if let Message::Text(json) = msg {
                if let Ok(val) = serde_json::from_str::<serde_json::Value>(&json) {
                    match val["type"].as_str() {
                        Some("Turn") => {
                            let transcript = val["transcript"].as_str().unwrap_or("");
                            let end_of_turn = val["end_of_turn"].as_bool().unwrap_or(false);
                            if end_of_turn {
                                let _ = app_clone.emit("stt-final", transcript);
                            } else {
                                let _ = app_clone.emit("stt-partial", transcript);
                            }
                        }
                        Some("Begin") => { /* session started */ }
                        Some("Termination") => break,
                        _ => {}
                    }
                }
            }
        }
    });

    // Send PCM frames as binary messages
    while let Some(pcm_bytes) = audio_rx.recv().await {
        if ws_sink.send(Message::Binary(pcm_bytes)).await.is_err() {
            break;
        }
    }

    // Audio channel closed (ptt_stop called) — send terminate
    let _ = ws_sink.send(Message::Text(r#"{"type":"Terminate"}"#.to_string())).await;
    let _ = reader_task.await;
}
```

### Pattern 4: Worker `/stt` Token Endpoint

**What:** Worker calls AssemblyAI token API, returns short-lived token to app.

**AssemblyAI token endpoint:** `GET https://streaming.assemblyai.com/v3/token?expires_in_seconds=60` with `Authorization: {ASSEMBLYAI_API_KEY}` header [VERIFIED: assemblyai.com docs]

**Response:** `{ "token": "abc123...", "expires_in_seconds": 60 }` [VERIFIED: assemblyai.com docs]

```typescript
// worker/src/index.ts — implement /stt stub
app.post('/stt', async (c) => {
  const response = await fetch(
    'https://streaming.assemblyai.com/v3/token?expires_in_seconds=60',
    { headers: { Authorization: c.env.ASSEMBLYAI_API_KEY } }
  );
  if (!response.ok) {
    return c.json({ error: 'Failed to get STT token' }, 502);
  }
  const data = await response.json() as { token: string; expires_in_seconds: number };
  return c.json({ token: data.token });
});
```

**Rust side fetches token before opening WebSocket:**
```rust
// GET worker_url/stt with x-app-token header
let resp = client.post(&format!("{}/stt", WORKER_URL))
    .header("x-app-token", token)
    .send().await?;
let token_resp: SttTokenResponse = resp.json().await?;
// then open WS with token_resp.token
```

### Pattern 5: ElevenLabs TTS HTTP Streaming

**What:** POST to `/v1/text-to-speech/{voice_id}/stream`, receive chunked MP3, play with rodio.

**Endpoint:** `POST https://api.elevenlabs.io/v1/text-to-speech/{voice_id}/stream` [VERIFIED: elevenlabs.io docs]

**Request body:**
```json
{
  "text": "Step 1: Click the File menu...",
  "model_id": "eleven_turbo_v2_5",
  "output_format": "mp3_44100_128"
}
```

**Worker `/tts` proxy:**
```typescript
app.post('/tts', async (c) => {
  const body = await c.req.json() as { text: string };
  const VOICE_ID = 'TxGEqnHWrfWFTfGW9XjX'; // Josh — clear instructional voice
  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}/stream`,
    {
      method: 'POST',
      headers: {
        'xi-api-key': c.env.ELEVENLABS_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: body.text,
        model_id: 'eleven_turbo_v2_5',
        output_format: 'mp3_44100_128',
      }),
    }
  );
  // Stream MP3 back directly
  return new Response(response.body, {
    status: response.status,
    headers: { 'Content-Type': 'audio/mpeg' },
  });
});
```

**Rust TTS command — collect bytes then play:**
```rust
// Source: https://docs.rs/rodio/latest/rodio/
use rodio::{DeviceSinkBuilder, Decoder};
use std::io::Cursor;

#[tauri::command]
pub async fn play_tts(text: String, token: String) -> Result<(), String> {
    let client = reqwest::Client::new();
    let bytes = client
        .post(&format!("{}/tts", WORKER_URL))
        .header("x-app-token", token)
        .json(&serde_json::json!({ "text": text }))
        .send().await
        .map_err(|e| e.to_string())?
        .bytes().await
        .map_err(|e| e.to_string())?;

    // Play on background thread (rodio blocks until playback complete)
    tokio::task::spawn_blocking(move || {
        let sink = DeviceSinkBuilder::open_default_sink()
            .map_err(|e| e.to_string())?;
        let cursor = Cursor::new(bytes.to_vec());
        let source = Decoder::try_from(cursor)
            .map_err(|e| e.to_string())?;
        sink.append(source);
        sink.sleep_until_end();
        Ok::<(), String>(())
    }).await.map_err(|e| e.to_string())??;

    Ok(())
}
```

**Note on D-16 (stop current, start new):** Use a `tokio::sync::watch` or `Arc<AtomicBool>` to signal the current playback task to abort before starting a new one. The `sink.stop()` method on rodio's `Player` handles this cleanly. [ASSUMED — exact rodio 0.22 Player API for stop needs verification against docs.rs]

### Pattern 6: rodio API Change (0.19 → 0.22)

**Critical:** rodio 0.22 has breaking rename from 0.19 (currently not in Cargo.toml — will be added fresh):

| Old (pre-0.22) | New (0.22) |
|-----------------|------------|
| `OutputStream::try_default()` | `DeviceSinkBuilder::open_default_sink()` |
| `OutputStreamHandle` | removed — use `sink.mixer()` |
| `Sink::new(&handle)` | `Player::connect_new(sink.mixer())` |
| `Decoder::new(BufReader::new(f))` | `Decoder::try_from(f)` |
| f32/i16/u16 generic | f32 everywhere |

[VERIFIED: github.com/RustAudio/rodio UPGRADE.md]

### Pattern 7: PTT Audio Click Cue

**What:** Embed short WAV files in binary, play on PTT start/stop.

```rust
// Embed 1-2KB WAV click sounds at compile time
static PTT_START_SOUND: &[u8] = include_bytes!("../assets/ptt_start.wav");
static PTT_STOP_SOUND: &[u8] = include_bytes!("../assets/ptt_stop.wav");

fn play_click(sound: &'static [u8]) {
    // Fire-and-forget on separate thread
    std::thread::spawn(move || {
        if let Ok(sink) = DeviceSinkBuilder::open_default_sink() {
            let cursor = Cursor::new(sound);
            if let Ok(source) = Decoder::try_from(cursor) {
                sink.append(source);
                sink.sleep_until_end();
            }
        }
    });
}
```

**Sound format:** WAV preferred over MP3 for click cues — no decode overhead, smaller library footprint for this use case. A 100ms WAV at 16kHz mono is ~3.2KB. [ASSUMED — format preference based on simplicity, not benchmarked]

### Pattern 8: Frontend SolidJS Integration

**What:** Listen to Tauri events in `SidebarShell`, update input field value reactively.

**TextInput must become controlled from parent** (currently it manages `value` internally with `createSignal`). Two options:
1. Lift the `value` signal to `SidebarShell` and pass `value`/`setValue` as props to `TextInput` — recommended, clean
2. Emit a custom DOM event from `SidebarShell` to `TextInput` — unnecessary complexity

```typescript
// SidebarShell.tsx — extended with PTT state
type ContentState = "empty" | "loading" | "streaming" | "error" | "listening";

// In onMount:
const unlistenPartial = await listen<string>("stt-partial", (event) => {
    setInputValue(event.payload); // overwrite with full partial
    setContentState((prev) => prev === "listening" ? "listening" : prev);
});
const unlistenFinal = await listen<string>("stt-final", (event) => {
    setInputValue(event.payload);
    setContentState("empty"); // return to idle
    setPttActive(false);
});
const unlistenError = await listen<string>("stt-error", (event) => {
    setSttError(event.payload); // "Didn't catch that — try again"
    setContentState("empty");
    setPttActive(false);
});
```

### Anti-Patterns to Avoid

- **Putting cpal Stream in Arc<Mutex>:** cpal `Stream` is not `Send`. You cannot share it across threads. Instead, keep it in the thread that created it; communicate via channel.
- **Auto-submit on `end_of_turn: true`:** Decision D-09 explicitly forbids auto-submit. The final transcript goes to the input field only.
- **Using `elevenlabs-sdk` v0.1.0 for HTTP streaming:** The SDK's HTTP streaming API is not well-documented at this version. Use raw reqwest directly — the Worker already handles the proxy complexity.
- **Opening WebSocket before getting token:** Token fetch can fail (Worker down, rate limit). Always handle token fetch error before attempting WebSocket connection.
- **Blocking the Tauri async runtime:** Never call `sink.sleep_until_end()` on the Tauri command thread. Always spawn blocking work with `tokio::task::spawn_blocking`.
- **Key repeat for PTT start:** macOS fires repeated `Pressed` events while key is held. Guard with `AtomicBool` flag.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| PCM audio capture | Custom CoreAudio/WASAPI bindings | cpal 0.17.3 | Cross-platform, handles device enumeration, format negotiation |
| WebSocket async client | Custom TCP + upgrade | tokio-tungstenite 0.29 | Handles framing, ping/pong, close handshake, TLS |
| MP3 decode | Custom decoder | rodio + symphonia (built-in) | Symphonia handles MP3, AAC, FLAC, OGG; battle-tested |
| AssemblyAI auth | Custom token signing | Worker `/stt` route | Token never touches app binary; Worker holds ASSEMBLYAI_API_KEY |
| ElevenLabs auth | Pass API key in frontend | Worker `/tts` route | API key never ships in binary (INFRA-01 requirement) |
| Sample rate conversion | Manual interpolation | dasp (if needed) | dasp provides Linear/Sinc interpolators tested against edge cases |

**Key insight:** The audio pipeline has three distinct failure boundaries — mic capture, WebSocket streaming, and playback — each requiring independent error handling. Don't merge them.

---

## Common Pitfalls

### Pitfall 1: cpal Stream Not Send on macOS
**What goes wrong:** Attempting to move `cpal::Stream` into a tokio task or Arc<Mutex> fails to compile on macOS — the type doesn't implement `Send`.
**Why it happens:** CoreAudio requires audio callbacks to run on the thread that created them; cpal intentionally omits `Send` to enforce this.
**How to avoid:** Spawn a `std::thread::spawn` (not tokio task) for cpal. Use `std::thread::park()` to keep the thread alive. Send PCM data to the async world via `tokio::sync::mpsc::Sender`. On ptt_stop, drop the sender to signal the mic thread.
**Warning signs:** Compiler error mentioning `cpal::Stream: !Send` or `cannot move ... between threads safely`.

### Pitfall 2: PTT Key Repeat Causing Multiple WS Sessions
**What goes wrong:** macOS and Windows fire repeated key-down events while a key is held. Without a guard, `handle_ptt_start` opens multiple WebSocket connections.
**Why it happens:** OS key repeat — first event fires at keydown, subsequent events fire after repeat delay (~0.5s, then ~30ms intervals).
**How to avoid:** `static PTT_ACTIVE: AtomicBool`. Check-and-swap on Pressed; only proceed if it was false. Clear on Released.
**Warning signs:** Multiple `stt-partial` events per second with duplicate text, WebSocket connection count growing.

### Pitfall 3: cpal Default Sample Rate ≠ 16kHz
**What goes wrong:** Device's default sample rate is 44100Hz or 48000Hz. Passing `SampleRate(16000)` to `build_input_stream` panics or returns error on some devices. Sending 44100Hz PCM to AssemblyAI (configured for 16kHz) produces garbage transcripts.
**Why it happens:** Not all audio devices support 16kHz natively. Device support varies by platform and hardware.
**How to avoid:** Query `device.supported_input_configs()` first. If 16000Hz is not in the range, use the device's default rate and resample to 16000Hz using the `dasp_signal` crate. Update the AssemblyAI WebSocket URL `sample_rate` parameter to match.
**Warning signs:** `InvalidArgument` from `build_input_stream`; AssemblyAI returning empty or nonsense transcripts.

### Pitfall 4: rodio 0.22 API Break vs CLAUDE.md 0.19.x Documentation
**What goes wrong:** Cargo.toml docs in CLAUDE.md reference `rodio = { version = "0.19", features = ["mp3"] }`. rodio 0.22 has a full API rename. Code written against the 0.19 API (e.g., `OutputStream::try_default()`) fails to compile on 0.22.
**Why it happens:** Major version jumped from 0.19 → 0.22 with breaking renames of all primary types.
**How to avoid:** Use rodio 0.22 API exclusively: `DeviceSinkBuilder::open_default_sink()`, `Decoder::try_from(cursor)`. Pin Cargo.toml to `"0.22"` (not `"0.19"`).
**Warning signs:** Compile errors mentioning `OutputStream`, `OutputStreamHandle` not found.

### Pitfall 5: AssemblyAI Token Expiry Mid-Session
**What goes wrong:** Token TTL is 60 seconds (recommended). If user keeps PTT held for > 60s (unlikely but possible), the token expires mid-session and AssemblyAI closes the WebSocket.
**Why it happens:** AssemblyAI validates token at session start but the session can be closed if token expires before `Termination` is received.
**How to avoid:** Set `expires_in_seconds=120` (still within the 600s max). Treat a closed WS on the read side as an `stt-error`. In v1, no retry — per D-27.
**Warning signs:** WebSocket closes unexpectedly after ~60s of PTT; `stt-error` emitted mid-session.

### Pitfall 6: Blocking rodio Playback on Command Thread
**What goes wrong:** `sink.sleep_until_end()` blocks the current thread until playback completes. If called on the Tauri async command executor thread, it blocks Tauri's runtime, freezing all IPC.
**Why it happens:** rodio is synchronous for playback duration; Tauri async commands run on tokio.
**How to avoid:** Always `tokio::task::spawn_blocking` for any rodio blocking call. Or keep an `Arc<Player>` in state and poll completion separately.
**Warning signs:** Frontend becomes unresponsive during TTS playback; Tauri IPC calls time out.

### Pitfall 7: macOS Microphone Permission Not Triggered
**What goes wrong:** App attempts to open mic but macOS has not prompted user for permission. cpal returns an error silently or captures silence.
**Why it happens:** macOS requires `NSMicrophoneUsageDescription` in `Info.plist` AND `com.apple.security.device.audio-input` (or `com.apple.security.device.microphone`) entitlement in the entitlements file.
**How to avoid:** Add to `src-tauri/Info.plist`:
```xml
<key>NSMicrophoneUsageDescription</key>
<string>AI Buddy needs microphone access to hear your voice commands.</string>
```
Add to `src-tauri/entitlements.plist`:
```xml
<key>com.apple.security.device.audio-input</key>
<true/>
```
[CITED: developer.apple.com/documentation/BundleResources/Entitlements/com.apple.security.device.audio-input]
**Warning signs:** cpal reports device error on first mic open on macOS; no permission prompt appears.

### Pitfall 8: TextInput Value Signal Ownership
**What goes wrong:** `TextInput` currently owns its `value` signal internally. To update it from `stt-partial` Tauri events in `SidebarShell`, we need the signal to live in `SidebarShell`, not `TextInput`.
**Why it happens:** Current architecture: `SidebarShell` → `TextInput(onSubmit only)`. Phase 3 needs `SidebarShell` to push value down.
**How to avoid:** Lift `value`/`setValue` signals to `SidebarShell`. Pass `value: Accessor<string>` and `setValue: Setter<string>` as props to `TextInput`. This is a controlled component pattern standard in SolidJS.
**Warning signs:** STT partial events fire but input field doesn't update; or input field flickers back to empty after partial.

---

## Code Examples

### Fetching AssemblyAI Token from Worker (Rust)
```rust
// Source: assemblyai.com docs — token endpoint GET
#[tauri::command]
pub async fn cmd_get_stt_token(app: AppHandle) -> Result<String, String> {
    let client = reqwest::Client::new();
    let token = crate::preferences::get_signed_token(&app);
    let resp = client
        .post(&format!("{}/stt", WORKER_URL))
        .header("x-app-token", token)
        .send().await
        .map_err(|e| e.to_string())?;
    let body: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
    body["token"].as_str()
        .map(|s| s.to_string())
        .ok_or_else(|| "No token in response".to_string())
}
```

### Emitting Tauri Event from Rust
```rust
// Source: https://v2.tauri.app/develop/calling-frontend/
use tauri::Emitter;

// Inside async WS reader task:
app.emit("stt-partial", transcript_str).map_err(|e| e.to_string())?;
app.emit("stt-final", final_transcript).map_err(|e| e.to_string())?;
app.emit("stt-error", "Didn't catch that — try again".to_string()).map_err(|e| e.to_string())?;
```

### Listening to Tauri Events in SolidJS
```typescript
// Source: https://v2.tauri.app/develop/calling-frontend/
import { listen } from "@tauri-apps/api/event";

// In onMount — returns unlisten function for cleanup
const unlistenPartial = await listen<string>("stt-partial", (e) => {
    setInputValue(e.payload); // replaces, not appends (D-07)
});

onCleanup(() => { unlistenPartial(); });
```

### Playing TTS Audio from Bytes (rodio 0.22)
```rust
// Source: https://docs.rs/rodio/latest/rodio/ — DeviceSinkBuilder API
use rodio::{DeviceSinkBuilder, Decoder};
use std::io::Cursor;

fn play_mp3_bytes(bytes: Vec<u8>) -> Result<(), String> {
    let sink = DeviceSinkBuilder::open_default_sink()
        .map_err(|e| e.to_string())?;
    let cursor = Cursor::new(bytes);
    let source = Decoder::try_from(cursor)
        .map_err(|e| e.to_string())?;
    sink.append(source);
    sink.sleep_until_end(); // blocks — call from spawn_blocking
    Ok(())
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| AssemblyAI v2 streaming (isFinal, text fields) | v3 Turn messages (end_of_turn bool, transcript field) | 2024-2025 | Migration guide exists; v2 format won't parse on v3 endpoint |
| rodio `OutputStream::try_default()` | `DeviceSinkBuilder::open_default_sink()` | rodio 0.22 | Breaking rename; all examples online pre-dating 0.22 are wrong |
| rodio `Decoder::new(BufReader::new(f))` | `Decoder::try_from(f)` | rodio 0.22 | Simpler; no manual BufReader wrapping |
| ElevenLabs `eleven_turbo_v2` | `eleven_turbo_v2_5` (multilingual, lower latency) | 2024 | Use `eleven_turbo_v2_5` as model_id |

**Deprecated/outdated:**
- AssemblyAI v2 WebSocket (`wss://api.assemblyai.com/v2/realtime/ws`): legacy endpoint, replaced by v3
- rodio `OutputStreamHandle`: removed in 0.22
- cpal 0.15.x references in CLAUDE.md: actual latest is 0.17.3 [VERIFIED: crates.io]

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | macOS default mic sample rate is 44100Hz or 48000Hz, not 16000Hz | Pitfall 3 | If device supports 16kHz natively, no resampler needed — low risk |
| A2 | rodio `Player` (0.22 name for Sink) has a `stop()` method for D-16 concurrent playback | Pattern 5 | If stop() doesn't exist, use a different mechanism (drop the sink, use channel signal) |
| A3 | PTT click sound in WAV format is simpler/lighter than MP3 for this use case | Pattern 7 | Inconsequential — both work with rodio; WAV slightly faster to decode |
| A4 | Tauri `app.emit("event", payload)` works from within a `tokio::spawn` task that holds a cloned AppHandle | Pattern 3 | If AppHandle is not Send, task structure needs adjustment — unlikely, AppHandle is Arc-backed |
| A5 | ElevenLabs voice ID `TxGEqnHWrfWFTfGW9XjX` (Josh) is a current premade voice | Pattern 5 | Voices can be deprecated; verify with GET /voices before shipping |

---

## Open Questions

1. **Sample rate negotiation on Windows**
   - What we know: Windows WASAPI may default to 44100Hz or 48000Hz
   - What's unclear: Whether cpal's Windows backend handles `SampleRate(16000)` natively or errors
   - Recommendation: Query `supported_input_configs()` at runtime; implement dasp resampler as fallback on both platforms

2. **D-16: Stop current TTS on new Play click**
   - What we know: rodio 0.22 renames `Sink` to `Player`; Player has pause/play methods
   - What's unclear: Whether `Player::stop()` or `Player::clear()` exists in 0.22 API
   - Recommendation: Store current `Player` in `Arc<Mutex<Option<Player>>>` in Tauri managed state; drop it to stop playback before creating new one

3. **AssemblyAI v3 `end_of_turn_confidence_threshold` parameter**
   - What we know: The WebSocket URL accepts this parameter; it controls how aggressively end-of-turn is detected
   - What's unclear: Optimal threshold for PTT use case where user explicitly signals end via key release (not silence)
   - Recommendation: Do NOT rely on `end_of_turn: true` for PTT stop — use key release as the authoritative stop signal; treat `end_of_turn: true` as a UX signal only

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Rust / cargo | cpal, rodio, tokio-tungstenite | ✓ | 1.85+ (per CLAUDE.md) | — |
| Tauri v2 | Plugin-global-shortcut PTT | ✓ | 2.10.3 (in Cargo.toml) | — |
| macOS microphone entitlement | cpal mic capture | Must add | Info.plist + entitlements | Cannot ship without |
| AssemblyAI API account | STT streaming | ✓ (key in Worker) | v3 | No fallback — required |
| ElevenLabs API account | TTS playback | ✓ (key in Worker) | Turbo v2.5 | TTS feature disabled if unavailable |
| Cloudflare Worker | Token proxy | ✓ (deployed Phase 1) | hono 4.x | Dev mode: use API keys directly via env |

**Missing dependencies with no fallback:**
- macOS microphone entitlement: `com.apple.security.device.audio-input` in `entitlements.plist` and `NSMicrophoneUsageDescription` in `Info.plist` — must be added as Wave 0 task before any mic code runs

**Missing dependencies with fallback:**
- ElevenLabs: TTS feature is opt-in (D-12); app works fully without it

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Manual smoke tests + Rust unit tests (`cargo test`) |
| Config file | none (no automated test runner configured) |
| Quick run command | `cargo test -p ai-buddy 2>&1 | tail -20` |
| Full suite command | `cargo test -p ai-buddy -- --nocapture` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| VOICE-01 | Hold PTT key → mic opens → text appears in field → release → text stays | smoke (manual) | Manual PTT test | ❌ Wave 0 |
| VOICE-01 | `stt-partial` event populates input field value | unit (Tauri test) | `cargo test test_stt_partial_event` | ❌ Wave 0 |
| VOICE-01 | STT failure shows "Didn't catch that — try again" inline | smoke (manual) | Disconnect network, PTT | Manual |
| VOICE-01 | PTT key repeat does not open multiple WebSocket sessions | unit | `cargo test test_ptt_key_repeat_guard` | ❌ Wave 0 |
| VOICE-02 | Play button appears on guidance items when TTS enabled | smoke (manual) | Enable TTS pref, get guidance | Manual |
| VOICE-02 | Clicking Play produces audible speech output | smoke (manual) | Manual playback test | Manual |
| VOICE-02 | Second Play click stops first audio and starts new | smoke (manual) | Manual concurrent play test | Manual |

### Test Scenarios for Verification

**VOICE-01 PTT Flow:**
1. Open overlay, note input field is empty
2. Hold Ctrl+Shift+V and speak "how do I export a PDF"
3. VERIFY: Text appears live in input field while speaking
4. VERIFY: Subtle click sound plays on key press and release
5. VERIFY: PTT mic indicator visible on input field border
6. Release key
7. VERIFY: Final transcript stays in input field (no auto-submit)
8. VERIFY: Click cue plays on release
9. Press Enter to submit
10. VERIFY: Guidance generates normally (Phase 2 flow continues)

**VOICE-01 Error Flow:**
1. Disable network (or use invalid worker URL)
2. Hold PTT and speak
3. VERIFY: "Didn't catch that — try again" appears inline
4. VERIFY: Previous input text preserved (if any)
5. VERIFY: PTT indicator returns to idle

**VOICE-02 TTS Flow:**
1. Enable TTS preference (set `tts_enabled: true` in settings.json)
2. Submit a query and receive guidance
3. VERIFY: Speaker icon "Play" button appears next to guidance text
4. Click Play
5. VERIFY: Audible speech at system volume, pace suitable for following along
6. Click Play on second guidance item while first is still playing
7. VERIFY: First audio stops, second starts immediately

### Sampling Rate
- **Per task commit:** `cargo test -p ai-buddy 2>&1 | tail -20`
- **Per wave merge:** `cargo test -p ai-buddy -- --nocapture` + manual smoke test of PTT flow
- **Phase gate:** Both PTT and TTS manual flows verified green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `src-tauri/entitlements.plist` — add `com.apple.security.device.audio-input` entitlement
- [ ] `src-tauri/Info.plist` — add `NSMicrophoneUsageDescription` key
- [ ] `src-tauri/assets/ptt_start.wav` — embedded click sound (~1-2KB)
- [ ] `src-tauri/assets/ptt_stop.wav` — embedded click sound (~1-2KB)
- [ ] `src-tauri/src/voice/` — module directory and mod.rs
- [ ] `Cargo.toml` additions: `cpal = "0.17"`, `rodio = { version = "0.22", features = ["mp3"] }`, `tokio-tungstenite = { version = "0.29", features = ["native-tls"] }`

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | PTT is local key event; Worker auth already implemented (Phase 1) |
| V3 Session Management | yes | AssemblyAI WebSocket session must terminate on PTT release; no session reuse |
| V4 Access Control | no | Single-user desktop app |
| V5 Input Validation | yes | Worker `/stt` and `/tts`: validate request body presence; reject empty text |
| V6 Cryptography | no | No new crypto — existing HMAC token pattern from Phase 1 applies |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| API key exposure via TTS/STT routes | Information Disclosure | Keys in Cloudflare Worker secrets only (INFRA-01); never in binary |
| Mic capture without user consent | Privacy / Elevation of Privilege | PTT is explicit; macOS gated by permission prompt + entitlement |
| AssemblyAI token reuse across sessions | Tampering | Token is one-time use (verified by AssemblyAI) + 120s TTL |
| Injected text via crafted stt-partial event | Spoofing | Events are local IPC from Rust; no external source can emit them |
| TTS playing unsolicited audio | Denial of Service / Spoofing | TTS only triggers from explicit user "Play" click; no auto-play (D-12) |

---

## Sources

### Primary (HIGH confidence)
- [VERIFIED: crates.io API] — cpal 0.17.3, rodio 0.22.2, tokio-tungstenite 0.29.0 (checked 2026-04-09)
- [CITED: v2.tauri.app/plugin/global-shortcut] — ShortcutState::Pressed and ShortcutState::Released both available
- [CITED: docs.rs/rodio/UPGRADE.md] — Breaking API renames from 0.19 → 0.22 documented
- [CITED: assemblyai.com docs] — GET `https://streaming.assemblyai.com/v3/token?expires_in_seconds=N`, returns `{ token, expires_in_seconds }`
- [CITED: assemblyai.com docs] — WebSocket URL format, Turn message schema with `end_of_turn` bool
- [CITED: elevenlabs.io docs] — POST `/v1/text-to-speech/{voice_id}/stream`, `model_id`, `output_format`
- [CITED: developer.apple.com] — `com.apple.security.device.audio-input` entitlement required for hardened runtime mic access

### Secondary (MEDIUM confidence)
- [WebSearch verified] — cpal `Stream` is not `Send` on macOS; dedicated thread pattern is the standard workaround
- [WebSearch verified] — AssemblyAI v3 message format: Turn/Begin/Termination event types
- [WebSearch verified] — ElevenLabs voice ID for Josh: `TxGEqnHWrfWFTfGW9XjX`, model ID: `eleven_turbo_v2_5`
- [WebSearch verified] — rodio 0.22 `Decoder::try_from(cursor)` for in-memory MP3 decode

### Tertiary (LOW confidence)
- [ASSUMED] — macOS default sample rate forces resampling for most devices
- [ASSUMED] — rodio 0.22 `Player` has a `stop()`/`clear()` method — verify against docs.rs before implementing

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all versions verified against crates.io API on 2026-04-09
- Architecture: HIGH — patterns verified against official Tauri, rodio, AssemblyAI docs; cpal thread constraint is well-documented
- Pitfalls: MEDIUM-HIGH — most verified from official sources; sample rate behavior is ASSUMED for specific hardware
- ElevenLabs voice ID: MEDIUM — sourced from third-party listing; verify with GET /voices before shipping

**Research date:** 2026-04-09
**Valid until:** 2026-05-09 (30 days — AssemblyAI v3 and rodio 0.22 are both recent and stable)
