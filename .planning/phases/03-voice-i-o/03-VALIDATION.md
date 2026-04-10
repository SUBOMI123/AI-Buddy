---
phase: 3
slug: voice-i-o
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-09
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Rust unit tests (`cargo test`) + manual smoke tests |
| **Config file** | none — Wave 0 adds voice module with test stubs |
| **Quick run command** | `cargo test -p ai-buddy 2>&1 \| tail -20` |
| **Full suite command** | `cargo test -p ai-buddy -- --nocapture` |
| **Estimated runtime** | ~15 seconds (unit tests); manual smoke ~5 min |

---

## Sampling Rate

- **After every task commit:** Run `cargo test -p ai-buddy 2>&1 | tail -20`
- **After every plan wave:** Run `cargo test -p ai-buddy -- --nocapture` + manual PTT smoke test
- **Before `/gsd-verify-work`:** Both PTT and TTS manual flows must be green
- **Max feedback latency:** 15 seconds (unit tests)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 03-01-01 | 01 | 0 | VOICE-01 | — | mic entitlement in plist | config | file contains `audio-input` | ❌ W0 | ⬜ pending |
| 03-01-02 | 01 | 0 | VOICE-01 | — | NSMicrophoneUsageDescription present | config | file contains key | ❌ W0 | ⬜ pending |
| 03-01-03 | 01 | 1 | VOICE-01 | T-03-01 | PTT key repeat guard (AtomicBool) | unit | `cargo test test_ptt_key_repeat_guard` | ❌ W0 | ⬜ pending |
| 03-01-04 | 01 | 1 | VOICE-01 | T-03-02 | cpal stream runs on dedicated thread | unit | `cargo test test_mic_thread_isolation` | ❌ W0 | ⬜ pending |
| 03-01-05 | 01 | 1 | VOICE-01 | — | stt-partial event fires on partial transcript | unit | `cargo test test_stt_partial_event` | ❌ W0 | ⬜ pending |
| 03-01-06 | 01 | 1 | VOICE-01 | T-03-03 | WebSocket session closes on PTT release | unit | `cargo test test_ws_session_lifecycle` | ❌ W0 | ⬜ pending |
| 03-01-07 | 01 | 1 | VOICE-01 | — | PTT start/stop audio cues play | smoke | Manual: hold/release PTT key | Manual | ⬜ pending |
| 03-02-01 | 02 | 2 | VOICE-01 | T-03-04 | /stt token endpoint validates HMAC | unit | `cargo test test_stt_token_auth` | ❌ W0 | ⬜ pending |
| 03-02-02 | 02 | 2 | VOICE-01 | — | Worker /stt returns short-lived token | smoke | `curl -X POST /stt` returns `{token}` | Manual | ⬜ pending |
| 03-02-03 | 02 | 2 | VOICE-02 | T-03-05 | /tts validates non-empty text before forwarding | unit | `cargo test test_tts_input_validation` | ❌ W0 | ⬜ pending |
| 03-02-04 | 02 | 2 | VOICE-02 | — | play_tts command streams audio to rodio | smoke | Manual TTS Play button test | Manual | ⬜ pending |
| 03-03-01 | 03 | 3 | VOICE-01 | — | TextInput shows mic indicator during PTT | smoke | Manual: hold PTT, see border indicator | Manual | ⬜ pending |
| 03-03-02 | 03 | 3 | VOICE-01 | — | Live transcript updates input field value | smoke | Manual: hold PTT, speak, see text | Manual | ⬜ pending |
| 03-03-03 | 03 | 3 | VOICE-01 | — | Transcript stays on release (no auto-submit) | smoke | Manual: release PTT, text persists | Manual | ⬜ pending |
| 03-03-04 | 03 | 3 | VOICE-02 | — | Play button appears per guidance item | smoke | Enable TTS pref, get guidance | Manual | ⬜ pending |
| 03-03-05 | 03 | 3 | VOICE-02 | — | Second Play stops first audio | smoke | Play two items sequentially | Manual | ⬜ pending |
| 03-03-06 | 03 | 3 | VOICE-01 | — | STT failure shows "Didn't catch that — try again" | smoke | Disconnect network, hold PTT | Manual | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src-tauri/Info.plist` — add `NSMicrophoneUsageDescription` key
- [ ] `src-tauri/entitlements.plist` — add `com.apple.security.device.audio-input` entitlement
- [ ] `src-tauri/assets/ptt_start.wav` — embedded click sound (~1-2KB)
- [ ] `src-tauri/assets/ptt_stop.wav` — embedded click sound (~1-2KB)
- [ ] `src-tauri/src/voice/mod.rs` — voice module scaffold with test stubs
- [ ] `src-tauri/Cargo.toml` — add cpal 0.17, rodio 0.22 (mp3 feature), tokio-tungstenite 0.29
- [ ] `worker/src/index.ts` — implement /stt and /tts routes (replace stubs)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| PTT hold produces live transcript in field | VOICE-01 | Requires real mic + AssemblyAI WebSocket | Hold Ctrl+Shift+V, speak, verify text appears live |
| PTT audio click cue plays on hold/release | VOICE-01 | Requires system audio | Hold and release PTT key, listen for click |
| TTS "Play" produces audible speech | VOICE-02 | Requires audio output device | Enable TTS pref, get guidance, click Play |
| Second Play stops first and starts new | VOICE-02 | Requires concurrent audio timing | Click Play twice on different guidance items |
| STT error shows inline message | VOICE-01 | Requires network failure simulation | Disconnect WiFi, hold PTT and speak |
| Mic indicator shows on PTT active | VOICE-01 | Requires visual inspection | Hold PTT, inspect input field border |

---

## PTT Full Flow Smoke Test

```
1. Open overlay (Ctrl+Shift+Space)
2. Input field is empty
3. Hold Ctrl+Shift+V
4. VERIFY: Click sound plays
5. VERIFY: Input field border shows mic/listening indicator
6. Speak: "how do I export a PDF in Figma"
7. VERIFY: Text appears live in input field as you speak
8. Release Ctrl+Shift+V
9. VERIFY: Click sound plays on release
10. VERIFY: Text stays in input field (NOT auto-submitted)
11. Press Enter
12. VERIFY: Guidance generates normally (Phase 2 flow)
```

## TTS Full Flow Smoke Test

```
1. Set tts_enabled: true in preferences
2. Submit a query via text or PTT
3. Receive guidance in GuidanceList
4. VERIFY: Speaker/Play icon appears on guidance item
5. Click Play
6. VERIFY: Audio plays at system volume, clear speech
7. While playing, click Play on a different guidance item
8. VERIFY: First audio stops immediately, second starts
```
