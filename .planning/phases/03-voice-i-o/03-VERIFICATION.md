---
phase: 03-voice-i-o
verified: 2026-04-09T12:00:00Z
status: human_needed
score: 3/3 must-haves verified
overrides_applied: 0
human_verification:
  - test: "Push-to-talk voice input end-to-end"
    expected: "Hold PTT key, speak, release — transcribed text populates the input field as if typed"
    why_human: "Requires live microphone, AssemblyAI API key via worker, and `cargo tauri dev` running. Cannot verify WebSocket streaming and real-time transcript delivery programmatically."
  - test: "TTS guidance playback"
    expected: "When TTS is enabled, clicking the Volume2 play button on a guidance line reads it aloud via ElevenLabs Turbo v2.5"
    why_human: "Requires ElevenLabs API key live, worker deployed, and audio output device. Cannot verify MP3 decode and playback through rodio MixerDeviceSink programmatically."
  - test: "PTT mic indicator and pulsing border"
    expected: "While PTT is active (key held), the Mic icon appears and the text input border pulses with the ptt-pulse CSS animation"
    why_human: "Visual UI behavior. Requires running app to observe real-time state changes driven by Tauri events."
---

# Phase 3: Voice I/O Verification Report

**Phase Goal:** Users can interact with AI Buddy entirely by voice — push to talk, speak their intent, and hear guidance read back — keeping eyes on the work
**Verified:** 2026-04-09T12:00:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (Roadmap Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | User holds a key, speaks intent, releases, and the transcribed text populates as if typed — no keyboard required | ? HUMAN NEEDED | PTT pipeline fully wired: shortcut.rs Pressed → start_ptt_session → cpal thread → mpsc → AssemblyAI WebSocket → stt-partial events → SidebarShell.setInputValue. All code paths substantive. Requires live device to confirm. |
| 2 | Guidance text is spoken aloud via TTS at a pace and volume suitable for following along while looking at another app | ? HUMAN NEEDED | TTS pipeline fully wired: GuidanceList Play button → playTts → cmd_play_tts → Worker /tts → ElevenLabs Turbo v2.5 → rodio MixerDeviceSink. Requires live audio to confirm. |
| 3 | Voice pipeline streams STT in real-time so submission begins before the user finishes speaking (not batch-transcribed after release) | ? HUMAN NEEDED | stt-partial events are emitted per AssemblyAI Turn message with end_of_turn=false, wired to setInputValue in SidebarShell onSttPartial handler. Structural wiring verified. Requires live STT session to confirm streaming latency. |

**Score:** 3/3 truths structurally verified (all pass automated checks; all require human smoke test)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src-tauri/src/voice/ptt.rs` | PTT state machine, cpal mic capture, AssemblyAI WebSocket | VERIFIED | 273 lines. IS_PTT_ACTIVE CAS guard, cpal on std::thread, mpsc bridge to tokio WebSocket, stt-partial/stt-final/stt-error emission. Fully substantive. |
| `src-tauri/src/voice/audio_cue.rs` | PTT start/stop click sounds via rodio | VERIFIED | 44 lines. DeviceSinkBuilder::open_default_sink() → MixerDeviceSink → mixer().add(source). PTT_START_WAV and PTT_STOP_WAV embedded via include_bytes!. |
| `src-tauri/src/voice/tts.rs` | cmd_play_tts with rodio 0.22, D-16 stop-before-play | VERIFIED | 168 lines. STOP_TX static, try_send before each new play, std::thread spawn, 60s ceiling poll. Full D-16 implementation. |
| `src-tauri/src/voice/mod.rs` | Voice module root with submodule declarations | VERIFIED | Declares pub mod audio_cue, ptt, tts. Includes 4 unit tests. |
| `src-tauri/src/shortcut.rs` | Pressed + Released handlers for PTT key | VERIFIED | register_ptt_shortcut: ShortcutState::Pressed → handle.spawn(start_ptt_session), ShortcutState::Released → stop_ptt_session. Both handlers substantive. |
| `src-tauri/src/preferences.rs` | ptt_key, audio_cues_enabled, tts_enabled fields + commands | VERIFIED | All 3 fields with serde defaults. 6 commands: cmd_get_ptt_key, cmd_set_ptt_key, cmd_get_audio_cues_enabled, cmd_set_audio_cues_enabled, cmd_get_tts_enabled, cmd_set_tts_enabled. |
| `src-tauri/Info.plist` | NSMicrophoneUsageDescription | VERIFIED | Present. Contains correct key with clear privacy description. |
| `src-tauri/entitlements.plist` | audio-input entitlement | VERIFIED | com.apple.security.device.audio-input = true present. Also includes cs.allow-unsigned-executable-memory for cpal/CoreAudio. |
| `src/components/TextInput.tsx` | value/setValue props, listening prop + mic indicator | VERIFIED | Accessor<string>/Setter<string> props. listening?: boolean drives Mic icon and ptt-pulse animation. sttError?: string shown inline with aria-live. |
| `src/components/SidebarShell.tsx` | stt-partial/stt-final/stt-error listeners, isListening signal | VERIFIED | All 3 listeners registered in onMount, unlistened in onCleanup. isListening signal declared. getTtsEnabled called on mount. |
| `src/components/GuidanceList.tsx` | Play button per guidance step when ttsEnabled is true | VERIFIED | For loop over lines. Show when={props.ttsEnabled} gates Volume2 button per line. handlePlay calls playTts. |
| `src/lib/tauri.ts` | playTts, onSttPartial, onSttFinal, onSttError, getTtsEnabled exports | VERIFIED | All 5 functions exported. playTts invokes cmd_play_tts. STT listeners use listen() from @tauri-apps/api/event. getTtsEnabled invokes cmd_get_tts_enabled. |
| `worker/src/index.ts` | /stt and /tts routes with real implementations | VERIFIED | /stt: fetches AssemblyAI v3 token (GET streaming.assemblyai.com/v3/token?expires_in_seconds=300), returns { token }. /tts: proxies ElevenLabs Turbo v2.5 streaming MP3. No "not_implemented" stubs. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| shortcut.rs PTT Pressed | start_ptt_session | handle.spawn async | WIRED | handle.spawn(async { voice::ptt::start_ptt_session(...).await }) in Pressed branch |
| shortcut.rs PTT Released | stop_ptt_session | direct call | WIRED | voice::ptt::stop_ptt_session(audio_cues) in Released branch |
| ptt.rs | stt-partial Tauri event | app.emit("stt-partial", transcript) | WIRED | Emitted in ws_read loop when end_of_turn=false |
| ptt.rs | stt-final Tauri event | app.emit("stt-final", transcript) | WIRED | Emitted in ws_read loop when end_of_turn=true |
| ptt.rs | stt-error Tauri event | app.emit("stt-error", ...) | WIRED | Emitted on WebSocket error and token fetch failure |
| SidebarShell | inputValue | onSttPartial → setInputValue | WIRED | setInputValue(transcript) in onSttPartial handler |
| SidebarShell | isListening | onSttPartial → setIsListening(true) | WIRED | setIsListening(true) called in partial handler |
| SidebarShell | sttError | onSttError → setSttError | WIRED | setSttError("Didn't catch that — try again") in error handler |
| GuidanceList | cmd_play_tts | playTts from tauri.ts | WIRED | handlePlay calls playTts(line); imported from ../lib/tauri |
| tts.rs | Worker /tts | reqwest POST | WIRED | client.post(format!("{}/tts", worker_url)) with x-app-token header |
| worker /tts | ElevenLabs | fetch POST eleven_turbo_v2_5 | WIRED | Proxies to api.elevenlabs.io/v1/text-to-speech/{voiceId}/stream |
| worker /stt | AssemblyAI | fetch GET v3/token | WIRED | Fetches streaming.assemblyai.com/v3/token?expires_in_seconds=300 |
| lib.rs invoke_handler | cmd_play_tts | voice::tts::cmd_play_tts | WIRED | Registered in tauri::generate_handler! |
| lib.rs setup | register_ptt_shortcut | shortcut::register_ptt_shortcut | WIRED | Called in setup closure after register_shortcut |

### Key Decision Verification

| Decision | Requirement | Code Location | Status |
|----------|-------------|---------------|--------|
| D-09: No auto-submit on stt-final | stt-final must NOT call submitIntent | SidebarShell.tsx:84-88 | VERIFIED — onSttFinal sets inputValue and returns to "empty" state only. submitIntent is never called. |
| D-12: TTS off by default | ttsEnabled initializes to false | SidebarShell.tsx:37 | VERIFIED — createSignal(false). getTtsEnabled() may override on mount from persisted prefs. |
| D-16: Stop-before-play | Each new TTS call stops active playback | tts.rs:42-47 | VERIFIED — STOP_TX static holds SyncSender. try_send(()) before each new play request drops old thread. |
| D-24/D-25: stt-error message preserves input | Error shows "Didn't catch that" without clearing inputValue | SidebarShell.tsx:91-97 | VERIFIED — setSttError set, setIsListening cleared, but setInputValue is NOT called. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| SidebarShell | inputValue | onSttPartial event listener → setInputValue | Driven by live AssemblyAI WebSocket transcript messages emitted from ptt.rs | FLOWING (structurally) |
| SidebarShell | ttsEnabled | getTtsEnabled() in onMount → setTtsEnabled | Reads persisted preference from Rust preferences.rs | FLOWING |
| GuidanceList | streamingText | Passed from SidebarShell as prop | Populated by streamGuidance AI streaming (Phase 2 — previously verified) | FLOWING |
| GuidanceList | ttsEnabled | Passed from SidebarShell as prop (live signal) | ttsEnabled() signal passed directly | FLOWING |

### Behavioral Spot-Checks

Step 7b: SKIPPED for all network-dependent paths (AssemblyAI WebSocket, ElevenLabs HTTP, rodio audio output) — requires running `cargo tauri dev` with live API credentials. These are routed to human verification.

Compile-time checks:
| Behavior | Evidence | Status |
|----------|----------|--------|
| Cargo build passes | SUMMARY 03-01: "0 errors, 13 warnings"; SUMMARY 03-02: "0 errors, 1 warning" | PASS (documented) |
| TypeScript compilation | SUMMARY 03-03: "npx tsc --noEmit: exit 0"; SUMMARY 03-02: "npx tsc --noEmit: exit 0" | PASS (documented) |
| Rust unit tests | SUMMARY 03-01: 4 tests pass; SUMMARY 03-02: 1 test passes | PASS (documented) |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| VOICE-01 | 03-01-PLAN | Push-to-talk voice input via AssemblyAI streaming STT | SATISFIED | ptt.rs, audio_cue.rs, shortcut.rs, preferences.rs, Info.plist, entitlements.plist, TextInput.tsx, SidebarShell.tsx all implemented and wired |
| VOICE-02 | 03-02-PLAN | Optional TTS via ElevenLabs | SATISFIED | worker/src/index.ts /tts route, tts.rs cmd_play_tts, GuidanceList.tsx Play button, tauri.ts playTts — all implemented and wired |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| src/components/TextInput.tsx | 97 | `placeholder="Listening..."` | INFO | Correct intentional behavior (D-08) — this is a dynamic placeholder switch, not a stub |

No blocker anti-patterns found. No TODO/FIXME/PLACEHOLDER comments in any Phase 3 files. No empty implementations. No hardcoded empty arrays/objects flowing to rendering. No "not_implemented" stubs in worker routes.

### Human Verification Required

#### 1. Push-to-Talk Voice Input (Full E2E)

**Test:** With `cargo tauri dev` running and worker deployed with valid ASSEMBLYAI_API_KEY:
1. Hold the PTT key (Ctrl+Shift+V by default)
2. Speak a sentence ("I want to export a PDF in Figma")
3. Release the key

**Expected:**
- While holding: Mic icon appears in text input, input border pulses with accent color animation
- During speech: Input field updates in real-time with partial transcripts (streaming, not batch)
- On release: Final transcript remains in the input field — user can edit or press Enter to submit
- No auto-submit occurs (D-09 compliance)
- Click sound plays on key press and release if audio cues are enabled

**Why human:** Requires live microphone, AssemblyAI API key (through worker), active WebSocket session, and real audio capture via cpal. Cannot simulate Tauri event emission from cpal audio data programmatically.

#### 2. STT Error Handling

**Test:** Trigger an STT error (disconnect network mid-session, or use an invalid API key):
1. Start PTT session
2. Force an error condition (disconnect network)

**Expected:**
- "Didn't catch that — try again" appears inline above the input field with aria-live="polite"
- Any text already in the input field is PRESERVED (not cleared)
- Mic indicator returns to idle

**Why human:** Requires live PTT session and network manipulation to trigger error path.

#### 3. TTS Guidance Playback

**Test:** Enable TTS in preferences, submit a query and get guidance, then click a Volume2 play button:

**Expected:**
- Play buttons visible per guidance line when TTS is enabled
- Clicking a Play button speaks the line aloud via ElevenLabs Turbo v2.5
- Clicking a second Play button while one is playing stops the first and starts the second (D-16)
- TTS failure (no network) logs to console but does not surface to user

**Why human:** Requires live ElevenLabs API key (through worker), audio output device, and rodio MixerDeviceSink playback. D-16 stop-before-play behavior requires two sequential play actions.

### Gaps Summary

No gaps found. All VOICE-01 and VOICE-02 artifacts exist, are substantive (non-stub), are wired into the Tauri command handler and SolidJS component tree, and data flows through real network calls rather than static returns. The three human verification items above are standard voice I/O behaviors that cannot be verified without a running app, live API credentials, and physical audio hardware.

---

_Verified: 2026-04-09T12:00:00Z_
_Verifier: Claude (gsd-verifier)_
