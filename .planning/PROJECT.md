# AI Buddy

## What This Is

A cross-platform desktop app that helps you use any software — even if you've never used it before. It watches your screen, understands what you're trying to do, and gives you step-by-step guidance to complete tasks. It's a real-time guide that teaches you by helping you complete tasks in tools. Learning is the side effect.

## Core Value

Users complete tasks in unfamiliar software without Googling or getting stuck. If everything else fails, this must work: user says what they want to do → AI gives clear steps → user does it.

## Current Milestone: v2.0 — Task-Native Experience

**Goal:** Transform AI Buddy from a capable AI assistant into a task execution tool — action-first UI, step-guided execution, context awareness, and multi-monitor support.

**Target features:**
- Action-first UI with quick action buttons + async AI-suggested actions on selection
- Step-first responses enforced in system prompt (no intro, no fluff, numbered steps from line 1)
- Context-aware entry via app detection (VS Code, Figma, Terminal) pre-suggesting relevant actions
- Step progress tracking — highlight current step, checkmark completed, click to jump/replay
- Conversation continuity — follow-up in same task context without re-explaining
- "Try another way" — alternative steps when current approach fails
- Inline copy buttons for commands and code snippets in guidance output
- Response history — scroll back through previous guidance in the current session
- Multi-monitor support — overlay opens on active monitor via cursor-based Rust detection

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

### Active

*(None — all v1 requirements validated. Next requirements defined at /gsd-new-milestone.)*

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
- Clicky's architecture: menu bar app with NSPanel overlays, push-to-talk → AssemblyAI → Claude → ElevenLabs TTS, all proxied through Cloudflare Worker.
- Key insight: users don't want to "learn Figma" — they want to "do this one thing." Task completion, not education.
- The "accuracy" that matters is intent accuracy and flow accuracy, not UI precision. If the user completes the task, the AI is "accurate."

**Current state (after Phase 10):**
- Stack: Tauri v2 + SolidJS + Rust (src-tauri) + Cloudflare Worker (Hono)
- Phases 8–10 executed and human-verified
- Shipped (Phase 10): step-first AI responses enforced in system prompt; `parseSteps()` pure function; `StepChecklist` component with interactive toggles, inline command extraction, and "Copied!" feedback; `RawGuidanceText` fallback for clarifying questions; collapsible session history; session scroll fixed
- Next: Phase 11 — Action-First UI (QuickActions component)
- Deploy-time gates remaining: KV namespace ID in wrangler.toml, auto-updater endpoint + pubkey in tauri.conf.json (both documented with PRODUCTION REQUIRED banners)

## Constraints

- **Tech stack**: Tauri v2 (Rust backend + web frontend) for cross-platform with low footprint (~15-30MB RAM vs Electron's 150-300MB)
- **Screen capture**: Platform-specific Rust crates (xcap on Mac, windows-capture on Windows) — no universal API
- **Always-on**: Must run as background process with minimal resource usage (system tray presence)
- **API proxy**: API keys must never ship in app binary — Cloudflare Worker proxy required
- **Privacy**: Screen captures processed via API, not stored. User learning data stored locally.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Tauri v2 over Electron | 10x lower memory footprint for always-on background app | ✓ Validated — idles at 10-30MB, well under Electron's 150-300MB |
| Desktop over browser extension | Desktop app can see everything; browser extension limited to tabs | ✓ Validated — screen capture works across all apps, not just browser |
| Desktop only, no mobile | Mobile OS sandboxing prevents screen observation across apps | ✓ Validated — iOS/Android confirmed non-viable for this mechanic |
| Directional over pixel-perfect guidance | Intent accuracy > UI precision. Users need confidence + direction, not coordinates | ✓ Validated — directional steps sufficient; users complete tasks without exact coordinates |
| Granular memory → derived profiles | Track specific knowledge gaps, derive high-level skill profiles from granular data | ✓ Validated — SQLite memory + `get_skill_profile` Rust command shipped and verified |
| Task completion over education | Product is a guide, not a tutor. Learning is the side effect of doing | ✓ Validated — core product loop (intent → screenshot → guidance) is the entire UX |
| Key-capture for PTT shortcut | Free-text Tauri accelerator format is not discoverable for non-technical users | ✓ Added in v1.0 — click-to-capture field with symbol display (⌘⇧V) replaces text input |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-04-13 — Phase 10 complete (step-tracking-response-quality)*
