---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: — Foundation + Core Loop + Voice + Learning
status: verifying
stopped_at: Completed 08-02-PLAN.md — app context detection via active-win-pos-rs
last_updated: "2026-04-11T04:57:06.213Z"
last_activity: 2026-04-11
progress:
  total_phases: 1
  completed_phases: 1
  total_plans: 2
  completed_plans: 2
  percent: 100
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-11)

**Core value:** Users complete tasks in unfamiliar software without Googling or getting stuck
**Current focus:** Phase 08 — backend-foundations

## Current Position

Phase: 08 (backend-foundations) — EXECUTING
Plan: 2 of 2
Status: Phase complete — ready for verification
Last activity: 2026-04-11

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

### Quick Tasks Completed

| ID | Description | Date |
|----|-------------|------|
| 260409-wj5 | Remove unused AssemblyAiSessionBegin struct from ptt.rs | 2026-04-10 |
| 260409-wz8 | Fix PTT DeviceSink drop warning — capture tokio handle before std::thread::spawn | 2026-04-10 |
| 260411-0mx | Make overlay visible on all macOS Spaces via visibleOnAllWorkspaces: true | 2026-04-11 |

### Pending Todos

None yet.

### Blockers/Concerns

- Phase 8 research flag: validate active-win-pos-rs app_name on clean macOS Sequoia install before building QuickActions on top of it
- Deploy-time gates still open: KV namespace ID in wrangler.toml, updater endpoint + pubkey in tauri.conf.json

## Session Continuity

Last session: 2026-04-11T04:57:06.211Z
Stopped at: Completed 08-02-PLAN.md — app context detection via active-win-pos-rs
Resume file: None
