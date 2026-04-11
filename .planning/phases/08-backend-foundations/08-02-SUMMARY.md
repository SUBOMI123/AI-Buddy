---
phase: 08-backend-foundations
plan: "02"
subsystem: context-awareness
tags: [app-detection, active-win-pos-rs, system-prompt, IPC, CTX-01, CTX-02, CTX-03]
dependency_graph:
  requires: []
  provides: [cmd_get_active_app, getActiveApp, appContext-system-prompt, detectedApp-signal]
  affects: [src-tauri/src/lib.rs, src/lib/tauri.ts, src/lib/ai.ts, src/components/SidebarShell.tsx]
tech_stack:
  added: [active-win-pos-rs = "0.10"]
  patterns: [fire-and-forget IPC, OS-native app detection without screenshots, system-prompt enrichment]
key_files:
  created: [src-tauri/src/app_context.rs]
  modified:
    - src-tauri/Cargo.toml
    - src-tauri/src/lib.rs
    - src/lib/tauri.ts
    - src/lib/ai.ts
    - src/components/SidebarShell.tsx
decisions:
  - "app_name trimmed and capped at 100 chars before prompt injection (T-08-02-01)"
  - "Only win.app_name read — win.title never accessed to avoid Screen Recording permission requirement (T-08-02-02)"
  - "getActiveApp() called fire-and-forget in onOverlayShown — never awaited to keep overlay responsive (T-08-02-03, Pitfall 4)"
  - "Returns Ok(None) on any OS error — overlay opens and guidance works regardless of detection (graceful degradation)"
metrics:
  duration_minutes: 8
  completed_date: "2026-04-11"
  tasks_completed: 2
  files_changed: 5
requirements_satisfied: [CTX-01, CTX-02, CTX-03]
---

# Phase 08 Plan 02: App Context Detection Summary

**One-liner:** OS-native active app detection via active-win-pos-rs injecting app name into Claude system prompt non-blocking on overlay open.

## What Was Built

Added OS-native active application detection to the overlay pipeline. When the overlay opens, a Rust command reads the frontmost application name from the OS (NSWorkspace on macOS, GetForegroundWindow on Windows) via `active-win-pos-rs` and stores it in a SolidJS signal. The detected name is injected into the Claude system prompt as "The user is currently working in: \<app>" and recorded in the memory DB as `appContext`.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Add active-win-pos-rs dependency and create app_context.rs Tauri command | 4f74846 | Cargo.toml, app_context.rs, lib.rs |
| 2 | Wire app detection through frontend — tauri.ts, ai.ts, SidebarShell | 6c4d090 | tauri.ts, ai.ts, SidebarShell.tsx |

## Key Design Decisions

- **app_name only, never title:** `win.title` requires Screen Recording permission on macOS and returns "" without it. Only `win.app_name` (process/bundle name) is used — available without any special permission. Enforced at code level: no `.title` access anywhere in app_context.rs.

- **Fire-and-forget detection:** `getActiveApp()` is called non-blocking in the `onOverlayShown` handler — `.then().catch()` pattern, never `await`. This ensures overlay is immediately interactive even if the OS call is slow (elevated process on Windows, loaded system). Overlay open latency is unaffected.

- **Cap at 100 chars:** `app_name` from the OS process table is user-controlled (any process can set any name). Trimmed and capped at 100 chars before returning from `cmd_get_active_app` to prevent prompt bloat from adversarially-named processes.

- **Graceful degradation everywhere:** Rust command returns `Ok(None)` on any error. Frontend `.catch(() => setDetectedApp(null))` handles IPC failure. `detectedApp() ?? undefined` means null becomes no appContext injection — overlay still opens, guidance still works.

- **Synchronous Rust command:** `get_active_window()` is a synchronous OS call. No `async` wrapper added — it's fast enough for direct execution in the Tauri command handler.

## Deviations from Plan

None — plan executed exactly as written. All threat model mitigations (T-08-02-01 through T-08-02-04) implemented as specified.

## Threat Surface Review

All security-relevant surface was covered by the plan's threat model:
- T-08-02-01 (Tampering via adversarial app_name): Mitigated — 100-char cap in app_context.rs
- T-08-02-02 (title field information disclosure): Mitigated — no .title access in code
- T-08-02-03 (DoS via blocking overlay): Mitigated — fire-and-forget pattern in SidebarShell
- T-08-02-04 (Windows elevated process): Accepted — Ok(None) return, no crash, no leak

No new threat surface introduced beyond what was modeled.

## Known Stubs

None. The `detectedApp` signal is wired end-to-end: populated on overlay-shown, passed to `streamGuidance` as `appContext`, injected into the system prompt, and recorded in the memory DB via `recordInteraction`. No placeholder values in the data flow.

## Verification Results

- `cargo build` exits 0 (clean compile with active-win-pos-rs added)
- `npm run build` exits 0 (TypeScript + Vite build clean)
- CTX-03 audit: `grep "screenshot" src-tauri/src/app_context.rs` — doc comment only, no production code
- CTX-03 audit: `grep ".title" src-tauri/src/app_context.rs` — no matches

## Self-Check: PASSED

Files exist:
- FOUND: /Users/subomi/Desktop/AI-Buddy/src-tauri/src/app_context.rs
- FOUND: /Users/subomi/Desktop/AI-Buddy/src-tauri/Cargo.toml (active-win-pos-rs entry)
- FOUND: /Users/subomi/Desktop/AI-Buddy/src/lib/tauri.ts (getActiveApp export)
- FOUND: /Users/subomi/Desktop/AI-Buddy/src/lib/ai.ts (appContext field + prompt injection)
- FOUND: /Users/subomi/Desktop/AI-Buddy/src/components/SidebarShell.tsx (detectedApp signal)

Commits exist:
- FOUND: 4f74846 — feat(08-02): add active-win-pos-rs and cmd_get_active_app Tauri command
- FOUND: 6c4d090 — feat(08-02): wire app detection through frontend — tauri.ts, ai.ts, SidebarShell
