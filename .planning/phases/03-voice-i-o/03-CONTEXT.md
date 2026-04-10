# Phase 3: Voice I/O - Context

**Gathered:** 2026-04-09
**Status:** Ready for planning

<domain>
## Phase Boundary

Add push-to-talk voice input (AssemblyAI streaming STT) and optional text-to-speech output (ElevenLabs) to the existing sidebar UI — so users can speak their intent and optionally hear guidance read back, keeping eyes on their work. Voice is layered on top of the Phase 2 text pipeline, not replacing it. The Worker `/stt` and `/tts` route stubs (Phase 1 D-11) get implemented here.

</domain>

<decisions>
## Implementation Decisions

### PTT Trigger Key
- **D-01:** Push-to-talk uses a **separate** key from the overlay toggle — never reuse D-06/D-07 from Phase 1 (overlay toggle = Ctrl+Shift+Space).
- **D-02:** Default PTT key: **Ctrl+Shift+V** (or Cmd+Shift+V on macOS). User holds the key to speak, releases to stop.
- **D-03:** PTT key is **configurable** in settings (v1 ships with sensible default, UI for customization is a future concern — implement with configurability in mind in Rust but no settings UI needed now).
- **D-04:** Mental model must be clean: overlay toggle = open/close app, PTT = speak. These are two distinct global shortcuts.

### STT Streaming Display
- **D-05:** Transcription text **appears live** in the input field as the user speaks — real-time streaming display, not batch-after-release.
- **D-06:** The existing `TextInput` controlled value is updated incrementally as AssemblyAI sends partial transcript events.
- **D-07:** Partial transcripts overwrite the field value in place (no append — AssemblyAI sends full partial, not deltas).
- **D-08:** Visual indicator during active PTT: a subtle mic icon or pulsing ring on the input field border to signal "listening". Exact style = Claude's discretion.

### PTT Release Behavior
- **D-09:** On key release — transcription **stays in the input field**. User must explicitly press Enter (or click Send) to submit. No auto-submit.
- **D-10:** This lets users review and correct STT errors before submitting. Prevents bad prompts from noisy or partial captures.
- **D-11:** If the user holds PTT but says nothing (empty transcript), the field stays empty on release.

### TTS Behavior
- **D-12:** TTS is **opt-in, off by default**. Auto-play is never the default.
- **D-13:** Each guidance response in `GuidanceList` gets a **"Play" button** (speaker icon). User taps to hear it read aloud.
- **D-14:** TTS preference is persisted in local preferences (Tauri preference store, same pattern as other prefs). User enables once, sticks across sessions.
- **D-15:** When TTS is enabled, clicking "Play" calls the Worker `/tts` route → ElevenLabs → streams audio → plays via Rust audio backend (rodio).
- **D-16:** No queue management in v1 — clicking "Play" on a second item while audio plays stops current and starts new.

### Voice + Text Coexistence
- **D-17:** **One unified input field** — voice fills the same input as keyboard typing. No separate voice input mode or dedicated voice field.
- **D-18:** User can freely mix: speak something, edit with keyboard, speak more, hit Enter. The field is always editable.
- **D-19:** PTT does NOT clear the field on start — it appends to / replaces current text in the field (per AssemblyAI partial events behavior: replaces the partial in real-time).

### Audio Feedback for PTT
- **D-20:** Subtle audio cues **ON by default** — a quiet click when PTT starts (key down) and when PTT stops (key release).
- **D-21:** Sounds are minimal — system click sound or a small embedded audio file (~1-2KB). Loud/jarring sounds are unacceptable.
- **D-22:** Audio cues respect system mute/volume. If system volume is 0, no cue plays.
- **D-23:** User can disable audio cues in settings (preference stored locally). No UI for this in v1 — expose as config flag for now.

### STT Failure Handling
- **D-24:** If STT fails (WebSocket connection error, token failure, network drop), show inline message in the input field area: **"Didn't catch that — try again"**.
- **D-25:** Previous text in the input field is preserved on failure — do not clear user's partially-edited intent.
- **D-26:** PTT visual indicator returns to idle state immediately on error.
- **D-27:** No retry logic in v1 — user tries again manually. Simple and predictable.
- **D-28:** Worker `/stt` route issues a short-lived AssemblyAI token (per their streaming auth pattern) — the Rust backend opens the WebSocket directly to AssemblyAI using that token.

### TTS Volume & Rate
- **D-29:** Use **system audio defaults** — no custom volume or rate controls in v1. ElevenLabs Turbo v2.5 at default settings.
- **D-30:** Do not build a volume slider or speed control. Add later if user research demands it.

### Claude's Discretion
- PTT key detection mechanism in Rust (global hotkey vs local key event in Tauri window)
- AssemblyAI WebSocket session lifecycle (open on PTT start, close on release or silence)
- rodio playback specifics (MP3 decode, stream vs buffer)
- Exact visual treatment of PTT listening state (mic icon, border color, animation)
- Worker `/stt` token endpoint implementation details (token TTL, scoping)
- ElevenLabs voice ID selection (pick a clear, natural-sounding voice)
- Whether to use `cpal` directly or `rodio` for audio cues (whichever is simpler for short clips)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project Context
- `.planning/PROJECT.md` — Core value, constraints, key decisions
- `.planning/REQUIREMENTS.md` — v1 requirements: VOICE-01, VOICE-02
- `CLAUDE.md` — Full technology stack (cpal, AssemblyAI, ElevenLabs, tokio-tungstenite, rodio, elevenlabs-sdk)

### Prior Phase Artifacts
- `.planning/phases/01-infrastructure-app-shell/01-CONTEXT.md` — D-06 (customizable shortcut), D-07 (overlay toggle), D-11 (Worker routes including /stt and /tts stubs), D-12 (API keys as Wrangler secrets)
- `.planning/phases/02-core-ai-loop/02-CONTEXT.md` — D-08 (claude-3-5-sonnet), D-11 (inline error with Retry)

### Existing Code — Integration Points
- `src/components/TextInput.tsx` — Controlled `value()` signal to drive with live STT partials; add mic icon/PTT state
- `src/components/SidebarShell.tsx` — State machine to extend with PTT state; add PTT key listener lifecycle
- `src/components/GuidanceList.tsx` — Add "Play" TTS button per guidance item
- `src-tauri/src/shortcut.rs` — Existing global shortcut registration pattern to replicate for PTT key
- `worker/src/index.ts` — `/stt` and `/tts` stub routes to implement (lines 177–191)
- `src/lib/tauri.ts` — IPC wrapper pattern to extend for PTT commands and TTS playback

### External References
- AssemblyAI Universal Streaming v3 docs — WebSocket auth, partial transcript event schema
- ElevenLabs Turbo v2.5 / streaming API — audio streaming format (MP3)
- Clicky source (https://github.com/farzaa/clicky) — Reference PTT → AssemblyAI → ElevenLabs pipeline, Cloudflare Worker token pattern

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `TextInput.tsx`: Controlled input with `createSignal` — can drive `setValue()` from STT partial events
- `SidebarShell.tsx`: State machine (`ContentState` signal) — add `"listening"` state for PTT
- `GuidanceList.tsx`: Already renders numbered steps — add a "Play" (speaker) button per item
- `shortcut.rs`: Global shortcut registration via Tauri plugin — same pattern for PTT key registration
- `preferences.rs`: Preference store — extend for `tts_enabled` and `ptt_key` and `audio_cues_enabled`

### Established Patterns
- Tauri `#[tauri::command]` for Rust → TS IPC (screenshot.rs pattern)
- `createSignal` + `Show`/`For` for reactive SolidJS state
- Global shortcut registration in `shortcut.rs` (Tauri plugin-global-shortcut)
- CSS custom properties for theming — extend for PTT listening state colors

### Integration Points
- **New Rust command:** `start_ptt` — opens AssemblyAI WebSocket, starts mic capture via `cpal`, begins streaming
- **New Rust command:** `stop_ptt` — closes WebSocket, stops mic; frontend gets final transcript via Tauri event
- **Tauri event:** `stt-partial` — emitted per partial transcript; frontend updates input field value
- **Tauri event:** `stt-final` / `stt-error` — emitted on session end
- **New Rust command:** `play_tts(text: String)` — calls Worker `/tts` → ElevenLabs → plays via rodio
- **Worker `/stt`:** Issues short-lived AssemblyAI token for Rust backend to use directly
- **Worker `/tts`:** Proxies ElevenLabs TTS request, streams MP3 audio back

</code_context>

<specifics>
## Specific Ideas

- PTT key mental model must stay clean: **toggle key ≠ PTT key**. If the user is confused about which key does what, the UX is broken.
- Live transcription in the input field is a "trust builder" — seeing your words appear in real-time signals the app is responsive and working.
- The "show transcription, don't auto-submit" pattern mirrors how iOS voice input works in native apps — a familiar and trusted pattern.
- TTS "Play" button per guidance item (not a global "read all") lets users replay specific steps as they execute them — matches the actual use case.
- Audio click cues should be barely audible — confirmation, not distraction. Like a camera shutter, not a bell.

</specifics>

<deferred>
## Deferred Ideas

- **Barge-in / interruption support** — User interrupts TTS mid-playback to speak new intent. VOICE-03 in v2 requirements. Not in scope for v1.
- **Conversational follow-up** — Continue within same task context after first response. VOICE-04 in v2. Out of scope.
- **PTT settings UI** — Visual configuration panel for PTT key and audio cues. Implement preference storage in v1, expose settings UI later.
- **TTS voice customization** — Let user pick ElevenLabs voice. Not in scope — one default voice shipped.
- **Volume/speed controls for TTS** — System defaults only in v1. Add later if needed.

</deferred>

---

*Phase: 03-voice-i-o*
*Context gathered: 2026-04-09*
