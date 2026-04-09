# Phase 1: Infrastructure & App Shell - Context

**Gathered:** 2026-04-09
**Status:** Ready for planning

<domain>
## Phase Boundary

Deploy the Cloudflare Worker proxy (with Hono framework), scaffold the Tauri v2 app with system tray presence, floating sidebar overlay, global keyboard shortcut, privacy disclosure, and screen capture permission handling — validated on both macOS and Windows. This phase delivers the foundation that every subsequent phase builds on. No AI integration yet.

</domain>

<decisions>
## Implementation Decisions

### Overlay UI Style
- **D-01:** Floating sidebar panel docked to screen edge, ~300px fixed width, draggable to left or right edge (remembers position)
- **D-02:** Visual style follows system theme — dark when OS is dark, light when OS is light
- **D-03:** Text input field built into the bottom of the sidebar panel. Auto-focuses when panel opens.
- **D-04:** Empty state shows prompt hint: "Ask me anything about what's on your screen" with input field ready
- **D-05:** Guidance steps displayed as numbered list (1. Click Filters  2. Select Date  3. Choose Last 30 days)

### Shortcut & Invocation
- **D-06:** Global keyboard shortcut is customizable by the user. Ship with a sensible default (e.g., Ctrl+Shift+Space)
- **D-07:** Shortcut is a toggle — press once to open, press again to dismiss
- **D-08:** When panel opens, text input auto-focuses so user can type immediately

### Worker Proxy
- **D-09:** Cloudflare Worker built with Hono framework for clean routing and middleware
- **D-10:** Authentication via installation token — app generates unique token on first launch, Worker validates and rate-limits per token
- **D-11:** Three routes: `/chat` (Claude streaming), `/stt` (transcription token), `/tts` (text-to-speech)
- **D-12:** API keys (Anthropic, AssemblyAI, ElevenLabs) stored as Wrangler secrets, never in app binary

### Distribution
- **D-13:** Direct download only — DMG for macOS, MSI/EXE for Windows. No App Store.
- **D-14:** macOSPrivateApi enabled (required for transparent overlay windows, permanently bars App Store — accepted tradeoff)
- **D-15:** Auto-update via Tauri built-in updater plugin — checks on launch, downloads in background, applies on restart

### Claude's Discretion
- Implementation details of screen capture permission flow (xcap abstraction layer, permission check/repair UX)
- Specific Tauri window configuration values (blur radius, opacity, corner radius)
- Default keyboard shortcut choice
- System tray menu items and layout

### Folded Todos
- **Set up Tauri v2 project scaffold for AI Buddy** — Initialize the Tauri v2 project with Rust backend, SolidJS frontend, system tray, and overlay window. This is the first concrete build step for Phase 1.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project Context
- `.planning/PROJECT.md` — Core value, constraints, key decisions
- `.planning/REQUIREMENTS.md` — v1 requirements mapped to this phase: INFRA-01, INFRA-02, FOUND-01–05

### Research
- `.planning/research/STACK.md` — Technology stack recommendations with versions and rationale
- `.planning/research/ARCHITECTURE.md` — Component boundaries, data flow, build order
- `.planning/research/PITFALLS.md` — Platform-specific gotchas (macOS permissions, transparent window bugs, xcap issues)
- `.planning/research/SUMMARY.md` — Synthesized research findings

### External Reference
- Clicky source (https://github.com/farzaa/clicky) — Reference implementation for Worker proxy pattern, overlay approach, and Tauri-like architecture decisions

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- None — greenfield project

### Established Patterns
- None — patterns will be established in this phase

### Integration Points
- Cloudflare Worker URL will be the single integration point consumed by all future phases
- System tray and overlay window will be extended by Phase 2 (text input), Phase 3 (voice), Phase 4 (region selection)

</code_context>

<specifics>
## Specific Ideas

- Reference Clicky's Cloudflare Worker structure (3 routes: `/chat`, `/tts`, `/transcribe-token`) but use Hono instead of plain fetch handlers
- Overlay should feel native on both platforms — follow macOS vibrancy / Windows Mica material where possible
- Screen capture permission must include clear privacy disclosure before requesting (FOUND-04)

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 01-infrastructure-app-shell*
*Context gathered: 2026-04-09*
