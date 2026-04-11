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

## Next Milestone

*(Not yet planned — run `/gsd-new-milestone` to define v2.0 goals, requirements, and roadmap.)*

## Progress

| Milestone | Phases | Status | Completed |
|-----------|--------|--------|-----------|
| v1.0 | 7 phases | ✅ Complete | 2026-04-11 |
