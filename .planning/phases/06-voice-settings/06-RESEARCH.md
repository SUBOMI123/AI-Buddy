# Phase 6: Voice Settings - Research

**Researched:** 2026-04-10
**Domain:** SolidJS settings UI, Tauri preferences persistence, PTT shortcut re-registration
**Confidence:** HIGH

## Summary

Phase 6 is a narrow, well-bounded UI phase. All Rust-side infrastructure is already complete: `cmd_get_tts_enabled`, `cmd_set_tts_enabled`, `cmd_get_ptt_key`, `cmd_set_ptt_key` commands are registered and working. The `Preferences` struct has `tts_enabled` and `ptt_key` fields with correct defaults. The settings.json file is a hand-rolled JSON file written to `app_data_dir()` via `preferences.rs` — there is no tauri-plugin-store.

The work is entirely in the frontend: add a "Voice" section to `SettingsScreen.tsx`, wire the TTS toggle and PTT key input to existing IPC commands, and remove the `_currentTaskLabel` dead signal from `SidebarShell.tsx`. The SidebarShell already loads `ttsEnabled` from `getTtsEnabled()` on mount — the settings screen will write the value back via `setTtsEnabled()` and the SidebarShell will reflect it on next open (or via a reactive signal lifted to the parent).

**Primary recommendation:** Extend `SettingsScreen.tsx` with a "Voice" section that reads current prefs on mount and writes back via `setTtsEnabled` / `setPttKey` IPC. Handle PTT shortcut re-registration via the existing `cmd_set_ptt_key` command (which only persists; re-registration requires a Rust-side `update_ptt_shortcut` analog to `update_shortcut`).

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| VOICE-02 | Voice output via text-to-speech for eyes-on-screen guidance (ElevenLabs) — close UX gap: users can enable TTS auto-play and configure PTT key from settings screen | TTS toggle: `cmd_get_tts_enabled` / `cmd_set_tts_enabled` exist. PTT key input: `cmd_get_ptt_key` / `cmd_set_ptt_key` exist. Both commands registered in `lib.rs`. SidebarShell reads `ttsEnabled` on mount already. |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- **Frontend framework:** SolidJS only — do NOT use React, Svelte, or any other framework
- **No virtual DOM:** Use SolidJS `createSignal`, `onMount`, `Show`, `For` — no hooks patterns
- **Inline styles only:** Existing components all use inline `style={{}}` objects — no CSS modules, no Tailwind, no class-based styling
- **CSS variables:** All spacing (`--space-xs/sm/md/lg`), font sizes (`--font-size-body/label`), and colors (`--color-text-primary/secondary/accent/border/surface`) via CSS variables — never hardcode
- **Min touch targets:** Buttons must use `min-height: 44px` (existing pattern in GuidanceList.tsx, SidebarShell.tsx)
- **Tauri IPC:** All backend calls via `invoke()` wrappers in `src/lib/tauri.ts` — never call `invoke()` directly from components
- **No new Rust commands needed:** All required IPC commands already exist and are registered
- **settings.json storage:** Hand-rolled via `preferences.rs` — no tauri-plugin-store, no localStorage, no sessionStorage

## Standard Stack

### Core (all already installed — no new dependencies)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| SolidJS | latest | Reactive UI | Project-mandated frontend framework |
| lucide-solid | installed | Icons (Settings, Volume2 already used) | Already used in project |
| @tauri-apps/api/core | installed | `invoke()` for IPC | Standard Tauri v2 frontend API |

### No new dependencies required
All IPC commands for this phase already exist in Rust and are registered. No new crates, no new plugins, no npm packages.

## Architecture Patterns

### Recommended Project Structure (no changes)
```
src/
├── components/
│   ├── SettingsScreen.tsx    # ADD Voice section here
│   └── SidebarShell.tsx      # REMOVE _currentTaskLabel, wire ttsEnabled reactively
└── lib/
    └── tauri.ts              # No changes needed — setTtsEnabled/setPttKey already exported
```

### Pattern 1: Settings Section Layout (follow existing pattern in SettingsScreen.tsx)
**What:** Each settings section uses an `<h3>` with uppercase label styling, then controls below it
**When to use:** For the "Voice" section — match existing "Things you've mastered" / "Areas you're still learning" section header style
**Example:**
```tsx
// Source: src/components/SettingsScreen.tsx — existing section header pattern
<section style={{ "margin-bottom": "var(--space-lg)" }}>
  <h3 style={{
    "font-size": "var(--font-size-label)",
    "font-weight": "var(--font-weight-medium)",
    color: "var(--color-text-secondary)",
    "text-transform": "uppercase",
    "letter-spacing": "0.05em",
    "margin-bottom": "var(--space-sm)",
  }}>Voice</h3>
  {/* TTS toggle row */}
  {/* PTT key input row */}
</section>
```

### Pattern 2: Toggle Row
**What:** Label + toggle switch or checkbox in a flex row
**When to use:** TTS auto-play toggle
**Example:**
```tsx
// Source: inline style pattern from SidebarShell.tsx/GuidanceList.tsx
<div style={{
  display: "flex",
  "align-items": "center",
  "justify-content": "space-between",
  padding: "var(--space-xs) 0",
}}>
  <span style={{ "font-size": "var(--font-size-body)", color: "var(--color-text-primary)" }}>
    Auto-play guidance
  </span>
  <input
    type="checkbox"
    checked={ttsEnabled()}
    onChange={(e) => handleTtsToggle(e.currentTarget.checked)}
    style={{ cursor: "pointer" }}
  />
</div>
```

### Pattern 3: PTT Key Input
**What:** Text input showing current PTT key, accepts Tauri shortcut string format
**When to use:** PTT key configuration row
**Key insight:** `cmd_set_ptt_key` only persists the new key to settings.json — it does NOT re-register the global shortcut. A `cmd_update_ptt_shortcut` Rust command is needed (analogous to `update_shortcut` in shortcut.rs) to unregister the old shortcut and register the new one live.

```tsx
// Pattern: controlled input with save-on-blur or explicit Save button
const [pttKey, setPttKey] = createSignal("");
const [pttSaveError, setPttSaveError] = createSignal("");

const handlePttSave = async (newKey: string) => {
  try {
    await updatePttShortcut(newKey); // new IPC wrapper needed
    setPttSaveError("");
  } catch (e) {
    setPttSaveError("Invalid key format");
  }
};
```

### Pattern 4: Reactive TTS State Sync
**What:** `ttsEnabled` signal in SidebarShell gates auto-play in `onDone`. When user changes TTS toggle in SettingsScreen, SidebarShell's local signal must update too.
**How to handle:** Two options —
1. **Pass setter down:** Pass `setTtsEnabled` from SidebarShell as a prop to SettingsScreen (simplest, no new mechanism)
2. **Re-read on settings close:** When `showSettings()` returns to false, SidebarShell re-reads `getTtsEnabled()` (slightly delayed but avoids prop drilling)

Option 1 is simpler and consistent with how `onClose` is already passed as a prop.

### Anti-Patterns to Avoid
- **Calling `cmd_set_ptt_key` without re-registering the shortcut:** Persists the new key but the running app still responds to the old key until next restart. Must call a Rust command that does both.
- **Using localStorage/sessionStorage for settings:** All persistence is in `preferences.rs` / settings.json — stay consistent.
- **Hardcoded colors or sizes:** All values via CSS variables only.
- **Adding a new Rust command without registering in `lib.rs` `invoke_handler!`:** The compile will succeed but the frontend invoke will panic at runtime.

## The PTT Re-Registration Gap (Critical)

### Current state
`cmd_set_ptt_key` in `preferences.rs` (line 147-156) persists the new PTT key to `settings.json` but does NOT re-register the global shortcut. Compare to `cmd_set_shortcut` (line 112-129) which calls `crate::shortcut::update_shortcut()` after saving.

### What's needed
A `cmd_update_ptt_shortcut` Tauri command in `shortcut.rs` or `preferences.rs` that:
1. Calls `cmd_set_ptt_key` to persist the new value (or inlines the persistence)
2. Calls `app.global_shortcut().unregister(old_ptt_shortcut)`
3. Calls `register_ptt_shortcut(app)` with the new key

Pattern already exists: `update_shortcut()` in `shortcut.rs` (lines 96-123) does exactly this for the overlay shortcut. PTT needs an analog.

**Implementation path:**
```rust
// In shortcut.rs — new function mirroring update_shortcut()
pub fn update_ptt_shortcut(
    app: &tauri::AppHandle,
    old_key_str: &str,
    new_key_str: &str,
) -> Result<(), Box<dyn std::error::Error>> {
    if let Ok(old) = old_key_str.parse::<Shortcut>() {
        let _ = app.global_shortcut().unregister(old);
    }
    // Re-register new key with same PTT handler as register_ptt_shortcut()
    // ... (copy handler from register_ptt_shortcut)
    Ok(())
}

// In preferences.rs — new command
#[tauri::command]
pub fn cmd_update_ptt_shortcut(app: AppHandle, key: String) -> Result<String, String> {
    let old_key = load_preferences(&app).ptt_key.clone();
    let parsed: Result<tauri_plugin_global_shortcut::Shortcut, _> = key.parse();
    if parsed.is_err() {
        return Err(format!("Invalid PTT key: {}", key));
    }
    let mut prefs = load_preferences(&app);
    prefs.ptt_key = key.clone();
    save_preferences(&app, &prefs);
    crate::shortcut::update_ptt_shortcut(&app, &old_key, &key)
        .map_err(|e| format!("Failed to update PTT shortcut: {}", e))?;
    Ok(key)
}
```

This command must be registered in `lib.rs` `invoke_handler!`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Settings persistence | Custom file I/O | `save_preferences` in preferences.rs | Already handles atomic write, file permissions (0o600 on Unix), JSON serialization |
| Shortcut format validation | Custom regex/parser | `key.parse::<Shortcut>()` from tauri_plugin_global_shortcut | Validates Tauri shortcut string format exactly as the runtime uses it |
| Shortcut re-registration | Manual unregister/register | Mirror `update_shortcut()` pattern from shortcut.rs | Existing pattern handles edge cases (parse failure fallback, unregister-before-register) |

**Key insight:** All persistence and shortcut machinery already exists. This phase is UI wiring only, plus one new Rust command to make PTT re-registration live.

## `_currentTaskLabel` Cleanup

### Current state
In `SidebarShell.tsx` line 62:
```tsx
const [_currentTaskLabel, setCurrentTaskLabel] = createSignal<string>("");
```
The underscore prefix is a TypeScript/JavaScript convention marking an intentionally unused variable. The getter `_currentTaskLabel` is never read in JSX. The setter `setCurrentTaskLabel` IS used (line 228) to store the task label after classification.

### Decision required
**Option A: Remove entirely.** The task label is already stored in `ctx.taskLabel` (local variable in `submitIntent`). The signal was added "for potential future rendering (e.g. settings screen)" per the comment. If settings screen won't display it, delete both getter and setter, and remove the `setCurrentTaskLabel(ctx.taskLabel)` call.

**Option B: Surface in settings.** Show "Current task: [label]" in the settings screen. Requires lifting the signal out of `SidebarShell` or passing the getter down as a prop to `SettingsScreen`. Adds UI complexity for marginal user value.

**Recommendation:** Remove entirely (Option A). The task label is implementation detail, not user-facing. Phase 6 success criterion 3 says "either surfaced or removed" — removal is cleaner.

## Common Pitfalls

### Pitfall 1: TTS Toggle Not Reflected Until Restart
**What goes wrong:** SettingsScreen calls `setTtsEnabled(enabled)` IPC (persists to disk). But SidebarShell's local `ttsEnabled()` signal still holds the old value. Auto-play in `onDone` reads the local signal — so the toggle "works" on disk but not in the running session.
**Why it happens:** The `ttsEnabled` signal in SidebarShell is loaded once in `onMount`. Settings screen writes through IPC to disk but doesn't update the in-memory signal.
**How to avoid:** Pass `setTtsEnabled` setter from SidebarShell down to SettingsScreen as a prop. When user toggles, call both the IPC command (persist) and the setter (update in-memory). Pattern already used for `onClose` prop.

### Pitfall 2: PTT Key Persists But Shortcut Stays Old
**What goes wrong:** Calling `setPttKey(newKey)` IPC saves to settings.json but the running shortcut listener is still bound to the old key. User changes key in settings, nothing happens until restart.
**Why it happens:** `cmd_set_ptt_key` was designed as a persistence-only command — it does not touch the global shortcut registry.
**How to avoid:** Use `cmd_update_ptt_shortcut` (the new command described above) which unregisters the old shortcut and registers the new one in the same call.

### Pitfall 3: Invalid Shortcut String Crashes
**What goes wrong:** User types "Ctrl+Alt+5" (valid) or "ctrl alt 5" (invalid format). If not validated before calling the Rust command, the invoke returns an error but SolidJS component may not handle it gracefully.
**Why it happens:** Tauri shortcut string format is strict (`CommandOrControl+Shift+V` style). Invalid strings reject at parse time.
**How to avoid:** Show inline error message when IPC returns an error. The Rust command already validates via `key.parse::<Shortcut>()` and returns `Err(String)` — surface that error string to the user.

### Pitfall 4: Double-Registration of PTT Shortcut
**What goes wrong:** `update_ptt_shortcut` registers a new handler, but if called multiple times without proper unregister, the old handler may still fire.
**Why it happens:** `on_shortcut` in `tauri_plugin_global_shortcut` adds a new listener; if unregister fails silently, both listeners fire on key press.
**How to avoid:** Always unregister before registering. Follow the `update_shortcut` pattern in shortcut.rs which calls `unregister()` first.

## Code Examples

### Existing TTS IPC (already works — no changes needed)
```typescript
// Source: src/lib/tauri.ts lines 60-66
export async function getTtsEnabled(): Promise<boolean> {
  return invoke<boolean>("cmd_get_tts_enabled");
}
export async function setTtsEnabled(enabled: boolean): Promise<void> {
  return invoke("cmd_set_tts_enabled", { enabled });
}
```

### Existing PTT Key IPC (works for persistence only)
```typescript
// Source: src/lib/tauri.ts lines 43-48
export async function getPttKey(): Promise<string> {
  return invoke<string>("cmd_get_ptt_key");
}
export async function setPttKey(key: string): Promise<string> {
  return invoke<string>("cmd_set_ptt_key", { key });
}
```

### New IPC wrapper needed for live PTT re-registration
```typescript
// To add in src/lib/tauri.ts
export async function updatePttShortcut(key: string): Promise<string> {
  return invoke<string>("cmd_update_ptt_shortcut", { key });
}
```

### SidebarShell ttsEnabled prop-down pattern
```tsx
// Source: SidebarShell.tsx — existing pattern for SettingsScreen props
<SettingsScreen
  onClose={() => setShowSettings(false)}
  ttsEnabled={ttsEnabled()}
  onTtsChange={(val) => {
    setTtsEnabled(val);           // update in-memory signal immediately
    setTtsEnabledIpc(val).catch(() => {}); // persist to disk
  }}
/>
```

## Runtime State Inventory

> Not a rename/refactor/migration phase — no runtime state changes.

None — this phase adds UI controls for preferences that are already stored in settings.json. No data migration required. Existing settings.json values remain valid.

## Environment Availability

> No new external dependencies. All tools already in use.

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| SolidJS | SettingsScreen UI | Already installed | latest | — |
| tauri_plugin_global_shortcut | PTT re-registration | Already in Cargo.toml | — | — |
| preferences.rs / save_preferences | Settings persistence | Already implemented | — | — |

No missing dependencies.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Rust `#[test]` (cargo test) |
| Config file | src-tauri/Cargo.toml |
| Quick run command | `cd /Users/subomi/Desktop/AI-Buddy/src-tauri && cargo test 2>&1` |
| Full suite command | `cd /Users/subomi/Desktop/AI-Buddy/src-tauri && cargo test 2>&1` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| VOICE-02 | TTS toggle persists across restart | manual | `cargo tauri dev` — toggle, quit, reopen, verify state | N/A — manual |
| VOICE-02 | PTT key change takes effect live | manual | Change key in settings, verify old key stops, new key starts PTT | N/A — manual |
| VOICE-02 | `_currentTaskLabel` dead code removed | compile | `cargo build --manifest-path src-tauri/Cargo.toml` + `tsc --noEmit` | ✅ |
| VOICE-02 | `cmd_update_ptt_shortcut` validates key format | unit | Rust test in preferences.rs or shortcut.rs | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** TypeScript: `cd /Users/subomi/Desktop/AI-Buddy && npx tsc --noEmit`; Rust: `cargo build --manifest-path /Users/subomi/Desktop/AI-Buddy/src-tauri/Cargo.toml`
- **Per wave merge:** Full cargo test
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] Rust unit test for `cmd_update_ptt_shortcut` key validation — covers VOICE-02 PTT configuration

## Open Questions (RESOLVED)

1. **PTT shortcut re-registration in settings screen**
   - What we know: `cmd_set_ptt_key` persists only. `update_shortcut()` pattern exists for overlay shortcut.
   - What's unclear: Whether to add `cmd_update_ptt_shortcut` as a new Tauri command, or combine into a modified `cmd_set_ptt_key` that also re-registers.
   - Recommendation: New command `cmd_update_ptt_shortcut` — keeps `cmd_set_ptt_key` as a pure persistence command (its existing callers expect that contract), adds the live-update variant.

2. **TTS toggle UX: toggle vs checkbox**
   - What we know: No toggle switch component exists in the project. Existing project uses unstyled buttons.
   - What's unclear: Whether to use a native `<input type="checkbox">` or a custom toggle button.
   - Recommendation: Native `<input type="checkbox">` for simplicity and accessibility. Matches project pattern of minimal, functional UI. Can be styled inline to be less visually jarring if needed.

3. **PTT key display format**
   - What we know: Stored format is `"CommandOrControl+Shift+V"` (Tauri shortcut string).
   - What's unclear: Whether to display raw Tauri string or a human-readable format (`Ctrl+Shift+V`).
   - Recommendation: Display raw Tauri string for now — it's what the user must type to change it, and avoids a format-translation layer.

## Sources

### Primary (HIGH confidence — verified by reading codebase directly)
- `src-tauri/src/preferences.rs` — Preferences struct, all get/set commands verified
- `src-tauri/src/shortcut.rs` — `update_shortcut` pattern, `register_ptt_shortcut` handler
- `src-tauri/src/lib.rs` — `invoke_handler!` list confirmed, all voice commands registered
- `src/lib/tauri.ts` — IPC wrappers confirmed: `getTtsEnabled`, `setTtsEnabled`, `getPttKey`, `setPttKey` all exported
- `src/components/SettingsScreen.tsx` — Current component structure, section layout pattern
- `src/components/SidebarShell.tsx` — `ttsEnabled` signal, `_currentTaskLabel` dead signal, prop passing pattern

### Secondary (MEDIUM confidence — from project CLAUDE.md)
- CLAUDE.md — Tech stack constraints, SolidJS requirement, inline styles convention

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new dependencies; all existing packages verified in codebase
- Architecture: HIGH — all IPC commands verified to exist; Rust patterns verified by direct code read
- Pitfalls: HIGH — identified from direct analysis of current implementation gaps (PTT re-registration gap, ttsEnabled signal scope)

**Research date:** 2026-04-10
**Valid until:** Until Phase 6 execution (no external API changes; all findings from local codebase)

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `cmd_update_ptt_shortcut` does not exist yet and must be written | PTT Re-Registration Gap | Low — verified by reading lib.rs invoke_handler and preferences.rs; no such command exists |

**All other claims were verified by direct codebase inspection.**
