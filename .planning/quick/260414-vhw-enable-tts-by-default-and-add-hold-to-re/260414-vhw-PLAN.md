---
phase: quick
plan: 260414-vhw
type: execute
wave: 1
depends_on: []
files_modified:
  - src-tauri/src/preferences.rs
  - src-tauri/src/voice/ptt.rs
  - src-tauri/src/lib.rs
  - src/components/SidebarShell.tsx
  - src/lib/tauri.ts
autonomous: true
requirements: []

must_haves:
  truths:
    - "New installations default TTS to enabled (no settings.json present = tts_enabled true)"
    - "Mic button appears in same row as the send button in the chat input area"
    - "Mouse/touch down on mic button starts PTT session (same Rust pipeline as keyboard shortcut)"
    - "Mouse/touch up or mouse-leave on mic button stops PTT session"
    - "Mic button shows red background + pulsing ring while recording, mic icon at rest"
  artifacts:
    - path: "src-tauri/src/preferences.rs"
      provides: "default_tts_enabled returns true"
      contains: "fn default_tts_enabled() -> bool { true }"
    - path: "src-tauri/src/voice/ptt.rs"
      provides: "cmd_ptt_start and cmd_ptt_stop Tauri commands"
      exports: ["cmd_ptt_start", "cmd_ptt_stop"]
    - path: "src-tauri/src/lib.rs"
      provides: "cmd_ptt_start and cmd_ptt_stop registered in invoke_handler"
    - path: "src/lib/tauri.ts"
      provides: "pttStart() and pttStop() IPC wrappers"
      exports: ["pttStart", "pttStop"]
    - path: "src/components/SidebarShell.tsx"
      provides: "Mic button in input row with hold-to-record behavior"
  key_links:
    - from: "mic button onMouseDown"
      to: "cmd_ptt_start Tauri command"
      via: "pttStart() invoke in tauri.ts"
    - from: "mic button onMouseUp/onMouseLeave"
      to: "cmd_ptt_stop Tauri command"
      via: "pttStop() invoke in tauri.ts"
    - from: "cmd_ptt_start"
      to: "voice::ptt::start_ptt_session"
      via: "same async spawn pattern as shortcut.rs"
---

<objective>
Enable TTS by default for new installations and add a hold-to-record microphone button in the overlay UI.

Purpose: TTS should be on for new users (voice is a core product channel). The mic button gives mouse/touch users PTT access without needing the keyboard shortcut.
Output: One-line Rust change for TTS default; two thin Rust PTT command wrappers; mic button in the TextInput row in SidebarShell.tsx.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: TTS default + PTT Rust command wrappers</name>
  <files>src-tauri/src/preferences.rs, src-tauri/src/voice/ptt.rs, src-tauri/src/lib.rs</files>
  <action>
**Step A — TTS default (preferences.rs line 50):**
Change `fn default_tts_enabled() -> bool { false }` to return `true`. Also update the `Default` impl at line 64 (`tts_enabled: default_tts_enabled()`) — this is already correct since it calls the function; no change needed there beyond the function body.

**Step B — PTT Tauri command wrappers (voice/ptt.rs):**
Add two new `#[tauri::command]` functions at the bottom of `src-tauri/src/voice/ptt.rs` (before the closing of the module, after `stop_ptt_session`):

```rust
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
```

Note: `start_ptt_session` returns `Result<(), Box<dyn std::error::Error + Send + Sync>>` — check the actual signature in ptt.rs (line 72) and adjust `.map_err` if needed. If the return type is `anyhow::Result` or similar, use `.map_err(|e| e.to_string())` accordingly.

**Step C — Register in invoke_handler (lib.rs):**
Add `voice::ptt::cmd_ptt_start` and `voice::ptt::cmd_ptt_stop` to the `tauri::generate_handler![]` list in `src-tauri/src/lib.rs`. Place them after `voice::tts::cmd_play_tts` on line 56.
  </action>
  <verify>
    <automated>cd /Users/subomi/Desktop/AI-Buddy/src-tauri && cargo check 2>&1 | tail -20</automated>
  </verify>
  <done>
- `cargo check` passes with no errors
- `default_tts_enabled()` returns `true`
- `cmd_ptt_start` and `cmd_ptt_stop` are registered in the invoke handler
  </done>
</task>

<task type="auto">
  <name>Task 2: Frontend IPC wrappers + mic button UI</name>
  <files>src/lib/tauri.ts, src/components/SidebarShell.tsx</files>
  <action>
**Step A — tauri.ts IPC wrappers:**
Append two new exports to the bottom of `src/lib/tauri.ts`:

```typescript
/** Start PTT recording session from frontend (mic button hold). */
export async function pttStart(): Promise<void> {
  return invoke("cmd_ptt_start");
}

/** Stop PTT recording session from frontend (mic button release). */
export async function pttStop(): Promise<void> {
  return invoke("cmd_ptt_stop");
}
```

**Step B — Import in SidebarShell.tsx:**
Add `pttStart` and `pttStop` to the existing import from `"../lib/tauri"` (around line 15-39). Find the import block and add them to the destructured list.

**Step C — Mic button in SidebarShell.tsx:**

The mic button goes inside the `sidebar-input-area` div, in the same row as the existing `<TextInput>` send button. The `<TextInput>` component owns the send button internally. Add the mic button as a sibling element to `<TextInput>`, wrapped in a flex row, OR place it directly above/below `<TextInput>` in a flex row layout.

Looking at the current structure (line 1179-1189), `<TextInput>` is a direct child of the `sidebar-input-area` div. Wrap the `<TextInput>` + new mic button in a flex row div:

```tsx
{/* Input row: mic button + text input with its own send button */}
<div style={{ display: "flex", gap: "var(--space-xs)", "align-items": "flex-end" }}>
  {/* Mic button — hold to record, same PTT pipeline as keyboard shortcut */}
  <button
    aria-label={isListening() ? "Recording... release to stop" : "Hold to record"}
    title="Hold to record"
    onMouseDown={async (e) => {
      e.preventDefault();
      try { await pttStart(); } catch { /* silent fail */ }
    }}
    onMouseUp={async () => {
      try { await pttStop(); } catch { /* silent fail */ }
    }}
    onMouseLeave={async () => {
      if (isListening()) {
        try { await pttStop(); } catch { /* silent fail */ }
      }
    }}
    onTouchStart={async (e) => {
      e.preventDefault();
      try { await pttStart(); } catch { /* silent fail */ }
    }}
    onTouchEnd={async () => {
      try { await pttStop(); } catch { /* silent fail */ }
    }}
    disabled={needsPermission()}
    style={{
      border: "none",
      background: isListening()
        ? "var(--color-error, #ef4444)"
        : "var(--color-surface-secondary)",
      color: isListening() ? "white" : "var(--color-text-secondary)",
      cursor: needsPermission() ? "not-allowed" : "pointer",
      "border-radius": "var(--radius-md)",
      width: "36px",
      height: "36px",
      "min-width": "36px",
      "flex-shrink": "0",
      display: "flex",
      "align-items": "center",
      "justify-content": "center",
      padding: "0",
      "box-shadow": isListening()
        ? "0 0 0 3px rgba(239,68,68,0.35)"
        : "none",
      transition: "background 120ms ease, box-shadow 120ms ease",
      animation: isListening() ? "micPulse 1s ease-in-out infinite" : "none",
      opacity: needsPermission() ? "0.4" : "1",
      "align-self": "flex-end",
    }}
  >
    {/* Inline mic SVG — no external dependency */}
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 1a4 4 0 0 1 4 4v7a4 4 0 0 1-8 0V5a4 4 0 0 1 4-4zm0 2a2 2 0 0 0-2 2v7a2 2 0 0 0 4 0V5a2 2 0 0 0-2-2zm-1 15.93V21h2v-2.07A8.001 8.001 0 0 0 20 11h-2a6 6 0 0 1-12 0H4a8.001 8.001 0 0 0 7 7.93z"/>
    </svg>
  </button>
  <TextInput
    value={inputValue}
    setValue={setInputValue}
    onSubmit={handleSubmit}
    disabled={needsPermission()}
    listening={isListening()}
    sttError={sttError()}
    ref={(el) => { inputRef = el; }}
    onRegionSelect={handleRegionSelect}
    regionActive={selectedRegion() !== null}
  />
</div>
```

Add the `micPulse` keyframe animation in the existing `<style>` block at line 602 (inside the `slideIn` style block):

```css
@keyframes micPulse {
  0%, 100% { box-shadow: 0 0 0 3px rgba(239,68,68,0.35); }
  50%       { box-shadow: 0 0 0 6px rgba(239,68,68,0.15); }
}
```

Do NOT wrap the existing `<TextInput>` props in any way — pass them through unchanged. The `isListening()` signal already drives the listening state from both keyboard PTT events and the new button (since `cmd_ptt_start` emits the same `ptt-start` Tauri event, and `cmd_ptt_stop` triggers the same `stt-final`/`stt-error` events that set `isListening(false)`).
  </action>
  <verify>
    <automated>cd /Users/subomi/Desktop/AI-Buddy && npm run build 2>&1 | tail -30</automated>
  </verify>
  <done>
- `npm run build` (Vite frontend build) completes with no TypeScript errors
- Mic button appears in the input row alongside TextInput in the compiled output
- `pttStart` and `pttStop` are exported from tauri.ts
- The `micPulse` animation keyframe is defined in the style block
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <what-built>
    - TTS default changed to true in preferences.rs (affects new installations only)
    - cmd_ptt_start and cmd_ptt_stop Rust commands registered and wired to existing ptt pipeline
    - pttStart() and pttStop() IPC wrappers added to tauri.ts
    - Mic button added in the input row of SidebarShell.tsx with hold-to-record behavior and pulse animation
  </what-built>
  <how-to-verify>
    Run the app: `cd /Users/subomi/Desktop/AI-Buddy && cargo tauri dev`

    1. **Mic button visible:** Confirm a mic icon button appears to the left of the text input field in the overlay sidebar.
    2. **Hold to record:** Hold down the mic button — the button should turn red with a pulsing glow, and the listening indicator in the text input should activate (same as pressing the PTT keyboard shortcut).
    3. **Release to stop:** Release the mouse button — recording stops, the transcribed text (if any) should appear in the input field, button returns to idle state.
    4. **Mouse-leave cancels:** Start holding the button, move the cursor off it — recording stops.
    5. **TTS default (new install only):** Delete `~/Library/Application Support/ai-buddy/settings.json` if it exists, restart the app, open Settings — TTS should be toggled ON by default.
    6. **Keyboard PTT still works:** The existing keyboard PTT shortcut (Cmd+Shift+V by default) should still work as before — both pathways are independent.
  </how-to-verify>
  <resume-signal>Type "approved" or describe any issues observed</resume-signal>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| frontend→Rust | cmd_ptt_start/stop invoked from WebView — same trust level as all other Tauri commands |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-vhw-01 | DoS | cmd_ptt_start | mitigate | IS_PTT_ACTIVE atomic guard already in start_ptt_session prevents double-start; cmd_ptt_start early-exits if flag set |
| T-vhw-02 | Tampering | mouse-leave stop | accept | Mouse-leave fires pttStop even if not recording; stop_ptt_session is a no-op when not active — no harm |
</threat_model>

<verification>
- `cargo check` in src-tauri passes
- `npm run build` (Vite) passes with no TypeScript type errors
- Mic button renders alongside TextInput (not as a separate row)
- Hold-to-record triggers same ptt-start → stt-partial → stt-final event chain as keyboard PTT
- New installations default to TTS enabled
</verification>

<success_criteria>
- preferences.rs: `default_tts_enabled()` returns `true`
- voice/ptt.rs: `cmd_ptt_start` and `cmd_ptt_stop` are valid `#[tauri::command]` functions calling the existing pipeline
- lib.rs: both commands in `generate_handler![]`
- tauri.ts: `pttStart()` and `pttStop()` exported, use `invoke("cmd_ptt_start")` / `invoke("cmd_ptt_stop")`
- SidebarShell.tsx: mic button in same flex row as TextInput, wired to pttStart/pttStop, uses isListening() for visual state
- Human checkpoint: approved
</success_criteria>

<output>
After completion, create `.planning/quick/260414-vhw-enable-tts-by-default-and-add-hold-to-re/260414-vhw-SUMMARY.md`
</output>
