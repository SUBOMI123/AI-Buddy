---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: — Foundation + Core Loop + Voice + Learning
status: executing
stopped_at: Completed quick/260412-x4i
last_updated: "2026-04-13T05:29:49.626Z"
last_activity: 2026-04-13
progress:
  total_phases: 3
  completed_phases: 3
  total_plans: 9
  completed_plans: 9
  percent: 100
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-11)

**Core value:** Users complete tasks in unfamiliar software without Googling or getting stuck
**Current focus:** Phase 10 — step-tracking-response-quality

## Current Position

Phase: 10
Plan: Not started
Status: Executing Phase 10
Last activity: 2026-04-13

Progress: [░░░░░░░░░░] 0%

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Carried forward from v1.0:

- Phase 1: macOSPrivateApi: true decision needed before App Store path closes — one-way door
- Phase 1: xcap has active bugs — abstract screen capture interface for swappability from day one
- Phase 3: Voice pipeline MUST use streaming STT from day one — retrofitting batch → streaming is painful
- [Phase 04]: xcap Monitor API uses individual width()/height() XCapResult methods, not size() struct
- [Phase 04]: capture_region x/y kept as i32 in Tauri IPC signature; safe-cast to u32 after non-negative validation
- [Phase 04]: xcap capture_region uses CGDisplayBounds logical point coordinates — no scaleFactor multiplication
- [Phase 04]: Region confirm/cancel routed through Rust IPC to avoid JS suspend race on overlay focus loss
- [Phase 05]: Tauri v2 IPC converts Rust snake_case → camelCase on JS side — all invoke() calls use camelCase keys
- [Phase 06]: Window-level addEventListener (capture phase) required for reliable keydown in Tauri WebView
- [Phase 07]: WORKER_URL split: VITE_WORKER_URL (Vite/frontend) vs WORKER_URL (Rust: option_env! compile-time)

New for v2.0 (from research):

- [v2 Research]: Only 2 new Rust deps needed: active-win-pos-rs = "0.10" (app detection) and tauri-plugin-clipboard-manager (copy buttons)
- [v2 Research]: onOverlayShown currently resets state unconditionally — must be fixed to be conditional on contentState() === "empty" before any session features
- [v2 Research]: window.rs has pre-existing mixed physical/logical units bug — fix in Phase 8 alongside multi-monitor work
- [v2 Research]: Step tracker must parse from onDone only, not streaming chunks — avoids flickering and phantom steps
- [v2 Research]: Screenshots in conversation history = token bloat — prior turns text-only, only current turn gets screenshot; cap at 3-5 turns
- [v2 Research]: App detection: use app_name from OS (no permission needed); title requires Accessibility — do not use title
- [v2 Research]: Use available_monitors() + cursor position range check instead of monitor_from_point() — avoids macOS mixed-DPI bug (Tauri issue #7890)
- [Phase 08-01]: toggle_overlay fallback uses position (0,0) origin check instead of is_primary() — avoids potential missing method on Tauri Monitor type
- [Phase 08]: app_name trimmed and capped at 100 chars before prompt injection (T-08-02-01 mitigation)
- [Phase 08]: Only win.app_name read in app_context.rs — win.title never accessed to avoid Screen Recording permission (T-08-02-02)
- [Phase 08]: getActiveApp() called fire-and-forget in onOverlayShown — never awaited to keep overlay open latency unaffected (T-08-02-03)
- [Phase 09]: SessionFeed is a pure props-driven renderer — no createSignal inside; all reactive state lives in SidebarShell
- [Phase 09]: ref exposed as a callback prop (el: HTMLDivElement) => void so SidebarShell controls auto-scroll trigger location
- [Phase 09]: D-11: onOverlayShown conditionally resets only transient states — session history and lastIntent survive hide/show
- [Phase 09]: D-10: sessionHistory is in-memory signal only, never serialized to localStorage or disk
- [Phase 10]: Steps parsed post-stream at onDone only — never during streaming (avoids partial-step flicker)
- [Phase 10]: currentExchange signal separates active exchange from sessionHistory — onDone sets currentExchange, submitIntent moves it to history at start of next call
- [Phase 10]: Copy buttons on markdown fences + command-pattern lines (git, npm, npx, pip, cd, curl, docker, etc.) — navigator.clipboard API, no Tauri plugin
- [Phase 10]: System prompt replaced with strict "start with 1. on line 1, no preamble" format
- [Phase 10]: Prior session history stays flat muted text (no checklist on historical items)
- [Phase quick]: isClarifyingQuestion heuristic: single step ending with '?' renders as RawGuidanceText — SYSTEM_PROMPT updated to use inline backticks not code blocks in numbered steps

### Quick Tasks Completed

| ID | Description | Date |
|----|-------------|------|
| 260409-wj5 | Remove unused AssemblyAiSessionBegin struct from ptt.rs | 2026-04-10 |
| 260409-wz8 | Fix PTT DeviceSink drop warning — capture tokio handle before std::thread::spawn | 2026-04-10 |
| 260411-0mx | Make overlay visible on all macOS Spaces via visibleOnAllWorkspaces: true | 2026-04-11 |
| 260412-x4i | Fix Phase 10 UAT gaps: inline backtick steps (GAP-01), sidebar scroll (GAP-02), clarifying question prose (GAP-03) | 2026-04-12 |
| 260413-09m | Fix copy buttons for inline backtick commands and make session history collapsible by default | 2026-04-13 |
| 260413-0ih | Add Copied! feedback to copy button in StepChecklist — brief visual confirmation after clipboard write | 2026-04-13 |
| 260413-16l | Fix UAT issues: add step numbers to checklist and make current-step highlight follow tap | 2026-04-13 |
| 260413-1kk | Update SYSTEM_PROMPT to command-first format: Verb: `command` with no trailing prose, no-navigation-assumption rule | 2026-04-13 |
| 260413-1kn | Compact single-row header with cleanLabel + Plus button, remove blue left-border from current step, copy button primary color at rest | 2026-04-13 |
| 260413-1x7 | Show AI-generated task summary in header instead of raw user query | 2026-04-13 |

### Pending Todos

None yet.

### Blockers/Concerns

- Phase 8 research flag: validate active-win-pos-rs app_name on clean macOS Sequoia install before building QuickActions on top of it
- Deploy-time gates still open: KV namespace ID in wrangler.toml, updater endpoint + pubkey in tauri.conf.json

## Session Continuity

Last session: 2026-04-13T04:55:10.438Z
Stopped at: Completed quick/260412-x4i
Resume file: None
