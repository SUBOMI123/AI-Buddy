# Phase 2: Core AI Loop - Context

**Gathered:** 2026-04-09
**Status:** Ready for planning

<domain>
## Phase Boundary

The core product loop: user types intent in the sidebar, app captures the current screen, sends both to Claude via the Worker proxy, and streams back actionable step-by-step guidance in real-time. This is the first end-to-end vertical slice — everything before was infrastructure, everything after adds polish.

</domain>

<decisions>
## Implementation Decisions

### Screenshot Capture
- **D-01:** Capture screenshot on every submit — right when user presses Enter, so Claude always sees the current screen state
- **D-02:** Capture full primary monitor (not active window) — gives Claude maximum context
- **D-03:** Resize to 1280px wide, JPEG 80% quality — good balance of clarity (~200-400KB) vs API cost/speed
- **D-04:** If screenshot capture fails (permission revoked, screen locked), fall back to text-only request with notice: "Screen capture unavailable — guidance may be less specific"

### Streaming Guidance UX
- **D-05:** Word-by-word streaming — text flows in progressively as Claude generates it, natural reading pace
- **D-06:** Pulsing dots animation (•••) as loading indicator while waiting for first token (~2-3s). Disappears when first token arrives
- **D-07:** Clear and replace on new submit — each question replaces the previous guidance, keeping sidebar focused on current task

### Prompt Engineering
- **D-08:** Use claude-3-5-sonnet model for v1 — best cost/speed/quality balance with strong vision
- **D-09:** Send screenshot + user intent only — no extra metadata. Let Claude infer app and OS from the screenshot
- **D-10:** When intent is ambiguous, Claude must ask a clarifying question instead of guessing — e.g., "I can see [app]. What specifically are you trying to do?"

### Error Handling
- **D-11:** Show error inline in guidance area with Retry button — "Couldn't reach AI — check your connection." No modal dialogs
- **D-12:** Screenshot capture failure falls back to text-only (see D-04)

### Claude's Discretion
- System prompt wording and structure (must produce numbered steps per D-05 from Phase 1)
- Exact streaming chunk parsing approach (SSE event handling)
- Image encoding pipeline implementation details (xcap → resize → JPEG → base64)
- Timeout thresholds for API calls

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project Context
- `.planning/PROJECT.md` — Core value, constraints, key decisions
- `.planning/REQUIREMENTS.md` — v1 requirements: CORE-01 through CORE-05
- `CLAUDE.md` — Technology stack (xcap, reqwest, Claude API, base64/image crates)

### Phase 1 Artifacts
- `.planning/phases/01-infrastructure-app-shell/01-CONTEXT.md` — Prior decisions (D-01 through D-15)
- `worker/src/index.ts` — Existing `/chat` route with SSE proxy to Anthropic API
- `src/components/SidebarShell.tsx` — Current stub submission handler to replace
- `src/components/GuidanceList.tsx` — Existing numbered list renderer
- `src/lib/tauri.ts` — IPC wrappers to extend
- `src-tauri/src/permissions.rs` — Screen capture permission check via xcap

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `GuidanceList` component: Already renders numbered steps — extend to handle streaming updates
- `TextInput` component: Already handles submit — wire to real API call
- `SidebarShell`: Orchestrates permission → empty state → guidance flow — add loading/streaming/error states
- Worker `/chat` route: Already proxies to Anthropic with SSE — frontend needs to consume the stream
- `src/lib/tauri.ts`: IPC wrappers for permissions and preferences — add screenshot capture command

### Established Patterns
- Tauri commands in Rust (`#[tauri::command]`) with TypeScript IPC wrappers in `src/lib/tauri.ts`
- SolidJS signals for reactive state (`createSignal`, `Show`, `For`)
- CSS custom properties for theming (dark/light via `prefers-color-scheme`)

### Integration Points
- New Rust command: `capture_screenshot` — uses xcap to grab monitor, resize with image crate, encode to base64
- New Rust command: `send_to_ai` — sends screenshot + intent to Worker `/chat`, returns SSE stream
- Frontend: `SidebarShell.handleSubmit` → invoke capture → invoke AI → stream response into `GuidanceList`
- Worker: Existing `/chat` route receives base64 image + messages, proxies to Claude vision API

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches for the implementation pipeline.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 02-core-ai-loop*
*Context gathered: 2026-04-09*
