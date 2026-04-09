# Architecture Patterns

**Domain:** AI-powered desktop task-completion assistant (Tauri v2)
**Researched:** 2026-04-09
**Confidence:** HIGH (Tauri IPC, process model, Clicky reference) / MEDIUM (knowledge graph, audio pipeline)

---

## Recommended Architecture

The application is a **pipeline of five loosely coupled subsystems** running inside a single Tauri process. The Rust core owns all I/O and system access; the webview frontend owns all UI rendering. Nothing crosses that boundary except typed JSON messages over Tauri IPC.

```
┌─────────────────────────────────────────────────────────┐
│                    USER INTERACTION                     │
│   System Tray  ──►  Overlay Window  ──►  Input Panel   │
└──────────────────────────┬──────────────────────────────┘
                           │ IPC (Commands + Events)
┌──────────────────────────▼──────────────────────────────┐
│                    TAURI RUST CORE                      │
│                                                         │
│  ┌──────────┐  ┌───────────┐  ┌──────────────────────┐ │
│  │  Screen  │  │   Audio   │  │   Memory / Knowledge │ │
│  │ Capture  │  │ Pipeline  │  │       Graph          │ │
│  └────┬─────┘  └─────┬─────┘  └──────────┬───────────┘ │
│       │              │                    │             │
│  ┌────▼──────────────▼────────────────────▼───────────┐ │
│  │              Session Orchestrator                  │ │
│  │   (assembles context, manages request lifecycle)   │ │
│  └────────────────────────┬───────────────────────────┘ │
└───────────────────────────┼─────────────────────────────┘
                            │ HTTPS (all requests)
┌───────────────────────────▼─────────────────────────────┐
│               CLOUDFLARE WORKER PROXY                   │
│   /chat  →  Anthropic Claude (vision + streaming SSE)   │
│   /tts   →  TTS provider (audio bytes)                  │
│   /stt   →  STT provider token or audio upload          │
└─────────────────────────────────────────────────────────┘
```

---

## Component Boundaries

| Component | Lives In | Responsibility | Communicates With |
|-----------|----------|---------------|-------------------|
| System Tray | Rust (TAO) | Process lifecycle, tray icon + menu, show/hide windows | Window Manager, Keyboard Shortcut listener |
| Window Manager | Rust (tauri::WebviewWindow) | Creates/destroys overlay + panel windows, sets always-on-top / transparent flags | Tray, Frontend via events |
| Overlay Window | Webview (React/Svelte) | Renders step-by-step guidance text, pointer indicators, push-to-talk button | Session Orchestrator via IPC events |
| Input Panel | Webview (React/Svelte) | Text input fallback, recording indicator, history view | Session Orchestrator via IPC commands |
| Screen Capture | Rust (xcap on macOS, windows-capture on Windows) | Captures full screen or selected region on demand | Session Orchestrator |
| Audio Pipeline | Rust (cpal or tauri-plugin-mic-recorder) | Push-to-talk recording → raw PCM → base64 or temp file | Session Orchestrator, Cloudflare Worker (STT) |
| Session Orchestrator | Rust (AppState + async commands) | Assembles screenshot + transcript, calls Proxy, streams response tokens back to frontend | All subsystems |
| Memory/Knowledge Graph | Rust (SQLite + sqlite-vec) | Stores task attempts, knowledge gaps, completions; similarity search for context injection | Session Orchestrator |
| TTS Player | Rust (rodio) or Frontend (Web Audio API) | Plays synthesised audio response | Session Orchestrator |
| Cloudflare Worker | Edge (TypeScript Workers) | Holds API keys, proxies to Anthropic/STT/TTS, handles SSE passthrough | Session Orchestrator (outbound only) |

---

## Data Flow

### Primary Flow: User Asks for Help

```
1. User holds push-to-talk key (global shortcut registered in Rust)
       │
       ▼
2. Audio Pipeline starts recording via mic (cpal / tauri-plugin-mic-recorder)
       │
       ▼
3. On key release → audio bytes sent to Cloudflare Worker /stt endpoint
       │  (POST audio file or stream; Worker forwards to AssemblyAI / Deepgram)
       ▼
4. STT transcript returned (WebSocket stream or HTTP response)
       │
       ▼
5. Screen Capture module takes screenshot of active screen region
       │  (xcap on macOS, windows-capture on Windows; returns PNG bytes)
       ▼
6. Session Orchestrator builds context packet:
       {
         transcript: "How do I add a keyframe in Figma?",
         screenshot: "<base64 PNG>",
         memory_context: [recent struggles, relevant past tasks],  ← from Knowledge Graph
         guidance_level: "detailed" | "short" | "hint"            ← from Memory
       }
       │
       ▼
7. POST to Cloudflare Worker /chat endpoint (HTTPS)
       │  Worker attaches Anthropic API key, forwards as streaming SSE
       ▼
8. Claude responds with streaming text tokens (SSE)
       │  Worker streams tokens back to app
       ▼
9. Session Orchestrator emits Tauri events to Overlay Window as tokens arrive
       │  frontend renders incrementally
       ▼
10. Full response text sent to Cloudflare Worker /tts endpoint
       │  Worker forwards to TTS provider (ElevenLabs / OpenAI TTS)
       ▼
11. Audio bytes returned → played via rodio (Rust) or Web Audio API
       │
       ▼
12. Interaction logged to Knowledge Graph:
       {task, app_context, outcome, timestamp, guidance_level_used}
```

### Secondary Flow: Region Selection

```
User clicks "select region" in tray menu
       │
       ▼
Overlay Window rendered full-screen with transparent drag-to-select UI
       │  (decorations: false, transparent: true, always_on_top: true)
       ▼
User draws selection rectangle → coordinates sent via IPC command to Rust
       │
       ▼
Screen Capture crops next screenshot to that region
       │
       ▼
Normal flow resumes from step 6
```

### Memory Write Flow

```
After each completed guidance session:
  Session Orchestrator → Memory module:
    write_attempt(task_description, app_name, success: bool, guidance_level)
    upsert_knowledge_gap(topic_embedding, gap_description)

Before each session:
  Session Orchestrator → Memory module:
    query_similar_tasks(current_transcript_embedding, limit: 5)
    → returns past struggles + outcomes to inject into Claude system prompt
```

---

## Patterns to Follow

### Pattern 1: Rust Owns All System I/O

The webview must never directly access the filesystem, camera, microphone, or screen. All system capabilities are implemented as Tauri commands in Rust and exposed to the frontend through the IPC bridge. This is both a security boundary (Tauri's capability system enforces it) and an architectural boundary.

**Implication:** Every capability (capture screen, record audio, read memory) is a Rust module with a command interface.

### Pattern 2: Commands for Request-Response, Events for Push

Use `#[tauri::command]` for operations that return data (start_recording → transcript, query_memory → Vec<Task>).

Use `app.emit()` for streaming updates (token_received, tts_started, tts_done). This maps to JavaScript Promises vs EventListeners respectively.

Audio streaming tokens from Claude should be events, not commands, since they arrive asynchronously over SSE and the frontend needs to render them incrementally.

### Pattern 3: Single AppState via Mutex-Wrapped Structs

Shared mutable state (recording status, active session, selected screen region) lives in `Mutex<T>` registered with `app.manage()`. Tauri handles the Arc internally. Do not create naked `Arc<Mutex<T>>` unless spawning threads outside Tauri's runtime.

```rust
struct SessionState {
    recording: bool,
    active_region: Option<ScreenRegion>,
    guidance_level: GuidanceLevel,
}
app.manage(Mutex::new(SessionState::default()));
```

### Pattern 4: Cloudflare Worker as Strict Gateway

The Worker is the only component with API credentials. The app binary contains only the Worker URL. The Worker validates requests (rate limiting, CORS origin check) and proxies SSE streams verbatim. Audio bytes for TTS are proxied through the Worker — never streamed directly from the client to ElevenLabs.

This means the Worker must handle three distinct request types:
- Text → streaming SSE (Claude)
- Audio file upload → text (STT)
- Text → audio bytes (TTS)

### Pattern 5: SQLite as Knowledge Graph Substrate

Use SQLite with the `sqlite-vec` extension for vector similarity search. A "knowledge graph" at this scale is a set of tagged event records (task attempts, identified gaps) plus embedding-based retrieval. A full graph DB is premature. The schema stays simple:

```
tasks(id, description, app_name, timestamp, success, guidance_level)
knowledge_gaps(id, topic, embedding BLOB, last_seen, seen_count)
completions(id, task_id, duration_seconds, final_guidance_level)
```

Embeddings for `knowledge_gaps` come from a lightweight local embedding model or from Claude's API (embed once, store). Cosine similarity via `sqlite-vec` retrieves relevant past context.

### Pattern 6: Multiple Tauri Windows for UI Layers

Three distinct window types, each with different decoration/transparency settings:

| Window | Type | Decorations | Transparent | Always On Top | Role |
|--------|------|-------------|-------------|--------------|------|
| Tray menu | OS-native (TAO) | N/A | N/A | Yes | Process entry point |
| Control panel | Standard WebviewWindow | Yes | No | No | Settings, history |
| Guidance overlay | WebviewWindow | No | Yes | Yes | Step display, TTS indicator |
| Region selector | WebviewWindow | No | Yes | Yes | Screen area selection |

The overlay and region selector windows use `decorations: false`, `transparent: true`, `always_on_top: true` in `tauri.conf.json`. The guidance overlay is never focused (click-through where possible) unless the user explicitly interacts with it.

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Embedding API Keys in Binary

**What:** Shipping Anthropic, ElevenLabs, or STT keys inside the Tauri binary or frontend JS bundle.
**Why bad:** Desktop binaries are trivially reversible. Keys get extracted and abused.
**Instead:** All keys live only in the Cloudflare Worker. The app authenticates with the Worker by URL alone (optionally add a per-user token if needed in later phases).

### Anti-Pattern 2: Synchronous Screen Capture on Main Thread

**What:** Calling xcap capture functions in a synchronous Tauri command on the main thread.
**Why bad:** Screen capture on macOS requires permissions dialog handling and can take 50-200ms; blocking the main thread freezes the UI and blocks IPC.
**Instead:** Use `#[tauri::command] async fn capture_screen(...)` — async commands run on the `tauri::async_runtime` thread pool.

### Anti-Pattern 3: Storing Screenshots Locally

**What:** Writing screenshot PNG files to disk as part of normal operation.
**Why bad:** Screen captures of other apps may contain sensitive data (passwords, private messages). Local storage creates a privacy liability without user consent.
**Instead:** Hold screenshots in memory (Vec<u8>) for the duration of the API call, then drop. Never persist to disk except during explicit user-triggered bug report flows.

### Anti-Pattern 4: Polling for State Changes

**What:** Frontend polling a Rust command every 500ms to check recording status or new guidance tokens.
**Why bad:** Unnecessary CPU use for a background app that must stay lightweight.
**Instead:** Rust emits events to the frontend on state transitions. Frontend registers event listeners.

### Anti-Pattern 5: Monolithic AppState

**What:** A single giant struct holding all state (recording, memory, windows, sessions, preferences) under one Mutex.
**Why bad:** Any operation on any field locks the entire state. Increases lock contention as features grow.
**Instead:** Register multiple narrowly-scoped state types with `app.manage()`. One Mutex per domain (SessionState, MemoryState, PrefsState).

---

## Build Order (Dependency Chain)

Components have hard dependencies — some cannot be built until others exist. The order below respects those dependencies.

```
1. Cloudflare Worker Proxy
   └─ Required by: everything that calls AI APIs
   └─ Build first; other components mock it during dev

2. Tauri Shell (system tray + window management)
   └─ Required by: all UI components
   └─ Build: tray icon → control panel window → overlay window skeleton

3. Screen Capture Module (Rust)
   └─ Requires: Tauri shell (permissions integration)
   └─ Required by: Session Orchestrator
   └─ Build: xcap integration → async command → IPC exposure

4. Audio Pipeline (Rust)
   └─ Requires: Tauri shell (mic permissions)
   └─ Required by: Session Orchestrator
   └─ Build: push-to-talk recording → temp file/bytes → STT proxy call → transcript

5. Session Orchestrator (Rust)
   └─ Requires: Screen Capture, Audio Pipeline, Cloudflare Worker
   └─ Required by: Frontend UI, Memory module
   └─ Build: assemble context → POST to /chat → stream SSE tokens → emit events

6. Frontend Overlay UI (Webview)
   └─ Requires: Session Orchestrator events
   └─ Build: token streaming display → TTS status indicator → guidance level badge

7. TTS Playback (Rust or Frontend)
   └─ Requires: Session Orchestrator (has completed response text)
   └─ Build: POST to /tts proxy → decode audio bytes → play via rodio

8. Memory / Knowledge Graph (Rust + SQLite)
   └─ Requires: Session Orchestrator (writes after sessions complete)
   └─ Required by: Session Orchestrator (reads context before sessions)
   └─ Build: schema + write path → read/query path → embedding + similarity search
      Note: Start with simple tag-based lookup; add embeddings in a later phase

9. Region Selection UI (Webview)
   └─ Requires: Screen Capture (uses region rect), Overlay Window
   └─ Build: transparent overlay → drag selection → coordinate IPC → crop integration

10. Guidance Level / Degradation Logic (Rust, inside Orchestrator)
    └─ Requires: Memory (reads past interactions to determine current level)
    └─ Build: rule-based degradation first → memory-informed degradation later
```

---

## Scalability Considerations

| Concern | At V1 (single user) | At V2 (multi-account / teams) |
|---------|--------------------|-----------------------------|
| Screenshot privacy | In-memory only, dropped after call | Same; never changes |
| Knowledge graph | Single SQLite file in app data dir | Per-user SQLite files or optional cloud sync |
| Cloudflare Worker | Single shared Worker with rate limits | Per-user auth tokens in Worker |
| Memory retrieval | Full-table scan with sqlite-vec | Same; SQLite handles thousands of rows comfortably |
| Concurrent sessions | Not supported (single-user app) | Not in scope |

---

## Sources

- Tauri v2 Architecture: https://v2.tauri.app/concept/architecture/
- Tauri IPC (Commands vs Events): https://v2.tauri.app/concept/inter-process-communication/
- Tauri State Management: https://v2.tauri.app/develop/state-management/
- Tauri System Tray: https://v2.tauri.app/learn/system-tray/
- Tauri Window Customization: https://v2.tauri.app/learn/window-customization/
- Tauri Global Shortcut Plugin: https://v2.tauri.app/plugin/global-shortcut/
- Clicky Reference Architecture (farzaa/clicky): https://github.com/farzaa/clicky
- tauri-plugin-screenshots (xcap): https://crates.io/crates/tauri-plugin-screenshots
- tauri-plugin-mic-recorder: https://crates.io/crates/tauri-plugin-mic-recorder
- sqlite-vec (vector search in SQLite): https://alexgarcia.xyz/sqlite-vec/rust.html
- sqlite-knowledge-graph crate: https://crates.io/crates/sqlite-knowledge-graph
- Cloudflare Workers SSE proxy pattern: https://github.com/castari/castari-proxy
