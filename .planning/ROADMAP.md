# Roadmap: AI Buddy

## Milestones

- ✅ **v1.0 — Foundation + Core Loop + Voice + Learning** — Phases 1–7 (shipped 2026-04-11)
- ✅ **v2.0 — Task-Native Experience** — Phases 8–11 (shipped 2026-04-13)
- 📋 **v3.0** — (planned — run `/gsd-new-milestone` to define)

## Phases

<details>
<summary>✅ v1.0 — Foundation + Core Loop + Voice + Learning — SHIPPED 2026-04-11</summary>

7 phases, 15 plans, 18 requirements. Full details: [.planning/milestones/v1.0-ROADMAP.md](.planning/milestones/v1.0-ROADMAP.md)

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

<details>
<summary>✅ v2.0 — Task-Native Experience — SHIPPED 2026-04-13</summary>

4 phases, 12 plans, 18 requirements. Full details: [.planning/milestones/v2.0-ROADMAP.md](.planning/milestones/v2.0-ROADMAP.md)

| Phase | Description | Status | Completed |
|-------|-------------|--------|-----------|
| 8. Backend Foundations | Multi-monitor overlay + active app detection via Rust | Complete | 2026-04-11 |
| 9. State Machine + Conversation Continuity | Session history, task header, follow-up context, hide/show persistence | Complete | 2026-04-13 |
| 10. Step Tracking + Response Quality | StepChecklist, parseSteps, copy buttons, step-first SYSTEM_PROMPT | Complete | 2026-04-13 |
| 11. Action-First UI | QuickActions 2×2 grid, TryAnotherWay, region-aware buttons | Complete | 2026-04-13 |

</details>

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1–7. v1.0 phases | v1.0 | 15/15 | Complete | 2026-04-11 |
| 8. Backend Foundations | v2.0 | 2/2 | Complete | 2026-04-11 |
| 9. State Machine + Conversation Continuity | v2.0 | 3/3 | Complete | 2026-04-13 |
| 10. Step Tracking + Response Quality | v2.0 | 4/4 | Complete | 2026-04-13 |
| 11. Action-First UI | v2.0 | 3/3 | Complete | 2026-04-13 |
