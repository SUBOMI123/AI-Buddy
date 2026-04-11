---
phase: 06-voice-settings
verified: 2026-04-10T00:00:00Z
status: human_needed
score: 4/4 must-haves verified
overrides_applied: 0
human_verification:
  - test: "Toggle TTS auto-play checkbox in settings, quit app, reopen, open settings — verify toggle state persisted"
    expected: "Checkbox state matches what was set before restart"
    why_human: "Persistence across app restarts requires running the app; cannot verify settings.json write + read roundtrip from static analysis alone"
  - test: "Change PTT key field to a valid key (e.g. CommandOrControl+Shift+B), press Enter or blur — test that the new key activates PTT and the old key no longer does"
    expected: "New key triggers voice input; old key is inert"
    why_human: "Live shortcut re-registration requires running app with system keyboard input; can't verify from static analysis"
  - test: "Enter an invalid PTT key (e.g. 'not a shortcut') and blur"
    expected: "Inline error message appears below the PTT input field"
    why_human: "UI error rendering requires running the WebView"
---

# Phase 6: Voice Settings Verification Report

**Phase Goal:** Close the VOICE-02 UX gap — users can enable TTS auto-play and configure their PTT key from within the app settings screen, without editing settings.json manually.
**Verified:** 2026-04-10
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #  | Truth                                                                                                 | Status     | Evidence                                                                                              |
|----|-------------------------------------------------------------------------------------------------------|------------|-------------------------------------------------------------------------------------------------------|
| 1  | User can toggle TTS auto-play in settings and the change takes effect immediately without restarting  | ✓ VERIFIED | SettingsScreen line 116-120: checkbox reads `props.ttsEnabled`, calls `props.onTtsChange` on change; SidebarShell line 625-628: handler updates `ttsEnabled` signal immediately + calls `setTtsEnabledIpc` |
| 2  | User can change the PTT key in settings and the new key activates PTT without restarting the app      | ✓ VERIFIED | SettingsScreen line 137: `onBlur={handlePttSave}` calls `updatePttShortcut(key)`; `cmd_update_ptt_shortcut` in preferences.rs line 163-183 validates, persists, then calls `crate::shortcut::update_ptt_shortcut` which unregisters old and registers new |
| 3  | TTS auto-play and PTT key settings persist across app restarts                                        | ✓ VERIFIED | `setTtsEnabledIpc` calls `cmd_set_tts_enabled` which writes to settings.json via `save_preferences`; `cmd_update_ptt_shortcut` calls `save_preferences` before re-registration; both use same `prefs_path` + JSON serialization. (Full restart test requires human) |
| 4  | No dead code signals remain in SidebarShell.tsx                                                       | ✓ VERIFIED | `grep -n "_currentTaskLabel\|setCurrentTaskLabel"` in SidebarShell.tsx returned zero matches |

**Score:** 4/4 truths verified

### Required Artifacts

| Artifact                              | Expected                                                                  | Status     | Details                                                                                    |
|---------------------------------------|---------------------------------------------------------------------------|------------|--------------------------------------------------------------------------------------------|
| `src-tauri/src/shortcut.rs`           | `update_ptt_shortcut()` function — unregister old, register new with PTT handler | ✓ VERIFIED | Lines 95-145: `pub fn update_ptt_shortcut` present, mirrors `register_ptt_shortcut` handler body exactly |
| `src-tauri/src/preferences.rs`        | `cmd_update_ptt_shortcut` Tauri command + unit tests                      | ✓ VERIFIED | Lines 162-183: command present, validates via `key.parse()`, calls `save_preferences` then `update_ptt_shortcut`; `#[cfg(test)]` block lines 213-237 with 3 tests |
| `src/lib/tauri.ts`                    | `updatePttShortcut` IPC wrapper exported                                  | ✓ VERIFIED | Lines 53-55: `export async function updatePttShortcut` wraps `cmd_update_ptt_shortcut`     |
| `src/components/SettingsScreen.tsx`   | Voice section with TTS checkbox and PTT key input                         | ✓ VERIFIED | Lines 92-164: `<section>` with `<h3>Voice</h3>`, TTS checkbox (line 114-121), PTT text input (line 133-162) with inline error display |
| `src/components/SidebarShell.tsx`     | `_currentTaskLabel` removed; `ttsEnabled` + `onTtsChange` passed to SettingsScreen | ✓ VERIFIED | Dead signal absent; line 20: `setTtsEnabled as setTtsEnabledIpc` imported; lines 622-629: SettingsScreen receives `ttsEnabled={ttsEnabled()}` and `onTtsChange` prop |

### Key Link Verification

| From                                  | To                               | Via                                              | Status     | Details                                                          |
|---------------------------------------|----------------------------------|--------------------------------------------------|------------|------------------------------------------------------------------|
| `src/components/SettingsScreen.tsx`   | `src/lib/tauri.ts`               | `updatePttShortcut` import                       | ✓ WIRED    | Line 2 of SettingsScreen.tsx: `import { ..., updatePttShortcut, ... } from "../lib/tauri"` |
| `src/components/SidebarShell.tsx`     | `src/components/SettingsScreen.tsx` | `ttsEnabled` prop + `onTtsChange` prop        | ✓ WIRED    | Lines 622-629: `<SettingsScreen ttsEnabled={ttsEnabled()} onTtsChange={...} />` |
| `src-tauri/src/preferences.rs`        | `src-tauri/src/shortcut.rs`      | `crate::shortcut::update_ptt_shortcut` call      | ✓ WIRED    | preferences.rs line 179: `crate::shortcut::update_ptt_shortcut(&app, &old_key, &key)` |

### Data-Flow Trace (Level 4)

| Artifact                           | Data Variable  | Source                                    | Produces Real Data | Status      |
|------------------------------------|---------------|--------------------------------------------|--------------------|-------------|
| `src/components/SettingsScreen.tsx` | `pttKey`      | `getPttKey()` IPC on mount → `cmd_get_ptt_key` → `load_preferences(&app).ptt_key` | Yes — reads from settings.json | ✓ FLOWING |
| `src/components/SettingsScreen.tsx` | `props.ttsEnabled` | `ttsEnabled` signal in SidebarShell initialized via `getTtsEnabled()` IPC on mount | Yes — reads from settings.json via `cmd_get_tts_enabled` | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior                              | Command                                                                                 | Result          | Status  |
|---------------------------------------|-----------------------------------------------------------------------------------------|-----------------|---------|
| TypeScript compiles without errors    | `npx tsc --noEmit`                                                                      | No output (clean) | ✓ PASS  |
| Rust unit tests pass (18 total)       | `APP_HMAC_SECRET=test cargo test`                                                       | 18 passed, 0 failed | ✓ PASS |
| `valid_ptt_key_parses` test           | cargo test output                                                                       | ok              | ✓ PASS  |
| `default_ptt_key_parses` test         | cargo test output                                                                       | ok              | ✓ PASS  |
| `invalid_ptt_key_does_not_parse` test | cargo test output                                                                       | ok              | ✓ PASS  |
| `cmd_update_ptt_shortcut` registered  | `grep "cmd_update_ptt_shortcut" src-tauri/src/lib.rs`                                  | 1 match (line 27) | ✓ PASS |
| `_currentTaskLabel` fully removed     | `grep "_currentTaskLabel\|setCurrentTaskLabel" src/components/SidebarShell.tsx`         | 0 matches       | ✓ PASS  |

### Requirements Coverage

| Requirement | Source Plan | Description                                                        | Status        | Evidence                                                              |
|-------------|-------------|--------------------------------------------------------------------|---------------|-----------------------------------------------------------------------|
| VOICE-02    | 06-01       | Voice output via TTS + in-app configuration of voice settings      | ✓ SATISFIED   | TTS toggle and PTT key input both present in SettingsScreen, wired to IPC commands that persist and apply immediately |

### Anti-Patterns Found

No blockers or significant anti-patterns found.

| File                                  | Line | Pattern                         | Severity | Impact                                   |
|---------------------------------------|------|---------------------------------|----------|------------------------------------------|
| `src/components/SettingsScreen.tsx`   | 45   | `setPttSaveError("")` called twice on success path | Info | Redundant clear but harmless; no user impact |

### Human Verification Required

#### 1. TTS Toggle Persistence Across Restart

**Test:** Open settings (gear icon). Toggle "Auto-play guidance" checkbox to a state different from current. Quit the app fully. Reopen. Open settings again.
**Expected:** The checkbox shows the state set before quitting, not the default (false).
**Why human:** Requires running the app and triggering a full process restart to verify the settings.json write + read roundtrip works at the OS level.

#### 2. PTT Key Live Re-Registration

**Test:** Open settings. Change the PTT key field to `CommandOrControl+Shift+B`, press Enter. Do NOT restart the app. Test that the new key triggers voice input (hold it — mic indicator should appear). Test that the old default `CommandOrControl+Shift+V` no longer triggers PTT.
**Expected:** New key activates PTT immediately; old key is inert.
**Why human:** Live global shortcut re-registration requires a running app with actual keyboard input; `update_ptt_shortcut` logic is correct in code but the interaction with macOS ScreenCaptureKit and the global shortcut registry can only be confirmed at runtime.

#### 3. Invalid PTT Key Error Display

**Test:** Open settings. Clear the PTT key field and type `not a shortcut`, then click elsewhere (blur).
**Expected:** The inline error span below the input field appears with text "Invalid PTT key: not a shortcut" (the exact string returned by `cmd_update_ptt_shortcut`'s Err path).
**Why human:** Requires rendering the WebView and triggering the blur event; the error display `<Show when={pttSaveError().length > 0}>` is reactive and can only be observed in the running UI.

### Gaps Summary

No gaps found. All four observable truths are verified at the code level. Three items require human (runtime) verification — these are behavioral tests that cannot be confirmed from static analysis.

---

_Verified: 2026-04-10_
_Verifier: Claude (gsd-verifier)_
