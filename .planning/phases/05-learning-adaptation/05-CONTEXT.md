# Phase 5: Learning & Adaptation — Context

**Gathered:** 2026-04-10
**Status:** Ready for planning

<domain>
## Phase Boundary

The assistant gets smarter with use. Every completed AI response is written to a local SQLite database (rusqlite) recording the app context, intent, Claude-classified task label, and guidance depth. On repeat encounters with the same task label, guidance length degrades: full step-by-step on first encounter, shorter summary on second, hints only on third+. A skill profile summarising strengths and recurring struggles is derived automatically and accessible from a dedicated settings screen in the sidebar. All data stays on-device — nothing leaves the device.

This phase adds:
- Rust storage layer (rusqlite, SQLite DB in app data directory)
- Memory write on every completed AI response
- Task classification call to Claude (lightweight, on write)
- Memory context injected into `streamGuidance` system prompt
- Subtle degradation notice in guidance responses
- "Show full steps" override link
- Settings/profile screen (new SolidJS component)
- Gear icon in sidebar header to open settings
</domain>

<decisions>
## Implementation Decisions

### Memory Write Trigger
- **D-01:** Memory is written **after every completed AI response** — automatically, no user action required. Every interaction (app context, user intent, Claude-classified task label, guidance text, timestamp) is recorded. Zero friction, maximum data for adaptation.

### Task Recognition
- **D-02:** Task matching uses **Claude-classified canonical labels**. At write time, a lightweight Claude call extracts a short canonical task label from the user's raw intent (e.g. "export PDF", "create pivot table", "resize image"). Repeat encounter matching is exact on this label. No sqlite-vec or fuzzy matching needed for v1.
  - The classification prompt should be minimal — single-turn, no screenshot, ~10 tokens in/out.
  - Task labels should be app-agnostic where possible (e.g. "insert table" not "Notion insert table") to allow cross-app skill transfer.

### Guidance Degradation
- **D-03:** Three guidance tiers keyed by encounter count for the same task label:
  - **1st encounter:** Full step-by-step (current behavior — no change to prompt)
  - **2nd encounter:** Summary mode — Claude told to give shorter steps, skip obvious sub-steps
  - **3rd+ encounter:** Hints only — Claude told to give directional hints, not numbered steps
- **D-04:** A **subtle notice** appears above the guidance when adaptation is active: _"You've done this before — showing [summary / hints]. [Show full steps]"_. Clicking "Show full steps" re-runs the query with the full step-by-step prompt, ignoring memory for that request.

### Skill Profile
- **D-05:** Skill profile is derived automatically from the SQLite memory data — no manual input from the user.
  - Shows: apps used, task categories attempted, encounter counts, areas where guidance was repeatedly needed.
  - A "strengths" section (tasks where tier 3 hints were sufficient) and a "recurring struggles" section (tasks attempted 3+ times still needing step-by-step).
- **D-06:** The skill profile is accessed via a **dedicated settings screen**. A gear icon (⚙) in the sidebar header opens this screen. The settings screen replaces the main content area while open (not a modal — full sidebar area swap).

### Storage
- **D-07:** Local SQLite via **rusqlite** (bundled). DB file in Tauri's app data directory (`AppData/ai-buddy/memory.db` on Windows, `~/Library/Application Support/ai-buddy/memory.db` on macOS). No external DB process.
- **D-08:** All learning data is **strictly local** — no learning data is sent to the Cloudflare Worker or any external endpoint. The memory context injected into Claude prompts is a short summary string, not raw DB rows.
- **D-09:** sqlite-vec is **deferred to v2** — v1 uses exact label matching (D-02). If semantic similarity is needed later, the schema should be designed to accommodate embedding columns without migration pain.

### Claude's Discretion
- Schema design for the memory tables (columns, indexes)
- Format of the memory context string injected into the system prompt
- Exact wording of the degradation notice and hint-mode prompt adjustments
- Settings screen layout and visual treatment
- Whether task classification is a separate API call or piggybacked on the main guidance call
- How "Show full steps" overrides the tier (flag on the request, or just omit memory context)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project Context
- `.planning/PROJECT.md` — Core value, constraints, non-negotiables
- `.planning/REQUIREMENTS.md` — LEARN-01, LEARN-02, LEARN-03

### Prior Phase Artifacts
- `.planning/phases/02-core-ai-loop/02-CONTEXT.md` — D-01 (capture on submit), AI loop flow
- `.planning/phases/01-infrastructure-app-shell/01-CONTEXT.md` — D-14 (macOSPrivateApi), sidebar window config

### Existing Code — Integration Points
- `src/lib/ai.ts` — `streamGuidance` and `SYSTEM_PROMPT` to extend with memory context injection
- `src/components/SidebarShell.tsx` — main sidebar component; gear icon + settings screen goes here
- `src-tauri/src/lib.rs` — invoke_handler where new storage commands get registered
- `src-tauri/Cargo.toml` — rusqlite must be added as dependency

</canonical_refs>
