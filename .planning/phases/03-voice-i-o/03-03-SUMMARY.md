---
phase: 03-voice-i-o
plan: 03-03
subsystem: frontend-voice
tags: [solidjs, ptt, stt, tts, state-lifting, lucide-solid, reactive]
dependency_graph:
  requires: [03-01, 03-02]
  provides: [frontend-stt-wiring, frontend-tts-play-button, lifted-input-state]
  affects: [src/components/TextInput.tsx, src/components/SidebarShell.tsx, src/components/GuidanceList.tsx]
tech_stack:
  added: []
  patterns: [solid-lifted-state, solid-for-loop-reactive, ptt-pulse-css-animation, stt-event-listener-lifecycle]
key_files:
  created: []
  modified:
    - src/components/TextInput.tsx
    - src/components/SidebarShell.tsx
    - src/components/GuidanceList.tsx
decisions:
  - "TextInput value/setValue lifted to SidebarShell — STT partials update input from shell without prop-drilling through event callbacks"
  - "isListening signal declared at shell level before onMount — drives mic indicator and border pulse on TextInput"
  - "GuidanceList For loop over newline-split lines (not pre block) — enables per-line Play button alongside text"
  - "TTS failures silently caught with console.error — voice is optional; errors must never block text guidance flow"
  - "sttError signal cleared on both new speech (onSttPartial) and new text submission — prevents stale error display"
metrics:
  duration: "~8m"
  completed: "2026-04-09"
  tasks_completed: 2
  files_changed: 3
---

# Phase 3 Plan 3: Frontend Voice Integration Summary

## One-liner

SolidJS state lifting wires STT partial transcripts to the input field live, adds a pulsing Mic indicator during PTT, and gives each guidance line a Volume2 Play button gated by the tts_enabled preference.

## What Was Built

### Task 1: TextInput State Lift + Mic Indicator + SidebarShell STT Wiring

**`src/components/TextInput.tsx`** — Complete replacement with lifted state pattern:
- `value: Accessor<string>` and `setValue: Setter<string>` now come in as props (state owned by SidebarShell)
- `listening?: boolean` prop: when true, shows `Mic` icon (lucide-solid) and a `ptt-pulse` CSS keyframe animation on the container border ring (accent color, 1.2s ease-in-out infinite)
- `sttError?: string` prop: rendered as a `<p>` element above the input row with `aria-live="polite"` — field text is never cleared on error (D-25)
- Placeholder text switches to "Listening..." when `listening` is true (D-08)
- Submit handler calls `props.setValue("")` to clear the lifted signal after send

**`src/components/SidebarShell.tsx`** — Extended with full Phase 3 voice state:
- `ContentState` union now includes `"listening"` (D-08)
- New signals: `inputValue`/`setInputValue`, `sttError`/`setSttError`, `ttsEnabled`/`setTtsEnabled`, `isListening`/`setIsListening`
- `onMount` registers three STT Tauri event listeners:
  - `onSttPartial`: overwrites `inputValue` with full partial (D-07), sets `isListening(true)` (D-08), clears any prior `sttError`
  - `onSttFinal`: updates `inputValue` only if transcript is non-empty (D-11, D-19), sets `isListening(false)`, returns state to `"empty"` without auto-submitting (D-09)
  - `onSttError`: sets `sttError("Didn't catch that — try again")` (D-24), sets `isListening(false)` (D-26), does NOT clear `inputValue` (D-25)
- `getTtsEnabled()` called in `onMount` to load persisted preference (D-12, D-14)
- `onCleanup` calls all three unlisten functions
- `<TextInput>` now receives `value={inputValue}`, `setValue={setInputValue}`, `listening={isListening()}`, `sttError={sttError()}`
- `<GuidanceList>` now receives `ttsEnabled={ttsEnabled()}`

### Task 2: GuidanceList Play Button

**`src/components/GuidanceList.tsx`** — Complete replacement with per-line rendering:
- Replaced `<pre>` block with `<For each={lines()}>` loop over newline-split, non-empty lines
- Each line row: `<p>` text + conditionally rendered Play button
- `ttsEnabled?: boolean` prop gates `<Show when={props.ttsEnabled}>` around the button (D-12, D-13)
- Play button: `Volume2` icon (16px, lucide-solid), `aria-label="Read aloud: {line}"`, hover color transition
- `handlePlay(line)` calls `playTts(line)` from `src/lib/tauri.ts` — D-16 stop-before-play is handled inside Rust `cmd_play_tts`
- TTS failures are caught and `console.error`-logged; never surface to user (voice is optional)
- Auto-scroll behavior preserved: `scrollToBottom()` called inside the `lines()` accessor

## Manual Smoke Test Results

Manual smoke tests (PTT and TTS flows) require `cargo tauri dev` with a connected AssemblyAI token. The frontend wiring is structurally complete — the event listener registrations, signal updates, and prop flows are correct. Full end-to-end smoke testing is performed as part of the 03-VALIDATION.md plan after all three waves complete.

The following behaviors are verified structurally through code review and TypeScript compilation:

- PTT active: `isListening()` becomes true → TextInput shows Mic icon + pulsing border
- Transcript arrives: `inputValue` updated in place, field reflects new text
- PTT release with transcript: text stays in field, no auto-submit (D-09)
- PTT release with no speech: `inputValue` unchanged (D-11, D-19)
- STT error: "Didn't catch that — try again" shown inline, `inputValue` preserved (D-24, D-25)
- TTS disabled (default): no Play buttons visible in GuidanceList (D-12)
- TTS enabled: Volume2 button appears per guidance line (D-13)
- Play button click: `playTts(line)` called, stop-before-play handled in Rust (D-16)

## TypeScript Compilation Result

```
npx tsc --noEmit: exit 0 (no errors)
```

All three modified files pass type-checking. No type errors introduced.

## Deviations from Plan

None — plan executed exactly as written. Both `Volume2` and `Mic` icons confirmed present in the installed `lucide-solid` package before writing.

## Known Stubs

None — all props are wired to live signals. TTS play button calls real `playTts` IPC command. STT event listeners are registered against real Tauri event system. No hardcoded empty values or placeholder data flows to UI rendering.

## Threat Surface Scan

No new network endpoints or trust boundaries introduced. All event payload handling uses SolidJS JSX string interpolation (auto-escaped, no innerHTML) — consistent with T-03-08 and T-03-09 threat register entries in the plan.

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | 5378d88 | feat(03-03): lift TextInput state + mic indicator + SidebarShell STT wiring |
| 2 | 3410e21 | feat(03-03): GuidanceList Play button with ttsEnabled prop and playTts integration |

## Self-Check: PASSED
