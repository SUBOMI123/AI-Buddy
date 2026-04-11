---
status: testing
phase: 06-voice-settings
source: [06-01-SUMMARY.md]
started: "2026-04-11T00:00:00.000Z"
updated: "2026-04-11T00:00:00.000Z"
---

## Current Test

number: 7
name: PTT Key Change Takes Effect Live
expected: |
  Change the PTT key in settings to a different valid shortcut. Without restarting,
  press the old key — PTT should NOT activate. Press the new key — PTT should activate.
awaiting: complete

## Tests

### 1. Settings Screen Opens with Voice Section
expected: Open the app. Click the gear icon (⚙) in the sidebar header. The settings screen opens. Above the skill profile content, there is a "Voice" section with a "TTS auto-play" checkbox and a "PTT Key" text input.
result: pass

### 2. PTT Key Input Shows Current Key
expected: With settings open, the PTT Key text input shows the current configured key (e.g. "CommandOrControl+Shift+V" or whatever the default is).
result: pass

### 3. TTS Toggle Default State
expected: The "TTS auto-play" checkbox is unchecked by default (TTS auto-play is off by default).
result: pass

### 4. TTS Toggle Enables Auto-Play
expected: Check the "TTS auto-play" checkbox. Then submit an intent and wait for guidance to stream. The guidance lines are read aloud automatically without pressing any play buttons.
result: pass

### 5. TTS Toggle Persists Across Restart
expected: With TTS auto-play checked, quit the app and reopen it. Open settings. The "TTS auto-play" checkbox is still checked.
result: pass

### 6. Invalid PTT Key Shows Error
expected: In the PTT Key field, clear the current value, type "not a shortcut", then click elsewhere (blur) or press Enter. An inline error message appears in the settings screen explaining the key format is invalid.
result: pass
note: Two error paths confirmed — invalid format shows "Invalid PTT key: {key}", OS-rejected key (e.g. Space reserved by macOS) shows registration failure inline. Both surface correctly.

### 7. PTT Key Change Takes Effect Live
expected: Change the PTT key in settings to a different valid shortcut (e.g. "CommandOrControl+Shift+B"). Without restarting the app, press the old key — PTT should NOT activate. Press the new key — PTT should activate (mic indicator shows).
result: pass
note: Live re-registration confirmed working (CommandOrControl+Shift+B saved and active without restart). UX gap logged separately: free-text Tauri format string is not discoverable — a key-capture field would be better. Functional requirement met.

## Summary

total: 7
passed: 7
issues: 0
pending: 0
skipped: 0

## Gaps

- **PTT key input UX** (low/tech-debt): Free-text field requires knowing the Tauri shortcut format (e.g. `CommandOrControl+Shift+V`). Functional requirement met — live re-registration works correctly once the right format is used. A key-capture field would improve discoverability in a future polish pass.
