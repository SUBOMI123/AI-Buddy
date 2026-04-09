# AI Buddy

## What This Is

A cross-platform desktop app that helps you use any software — even if you've never used it before. It watches your screen, understands what you're trying to do, and gives you step-by-step guidance to complete tasks. It's a real-time guide that teaches you by helping you complete tasks in tools. Learning is the side effect.

## Core Value

Users complete tasks in unfamiliar software without Googling or getting stuck. If everything else fails, this must work: user says what they want to do → AI gives clear steps → user does it.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Intent capture via voice or text ("I want to do X")
- [ ] Screen observation with directional accuracy (~70-80%)
- [ ] Screen region selection (highlight / box-select)
- [ ] Step-by-step task-completion guidance (directional, flow-correct)
- [ ] Lightweight learning memory (tracks struggles, completions, knowledge gaps)
- [ ] Degrading guidance (detailed → short → hints over time)
- [ ] Cross-platform desktop (macOS + Windows)
- [ ] Voice I/O (push-to-talk input, TTS output)
- [ ] AI backend via Claude (vision + reasoning)

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

## Constraints

- **Tech stack**: Tauri v2 (Rust backend + web frontend) for cross-platform with low footprint (~15-30MB RAM vs Electron's 150-300MB)
- **Screen capture**: Platform-specific Rust crates (xcap on Mac, windows-capture on Windows) — no universal API
- **Always-on**: Must run as background process with minimal resource usage (system tray presence)
- **API proxy**: API keys must never ship in app binary — Cloudflare Worker proxy required
- **Privacy**: Screen captures processed via API, not stored. User learning data stored locally.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Tauri v2 over Electron | 10x lower memory footprint for always-on background app | — Pending |
| Desktop over browser extension | Desktop app can see everything; browser extension limited to tabs | — Pending |
| Desktop only, no mobile | Mobile OS sandboxing prevents screen observation across apps | — Pending |
| Directional over pixel-perfect guidance | Intent accuracy > UI precision. Users need confidence + direction, not coordinates | — Pending |
| Granular memory → derived profiles | Track specific knowledge gaps, derive high-level skill profiles from granular data | — Pending |
| Task completion over education | Product is a guide, not a tutor. Learning is the side effect of doing | — Pending |

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
*Last updated: 2026-04-09 after initialization*
