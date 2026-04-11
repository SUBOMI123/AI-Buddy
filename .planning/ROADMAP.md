# Roadmap: AI Buddy

## Overview

Five phases take AI Buddy from nothing to a complete v1. Phase 1 establishes the Cloudflare proxy, Tauri shell, system tray, and overlay — the foundation everything else calls. Phase 2 delivers the first working vertical slice: user states intent, app captures the screen, Claude returns streaming guidance. Phase 3 adds voice so users never break eye contact with their work. Phase 4 lets users focus AI attention on a specific screen region. Phase 5 closes the loop with learning memory that makes the assistant smarter the more it's used.

## Milestones

### ✅ v1.0 — Foundation + Core Loop + Voice + Learning (completed 2026-04-11)

7 phases, 15 plans, 18 requirements. Full details: [.planning/milestones/v1.0-ROADMAP.md](.planning/milestones/v1.0-ROADMAP.md)

<details>
<summary>v1.0 phase list</summary>

| Phase | Description | Status |
|-------|-------------|--------|
| 1. Infrastructure & App Shell | Cloudflare Worker proxy, Tauri tray app, overlay, screen capture permissions | Complete |
| 2. Core AI Loop | Text intent → screenshot → streaming Claude guidance | Complete |
| 3. Voice I/O | Push-to-talk STT and TTS output | Complete |
| 4. Screen Region Selection | Box-select to focus AI on a specific area | Complete |
| 5. Learning & Adaptation | Local memory, degrading guidance, skill profiles | Complete |
| 6. Voice Settings | TTS auto-play toggle, PTT key-capture field in settings | Complete |
| 7. Production Readiness | CORS fix, dead export removal, placeholder docs, .env.example | Complete |

</details>

### v2.0 — Task-Native Experience (active)

4 phases, 18 requirements.

## Phases

- [ ] **Phase 8: Backend Foundations** — App detection (active window name via Rust) + multi-monitor overlay positioning via cursor, with pre-existing window.rs unit bug fixed
- [ ] **Phase 9: State Machine + Conversation Continuity** — SidebarShell state machine stabilized, multi-turn conversation history with token-safe history, task header, session reset logic
- [ ] **Phase 10: Step Tracking + Response Quality** — GuidanceList step checklist, click-to-mark/jump, response history scrollback, step-first response enforcement, inline copy buttons
- [ ] **Phase 11: Action-First UI** — QuickActions component with context-sensitive fixed buttons, async AI-suggested actions, "try another way" button

## Phase Details

### Phase 8: Backend Foundations
**Goal**: The overlay opens on the active monitor and knows what app the user is in — with no UI regressions
**Depends on**: Nothing (continues from v1.0 Phase 7)
**Requirements**: CTX-01, CTX-02, CTX-03, PLAT-01
**Success Criteria** (what must be TRUE):
  1. Pressing the keyboard shortcut on a secondary monitor opens the overlay on that monitor, not the primary
  2. The AI prompt context includes the name of the frontmost application (e.g., "VS Code", "Terminal") when guidance is requested
  3. App name is sourced from Rust OS call — no screenshot analysis involved
  4. Existing overlay behavior (single monitor, no app detection) is unchanged when on the primary monitor
**Plans**: TBD
**UI hint**: no

### Phase 9: State Machine + Conversation Continuity
**Goal**: Follow-up questions work within the same task context, and the overlay preserving session state across hide/show cycles
**Depends on**: Phase 8
**Requirements**: SESS-01, SESS-02, SESS-03, TASK-01
**Success Criteria** (what must be TRUE):
  1. A follow-up question ("why did that fail?") receives a response that references the prior guidance without the user re-describing the task
  2. Hiding and re-showing the overlay does not wipe the current session — prior steps and context are still present
  3. Starting a clearly new task resets session context so old task steps do not bleed through
  4. A task header appears at the top of the guidance panel summarizing the current task and persists through follow-ups
**Plans**: TBD
**UI hint**: yes

### Phase 10: Step Tracking + Response Quality
**Goal**: Guidance responses are step-first and navigable — users can track progress, copy commands, and scroll back through session history
**Depends on**: Phase 9
**Requirements**: STEP-01, STEP-02, STEP-03, RESP-01, RESP-02, RESP-03
**Success Criteria** (what must be TRUE):
  1. Guidance steps render as a numbered checklist; the current step is highlighted and completed steps show a checkmark
  2. User can click any step to mark it complete or return to it — non-linear navigation works
  3. Every code block or terminal command in guidance has a one-click copy button that puts the content on the clipboard
  4. AI responses begin with numbered step 1 on the first line — no intro sentence or preamble precedes the steps
  5. Prior guidance exchanges from the current session are scrollable above the current response
**Plans**: TBD
**UI hint**: yes

### Phase 11: Action-First UI
**Goal**: The overlay presents immediate action options on open — users can trigger guidance with one click instead of typing
**Depends on**: Phase 9
**Requirements**: ACTN-01, ACTN-02, ACTN-03, ACTN-04
**Success Criteria** (what must be TRUE):
  1. Opening the overlay with no active query shows quick action buttons (Fix, Explain, Optimize, Ask) — no blank text prompt
  2. After making a screen region selection, context-relevant action buttons appear pre-filled for that selection
  3. A "Try another way" button is present after every guidance response and generates a meaningfully different approach
  4. Fixed action buttons render within 100ms of overlay open; AI-suggested context-specific actions append later without blocking interaction
**Plans**: TBD
**UI hint**: yes

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 8. Backend Foundations | 0/? | Not started | - |
| 9. State Machine + Conversation Continuity | 0/? | Not started | - |
| 10. Step Tracking + Response Quality | 0/? | Not started | - |
| 11. Action-First UI | 0/? | Not started | - |
