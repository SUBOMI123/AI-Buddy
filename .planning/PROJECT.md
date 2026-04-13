# AI Buddy

## What This Is

A cross-platform desktop app that helps you use any software — even if you've never used it before. It watches your screen, understands what you're trying to do, and gives you step-by-step guidance to complete tasks. It's a real-time guide that teaches you by helping you complete tasks in tools. Learning is the side effect.

## Core Value

Users complete tasks in unfamiliar software without Googling or getting stuck. If everything else fails, this must work: user says what they want to do → AI gives clear steps → user does it.

## Current Milestone: v3.0 — Ship

**Goal:** Take AI Buddy from working prototype to a real product that beta users can download and run on macOS and Windows.

**Target features:**
- Cloudflare Worker deployed (KV namespace live, backend real)
- Auto-updater configured (endpoint + signing pubkey)
- Code signing & notarization — macOS + Windows
- Reproducible signed build pipeline (CI or scripted)
- Closed beta distribution — private download link

## Requirements

### Validated (v1.0)

- [x] **FOUND-01**: App runs as system tray / menu bar presence (no dock icon, no window switcher entry) — v1.0
- [x] **FOUND-02**: Global keyboard shortcut invokes the assistant without leaving current context — v1.0
- [x] **FOUND-03**: Non-obstructive overlay UI displays guidance without stealing focus or obscuring the work area — v1.0
- [x] **FOUND-04**: Privacy transparency — clear disclosure of what is captured, when, and where data goes — v1.0
- [x] **FOUND-05**: Cross-platform support for macOS and Windows via Tauri v2 with low resource footprint (~15-30MB RAM) — v1.0
- [x] **CORE-01**: User can state intent via text input ("I want to do X") — v1.0
- [x] **CORE-02**: App captures current screen state on demand via screenshot for AI context — v1.0
- [x] **CORE-03**: AI generates step-by-step directional guidance that is flow-correct and visually descriptive — v1.0
- [x] **CORE-04**: Responses stream in real-time with perceived response under 3-5 seconds — v1.0
- [x] **CORE-05**: AI asks contextual clarification when intent is ambiguous rather than guessing — v1.0
- [x] **VOICE-01**: Push-to-talk voice input via speech-to-text (AssemblyAI streaming) — v1.0
- [x] **VOICE-02**: Voice output via text-to-speech for eyes-on-screen guidance (ElevenLabs); configurable from settings — v1.0
- [x] **SCRN-01**: User can box-select or highlight a screen region to focus AI attention on a specific area — v1.0
- [x] **LEARN-01**: Local learning memory tracks task struggles, completions, and knowledge gaps (granular knowledge graph) — v1.0
- [x] **LEARN-02**: Degrading guidance adapts over time — detailed steps on first encounter, shorter on second, hints on third+ — v1.0
- [x] **LEARN-03**: High-level skill profiles derived automatically from granular memory data — v1.0
- [x] **INFRA-01**: All API calls proxied through Cloudflare Worker — API keys never shipped in app binary — v1.0
- [x] **INFRA-02**: App operates as always-on background process with minimal resource consumption — v1.0

### Validated (v2.0)

- [x] **PLAT-01**: Invoking the overlay keyboard shortcut opens the panel on the monitor where the user's cursor is — v2.0
- [x] **CTX-01**: App detects the name of the currently active application when the overlay is invoked — v2.0
- [x] **CTX-03**: App detection is sourced from the OS (Rust layer) — must not rely on AI classification of screenshots — v2.0
- [x] **SESS-01**: Follow-up queries resolved using structured task context — v2.0
- [x] **SESS-02**: Previous guidance exchanges in the current session are scrollable above the current response — v2.0
- [x] **SESS-03**: Session context resets when user submits a new unrelated intent — v2.0
- [x] **TASK-01**: When guidance is generated, a task header displays summarizing the current task — v2.0
- [x] **RESP-01**: All AI guidance responses begin with numbered steps on line 1 — no intro sentence, no preamble — v2.0
- [x] **RESP-02**: Every code snippet or terminal command in guidance has a one-click copy button (current exchange) — v2.0
- [x] **RESP-03**: Each step contains exactly one actionable instruction — v2.0
- [x] **STEP-01**: Guidance steps are rendered as a checklist — current step highlighted, completed steps checkmarked — v2.0
- [x] **STEP-02**: User can click any step to mark it complete or jump back to a previous step — v2.0
- [x] **STEP-03**: Step progress resets when a new response is generated — v2.0
- [x] **ACTN-01**: When the overlay is open with no active query, user sees quick action buttons (Fix, Explain, Optimize, Ask) — v2.0
- [x] **ACTN-02**: After making a screen region selection, quick action buttons use the region screenshot — v2.0
- [x] **ACTN-03**: After receiving guidance, user can press "Try another way" to get a different approach — v2.0
- [x] **ACTN-04**: Fixed action buttons render instantly (<100ms) — v2.0

### Deferred / Partial

- [ ] **CTX-02**: AI-suggested quick action button labels reflect the active app context (e.g. "Debug error" in Terminal) — deferred from v2.0 Phase 11 (D-08); system prompt app injection works, button label personalization is future scope

### Active (v3.0)

*(To be defined — see REQUIREMENTS.md after milestone planning completes.)*

### Out of Scope

- Mobile app — iOS/Android sandbox prevents screen observation of other apps. Core mechanic doesn't translate.
- Browser extension — desktop app is the superset; can see browser AND everything else.
- Pixel-perfect UI detection — directional guidance is sufficient for V1. Precision scales poorly; understanding scales well.
- App-specific integrations — V1 works universally via screen observation. No API dependencies.
- Proactive screen awareness — V1 is user-initiated only. Passive watching deferred.
- Rich annotations / visual overlays — V2+ feature. V1 uses text/voice guidance.

## Context

- Inspired by [Clicky](https://github.com/farzaa/clicky) — a macOS Swift app that acts as an AI buddy next to your cursor. Clicky is Mac-only, voice-only, stateless, and points at things on screen.
- AI Buddy extends this with: cross-platform support, multi-modal input, learning memory, and degrading guidance.
- Key insight: users don't want to "learn Figma" — they want to "do this one thing." Task completion, not education.

**Current state (after v2.0):**
- Stack: Tauri v2 + SolidJS + Rust (src-tauri) + Cloudflare Worker (Hono)
- 11 phases complete across 2 milestones (v1.0 + v2.0)
- Shipped (v2.0): multi-monitor overlay, app detection, session history, task header, step-first responses, parseSteps(), StepChecklist with copy buttons, QuickActions 2×2 grid, TryAnotherWay button, region-aware buttons
- Deploy-time gates remaining: KV namespace ID in wrangler.toml, auto-updater endpoint + pubkey in tauri.conf.json (both documented with PRODUCTION REQUIRED banners)
- Tech debt: SessionFeed.sessionHistory prop is dead code; RESP-02 copy buttons on current exchange only; CTX-02 dynamic button labels deferred

## Constraints

- **Tech stack**: Tauri v2 (Rust backend + web frontend) for cross-platform with low footprint (~15-30MB RAM vs Electron's 150-300MB)
- **Screen capture**: Platform-specific Rust crates (xcap on Mac, windows-capture on Windows) — no universal API
- **Always-on**: Must run as background process with minimal resource usage (system tray presence)
- **API proxy**: API keys must never ship in app binary — Cloudflare Worker proxy required
- **Privacy**: Screen captures processed via API, not stored. User learning data stored locally.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Tauri v2 over Electron | 10x lower memory footprint for always-on background app | ✓ Validated — idles at 10-30MB |
| Desktop over browser extension | Desktop app can see everything; browser extension limited to tabs | ✓ Validated |
| Desktop only, no mobile | Mobile OS sandboxing prevents screen observation across apps | ✓ Validated |
| Directional over pixel-perfect guidance | Intent accuracy > UI precision | ✓ Validated |
| Granular memory → derived profiles | Track specific knowledge gaps, derive high-level skill profiles | ✓ Validated — v1.0 |
| Task completion over education | Product is a guide, not a tutor. Learning is the side effect of doing | ✓ Validated |
| xcap Monitor API uses individual width()/height() methods | Not size() struct — avoids compile error on macOS | ✓ Applied — v1.0 |
| capture_region x/y as i32 in IPC | Safe-cast to u32 after non-negative validation | ✓ Applied — v1.0 |
| available_monitors() + cursor range check | Avoids macOS mixed-DPI bug (Tauri issue #7890) | ✓ Applied — v2.0 Phase 8 |
| app_name only (not .title) from OS | Screen Recording permission not required; title not needed | ✓ Applied — v2.0 Phase 8 |
| sessionHistory capped at 3 turns | Token budget control; text-only history (no screenshot re-sends) | ✓ Applied — v2.0 Phase 9 |
| parseSteps() at onDone only | Avoids partial-step flicker during streaming | ✓ Applied — v2.0 Phase 10 |
| setContentState("loading") synchronous before await | Satisfies ACTN-04 <100ms; disabled state propagates in same SolidJS tick | ✓ Applied — v2.0 Phase 11 |
| buildTryAnotherPrompt strips suffix before re-appending | Prevents compound prompt growth on repeated "Try another way" taps | ✓ Applied — v2.0 Phase 11 |
| QuickActions only in fresh session (sessionHistory.length === 0) | Empty state = no prior context; buttons not shown when history exists | ✓ Applied — v2.0 Phase 11 |

## Evolution

This document evolves at phase transitions and milestone boundaries.

---
*Last updated: 2026-04-13 — v3.0 milestone started: Ship*
