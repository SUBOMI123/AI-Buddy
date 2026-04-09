# Technology Stack

**Project:** AI Buddy
**Researched:** 2026-04-09

---

## Recommended Stack

### Core Framework

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Tauri | 2.10.3 (stable) | App shell, IPC, window management, system tray | Only cross-platform desktop framework hitting the 15-30MB RAM target. Electron idles at 150-300MB; Tauri idles at 10-30MB. Stable as of Oct 2024, minor updates through early 2026. |
| Rust | 1.85+ | Backend logic, screen capture, audio I/O, storage | Required by Tauri. All performance-critical operations (capture, encoding, STT streaming) must live in Rust, not JS. |
| SolidJS | latest | Frontend UI (overlay, tray window) | Smallest runtime of the viable options (~7kB vs React's 42kB). True reactivity without virtual DOM overhead. Tauri is frontend-agnostic; SolidJS minimizes the WebView footprint. Do not use React — its bundle size and VDOM reconciliation are unnecessary overhead for what is essentially a chat overlay. |
| Vite | 6.x | Frontend build | Standard Tauri v2 scaffolding uses Vite. Fast HMR, minimal config. |
| TypeScript | 5.x | Frontend type safety | Non-negotiable for maintainability at any team size. |

### Screen Capture

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| xcap | 0.9.4 | Cross-platform screenshots | Pure Rust, actively maintained (0.9.4 released 2026-04-09). Supports macOS, Windows, Linux. Used as the engine under `tauri-plugin-screenshots`. Simpler API than scap for the screenshot-only use case. Handles monitor and window enumeration natively. |
| scap | 0.1.0-beta.1 | Fallback / future video frames | High-performance alternative using ScreenCaptureKit (macOS), Windows.Graphics.Capture, and Pipewire (Linux). Currently in beta. Prefer xcap for V1 stills; evaluate scap for V2 video/frame streaming. |
| image crate | 0.25.x | Image encoding (PNG → JPEG → base64) | Required to encode captured frames to JPEG (smaller than PNG) before base64-encoding for Claude API vision calls. Standard Rust image processing library. |
| base64 crate | 0.22.x | Base64 encoding for Claude vision API | Encode JPEG bytes to base64 string for Anthropic Messages API image blocks. |

**Decision: xcap over windows-capture.** xcap is a single crate that handles both Windows and macOS. `windows-capture` is Windows-only and would require per-platform branching. For V1 covering macOS + Windows, xcap is the correct abstraction.

**Decision: Screenshots, not video frames, for V1.** The user initiates capture (push-to-talk model). On voice input, capture one screenshot, send to Claude. Video streaming is a V2 problem that needs scap's more complex pipeline.

### Voice I/O — Speech-to-Text

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| cpal | 0.15.x | Microphone audio capture | Low-level cross-platform audio I/O. Direct OS integration (WASAPI on Windows, CoreAudio on macOS). Used by tauri-plugin-mic-recorder under the hood. Use directly in Rust backend for push-to-talk VAD control. |
| AssemblyAI Streaming API | v3 (Universal-3) | Cloud STT | Sub-300ms P50 latency over WebSocket. Clicky (the reference implementation) uses AssemblyAI — this is the validated path. Universal-3 Pro gives highest accuracy. Proxy through Cloudflare Worker so API key never ships in binary. |
| tokio-tungstenite | 0.21.x | WebSocket client for STT stream | Async WebSocket in Rust for the AssemblyAI streaming connection. Works natively with Tokio runtime (which Tauri v2 uses). |

**Decision: AssemblyAI over local Whisper (via tauri-plugin-stt).** tauri-plugin-stt downloads Vosk models locally — low accuracy, large model download on first run, no streaming. AssemblyAI's Universal-3 streaming gives sub-300ms results without shipping a 300MB model. For an app where voice is the primary input channel, accuracy is non-negotiable. Use the proxy pattern to keep API keys off the binary.

**Decision: cpal directly over tauri-plugin-mic-recorder.** The plugin is a thin wrapper that saves WAV files — wrong model for streaming. Push-to-talk requires: open audio stream on keydown, stream PCM chunks over WebSocket to AssemblyAI, close on keyup. Direct cpal gives that control.

### Voice I/O — Text-to-Speech

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| ElevenLabs API (Turbo v2.5) | HTTP streaming | TTS for AI guidance output | ElevenLabs is the Clicky-validated path. Turbo v2.5 is ~250-300ms latency, better quality than Flash for instructional speech. Stream audio response and play via rodio to start playback before full generation completes. |
| elevenlabs-sdk (Rust) | crates.io | ElevenLabs REST/WebSocket client | Official-ish Rust SDK on crates.io covering 220+ endpoints including WebSocket TTS streaming. Reduces boilerplate vs raw reqwest. |
| rodio | 0.19.x | Audio playback | Built on cpal. Decode and play streaming MP3/PCM from ElevenLabs. Used to play TTS output through system audio. |

**Decision: ElevenLabs over OS TTS (tauri-plugin-tts).** OS TTS (AVSpeechSynthesizer on macOS, SAPI on Windows) sounds robotic and varies across OS versions. For a product where voice output is the primary UX, voice quality directly impacts perceived quality. ElevenLabs is the proven choice here. Cost is acceptable at the usage model (user-initiated, not continuous).

### AI Backend

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Claude API (claude-3-5-sonnet or claude-3-7-sonnet) | Messages API | Vision + reasoning for task guidance | Project spec mandates Claude. claude-3-5-sonnet for cost/speed, claude-3-7-sonnet for complex UI reasoning. Use vision API with base64 JPEG screenshots. |
| reqwest | 0.12.x | HTTP client for Claude API calls | Standard Rust async HTTP client. Tauri v2's official HTTP plugin re-exports reqwest. Use directly in Rust backend for full control over request construction and streaming. |
| serde / serde_json | 1.x | JSON serialization for API request/response | Universal Rust serialization. Required for Claude Messages API JSON bodies. |

**Decision: All AI calls go through Cloudflare Worker proxy.** The Cloudflare Worker holds the API keys. The Tauri app calls `https://your-worker.workers.dev/claude` with a short-lived token or HMAC signature. This means zero secrets in the binary, and rate-limiting/cost controls can be added at the proxy layer without app updates.

### Local Storage and Knowledge Graph

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| rusqlite | 0.31.x | SQLite binding for Rust | Direct, zero-overhead SQLite. The official Tauri SQL plugin (sqlx-based) is heavier and requires async where sync reads are fine. Use rusqlite directly in Rust backend with tauri::command wrappers. |
| sqlite-vec | 0.x | Vector search extension for SQLite | Enables semantic similarity search over user knowledge without a separate vector DB process. Pure C, no dependencies, runs in-process with SQLite via rusqlite's extension loading. Use for finding similar past struggles/completions when generating personalized guidance. |

**Schema outline for V1:**

```sql
-- What the user has tried to do
CREATE TABLE tasks (
  id INTEGER PRIMARY KEY,
  intent TEXT NOT NULL,           -- "I want to export a PDF from Figma"
  app_context TEXT,               -- "Figma" (inferred from screenshot)
  completed INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL
);

-- Per-step outcomes
CREATE TABLE steps (
  id INTEGER PRIMARY KEY,
  task_id INTEGER REFERENCES tasks(id),
  step_number INTEGER,
  guidance TEXT NOT NULL,         -- what AI said
  outcome TEXT,                   -- "done", "confused", "skipped"
  created_at INTEGER NOT NULL
);

-- Aggregate knowledge gaps
CREATE TABLE knowledge_items (
  id INTEGER PRIMARY KEY,
  concept TEXT NOT NULL,          -- "exporting", "layer panels"
  app_context TEXT,
  struggle_count INTEGER DEFAULT 0,
  success_count INTEGER DEFAULT 0,
  embedding BLOB,                 -- float32 vector via sqlite-vec
  updated_at INTEGER NOT NULL
);
```

**Decision: SQLite over graph databases (GraphLite, Grafeo, IndraDB).** The knowledge model for V1 is simple: tasks, steps, outcomes, concepts. A relational schema with adjacency lists covers the graph needs without the operational complexity of a dedicated graph engine. Add sqlite-vec for semantic retrieval. Promote to a proper graph DB in V2 only if query patterns demand it.

**Decision: rusqlite over official tauri-plugin-sql.** The official plugin uses sqlx, which is async-first and optimized for server workloads. rusqlite is synchronous, simpler to use from `tauri::command` handlers, and has better support for SQLite extensions (critical for sqlite-vec). Run DB operations on a dedicated thread via `std::thread::spawn` or `tokio::task::spawn_blocking` to avoid blocking the async runtime.

### API Proxy

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Cloudflare Workers | (serverless) | Proxy Claude + AssemblyAI + ElevenLabs API calls | Zero API keys in binary. Free tier: 100,000 requests/day. Edge-deployed globally. Simple TypeScript worker, ~50 lines. Validates app identity via HMAC or short-lived token in request header. |
| Hono | 4.x | Worker routing framework | Lightweight TypeScript router for Cloudflare Workers. Makes multi-route proxies (Claude, STT, TTS) readable. Adds zero cold-start cost. |

### Development Tooling

| Technology | Purpose | Why |
|------------|---------|-----|
| Cargo workspaces | Rust project organization | Split app into: `core` (screen cap, audio, storage), `ai-client` (Claude proxy calls), `tauri-app` (commands and event plumbing). Faster incremental builds. |
| cargo-tauri CLI | Tauri build/dev | Standard toolchain. `cargo tauri dev` for local. `cargo tauri build` for signed binaries. |
| TypeScript + Vite | Frontend build | Standard Tauri v2 scaffold. No additional config needed. |

---

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| App shell | Tauri v2 | Electron | 10x RAM overhead. For an always-on background process, this kills the product experience. Non-negotiable. |
| App shell | Tauri v2 | Flutter Desktop | No mature Rust interop. Screen capture in Dart is painful. Community smaller than Tauri. |
| Screen capture | xcap | windows-capture | Windows-only. Forces platform branching. xcap covers both platforms. |
| Screen capture | xcap | scap | scap is beta (v0.1.0-beta.1). Use for V2 frame streaming. xcap is stable for V1 screenshots. |
| Frontend | SolidJS | React | React bundle is ~6x larger. VDOM overhead irrelevant for this use case. SolidJS is a strict upgrade for a performance-sensitive overlay. |
| Frontend | SolidJS | Svelte 5 | Both are valid. SolidJS wins on pure runtime performance; Svelte wins on DX. Choose SolidJS if any team member already knows it; choose Svelte if team is React-native. Either is acceptable — this is a LOW confidence call. |
| STT | AssemblyAI | tauri-plugin-stt (Vosk) | Vosk models are offline but require 40-300MB download on first run, have noticeably lower accuracy, and don't support streaming. Wrong tradeoff for voice-first UX. |
| STT | AssemblyAI | Deepgram | Both are viable. AssemblyAI is the Clicky-validated choice. Stick with it unless accuracy issues emerge in testing. |
| TTS | ElevenLabs | OS native TTS | Robot voice. Unacceptable for a product where voice is the primary output channel. |
| TTS | ElevenLabs | OpenAI TTS | ElevenLabs has better voice quality at equivalent latency. Clicky-validated path. |
| Local DB | rusqlite | tauri-plugin-sql (sqlx) | sqlx is async-heavy; rusqlite is simpler for sync Tauri commands and supports SQLite extensions (sqlite-vec). |
| Local DB | rusqlite + SQLite | GraphLite / Grafeo | V1 data model is relational with simple associations. Dedicated graph DB adds operational complexity with no V1 benefit. |
| AI model | Claude | GPT-4o | Project constraint specifies Claude. Claude's vision is strong for UI reasoning. |

---

## Installation

```bash
# Scaffold Tauri v2 app
cargo install create-tauri-app
npm create tauri-app@latest ai-buddy -- --template solid-ts

# Key Rust crates (add to src-tauri/Cargo.toml)
# [dependencies]
# xcap = "0.9"
# cpal = "0.15"
# rodio = { version = "0.19", features = ["mp3"] }
# tokio-tungstenite = { version = "0.21", features = ["native-tls"] }
# reqwest = { version = "0.12", features = ["json", "stream"] }
# serde = { version = "1", features = ["derive"] }
# serde_json = "1"
# rusqlite = { version = "0.31", features = ["bundled"] }
# base64 = "0.22"
# image = { version = "0.25", default-features = false, features = ["jpeg"] }
# elevenlabs-sdk = "*"  # verify latest on crates.io

# Cloudflare Worker (separate repo or monorepo /worker)
npm create cloudflare@latest ai-buddy-proxy -- --template hello-world-ts
npm install hono
```

---

## Confidence Assessment

| Technology | Confidence | Notes |
|------------|------------|-------|
| Tauri v2 | HIGH | Actively maintained at 2.10.3 as of 2026-04-09. Official docs current. |
| xcap for screenshots | HIGH | Version 0.9.4 released 2026-04-09. Actively maintained. docs.rs build failed on 0.9.4 (likely transient) but 0.8.x documented successfully. |
| cpal for mic input | HIGH | Industry standard for Rust audio I/O. Used by tauri-plugin-mic-recorder and rodio. |
| AssemblyAI STT | MEDIUM | API is stable and documented. Clicky uses it successfully. No official Rust SDK — must use tokio-tungstenite directly against WebSocket API. Adds integration work. |
| ElevenLabs TTS | MEDIUM | Rust SDK exists on crates.io (elevenlabs-sdk). WebSocket streaming supported. SDK maturity unverified — may need to fall back to raw reqwest if SDK is incomplete. |
| SolidJS as frontend | MEDIUM | Valid choice, but Tauri community tutorials skew toward React and Svelte. SolidJS works fine but may have fewer Tauri-specific examples to reference. |
| rusqlite + sqlite-vec | MEDIUM | rusqlite is stable. sqlite-vec v0.1.0 is stable per its announcement. Extension loading via rusqlite is supported but requires verifying bundled SQLite version compatibility. |
| scap (future) | LOW | v0.1.0-beta.1 — not production-ready for V1. Watch for stable release. |
| Cloudflare Worker proxy | HIGH | Established pattern. Free tier more than sufficient for private beta. |

---

## Sources

- Tauri v2 releases: https://github.com/tauri-apps/tauri/releases
- Tauri system tray docs: https://v2.tauri.app/learn/system-tray/
- Tauri window customization: https://v2.tauri.app/learn/window-customization/
- xcap crate (docs.rs): https://docs.rs/crate/xcap/latest
- xcap GitHub: https://github.com/nashaofu/xcap
- scap GitHub: https://github.com/CapSoftware/scap
- AssemblyAI Universal Streaming: https://assemblyai.com/docs/universal-streaming
- AssemblyAI streaming blog: https://www.assemblyai.com/blog/streaming-speech-to-text-update
- ElevenLabs Rust SDK: https://crates.io/crates/elevenlabs-sdk
- ElevenLabs streaming docs: https://elevenlabs.io/docs/api-reference/streaming
- tauri-plugin-stt: https://github.com/brenogonzaga/tauri-plugin-stt
- tauri-plugin-tts: https://github.com/brenogonzaga/tauri-plugin-tts
- tauri-plugin-mic-recorder: https://crates.io/crates/tauri-plugin-mic-recorder
- sqlite-vec: https://github.com/asg017/sqlite-vec
- sqlite-vec announcement: https://alexgarcia.xyz/blog/2024/sqlite-vec-stable-release/index.html
- Tauri SQL plugin: https://v2.tauri.app/plugin/sql/
- Cloudflare Workers AI: https://developers.cloudflare.com/workers-ai/
- Tauri v2 + AI desktop app (real-world): https://dev.to/purpledoubled/how-i-built-a-desktop-ai-app-with-tauri-v2-react-19-in-2026-1g47
- CrabNebula UI libraries for Tauri: https://crabnebula.dev/blog/the-best-ui-libraries-for-cross-platform-apps-with-tauri/
- Clicky (reference implementation): https://github.com/farzaa/clicky
