# Phase 05: Learning & Adaptation - Research

**Researched:** 2026-04-10
**Domain:** Local SQLite persistence (rusqlite), task classification prompt, memory context injection, SolidJS content-swap pattern
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Memory is written after every completed AI response — automatically, no user action required. Every interaction (app context, user intent, Claude-classified task label, guidance text, timestamp) is recorded.
- **D-02:** Task matching uses Claude-classified canonical labels. At write time, a lightweight Claude call extracts a short canonical task label from the user's raw intent. Repeat encounter matching is exact on this label. No sqlite-vec or fuzzy matching needed for v1. Labels should be app-agnostic where possible (e.g. "insert table" not "Notion insert table").
- **D-03:** Three guidance tiers keyed by encounter count for the same task label: 1st encounter = full step-by-step, 2nd encounter = summary mode, 3rd+ encounter = hints only.
- **D-04:** A subtle notice appears above guidance when adaptation is active: "You've done this before — showing [summary / hints]. [Show full steps]". Clicking "Show full steps" re-runs with full step-by-step prompt, ignoring memory for that request.
- **D-05:** Skill profile is derived automatically from SQLite memory data — no manual input. Shows apps used, task categories attempted, encounter counts, strengths (tasks where tier 3 hints were sufficient) and recurring struggles (tasks attempted 3+ times still needing step-by-step).
- **D-06:** Skill profile accessed via dedicated settings screen. Gear icon in sidebar header opens this screen. The settings screen replaces the main content area (not a modal — full sidebar area swap).
- **D-07:** Local SQLite via rusqlite (bundled). DB file in Tauri's app data directory.
- **D-08:** All learning data is strictly local — no learning data sent to Cloudflare Worker or any external endpoint. Memory context injected into Claude prompts is a short summary string, not raw DB rows.
- **D-09:** sqlite-vec deferred to v2 — v1 uses exact label matching.

### Claude's Discretion
- Schema design for the memory tables (columns, indexes)
- Format of the memory context string injected into the system prompt
- Exact wording of the degradation notice and hint-mode prompt adjustments
- Settings screen layout and visual treatment
- Whether task classification is a separate API call or piggybacked on the main guidance call
- How "Show full steps" overrides the tier (flag on the request, or just omit memory context)

### Deferred Ideas (OUT OF SCOPE)
- sqlite-vec / semantic similarity search (v2)
- Any cloud sync of learning data
- Manual user input to skill profile
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| LEARN-01 | Local learning memory tracks task struggles, completions, and knowledge gaps | rusqlite bundled + Tauri app_data_dir gives the storage layer; schema design in Architecture Patterns covers table structure |
| LEARN-02 | Degrading guidance adapts over time — detailed steps on first encounter, shorter on second, hints on third+ | Guidance tier prompt variants documented in Code Examples; encounter count read from DB before streamGuidance call |
| LEARN-03 | High-level skill profiles derived automatically from granular memory data | Derived via SQL aggregation query — no separate ML needed; SettingsScreen component renders the result |
</phase_requirements>

---

## Summary

Phase 5 adds a local learning layer on top of the existing AI loop. The core machinery is: (1) a rusqlite database in the Tauri app data directory that records every completed interaction, (2) a lightweight Claude classification call that stamps each record with a canonical task label, (3) an encounter-count lookup that selects which of three prompt variants to use for the next request with the same task, and (4) a new SettingsScreen SolidJS component reachable from a gear icon in the sidebar header.

The Tauri v2 state management pattern already used by preferences.rs generalises cleanly to rusqlite: wrap `Connection` in `std::sync::Mutex`, manage it via `app.manage()` in setup(), and receive it as `tauri::State<Mutex<Connection>>` in every command. The DB path uses the same `app.path().app_data_dir()` call already present in preferences.rs, with `memory.db` as the filename.

The biggest discretionary call is whether task classification runs as a separate fire-and-forget Claude call after `onDone` fires, or is piggybacked as a second message in the same conversation. A separate call is simpler and doesn't affect the visible latency experienced by the user. The classification prompt needs to be extremely short — the goal is a single canonical snake_case label like `export_pdf` or `create_pivot_table` in response to the user's raw intent string.

**Primary recommendation:** Implement rusqlite as a Tauri-managed Mutex state (matching the preferences pattern), use a separate fire-and-forget classification call after onDone, and implement the settings screen as a SolidJS `<Show>` content swap driven by a top-level signal in SidebarShell — no router needed.

---

## Project Constraints (from CLAUDE.md)

| Directive | Impact on This Phase |
|-----------|---------------------|
| Use rusqlite (not tauri-plugin-sql/sqlx) | Direct rusqlite with bundled feature, no async overhead |
| All performance-critical ops in Rust, not JS | Memory reads/writes, DB queries, classification call all in Rust commands |
| SolidJS frontend (not React) | `<Show>` and signal-based content swap for settings screen |
| API keys never in binary | Classification call goes through the existing Cloudflare Worker /chat endpoint |
| Local-only learning data | Memory context is a summary string; no DB rows sent over network |
| sqlite-vec deferred to v2 | Exact label matching only — confirmed in D-09 |

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| rusqlite | 0.39.0 | SQLite bindings for Rust | Direct, zero-overhead. `bundled` feature compiles SQLite 3.51.3 in-process, no system SQLite dependency. CLAUDE.md mandates this over sqlx/tauri-plugin-sql. |
| rusqlite (bundled feature) | same | Bundles SQLite 3.51.3 | Avoids Windows build issues, version pinned per bundled SQLite. Already recommended in CLAUDE.md. |

[VERIFIED: docs.rs/crate/rusqlite/latest — version 0.39.0, released 2026-03-15, includes bundled SQLite 3.51.3]

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| std::sync::Mutex | std | Thread-safe connection guard | Wraps rusqlite Connection for Tauri managed state |
| tauri::State | Tauri 2.x | Inject managed state into commands | Receives `Mutex<Connection>` in every storage command |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| rusqlite direct | tauri-plugin-sql (sqlx) | sqlx is async-heavy, doesn't support SQLite extension loading; rusqlite is simpler for sync Tauri commands |
| Separate classification call | Piggyback on main guidance call | Piggyback complicates streaming response parsing; separate call is cleaner |

**Installation (add to src-tauri/Cargo.toml):**
```toml
rusqlite = { version = "0.39", features = ["bundled"] }
```

**Version verification:** `rusqlite 0.39.0` confirmed via docs.rs search result dated 2026-03-15. [VERIFIED: docs.rs/crate/rusqlite/latest]

---

## Architecture Patterns

### Recommended Project Structure

New files this phase adds:

```
src-tauri/src/
├── memory.rs          # DB init, schema, all storage commands
src/components/
├── SettingsScreen.tsx  # Skill profile + settings content area
src/lib/
├── tauri.ts           # Extended with memory IPC wrappers (existing file)
├── ai.ts              # Extended with memoryContext param + tier prompt variants
```

SidebarShell.tsx gains a `showSettings` signal and gear icon — no new top-level file.

### Pattern 1: rusqlite Managed State in Tauri

**What:** Wrap `rusqlite::Connection` in `std::sync::Mutex`, register it with `app.manage()` in setup, receive via `tauri::State` in commands.

**When to use:** Every Tauri command that reads or writes the DB.

```rust
// Source: https://v2.tauri.app/develop/state-management/
// src-tauri/src/memory.rs

use rusqlite::{Connection, Result as SqlResult};
use std::sync::Mutex;
use tauri::{AppHandle, Manager, State};

pub struct MemoryDb(pub Mutex<Connection>);

pub fn open_db(app: &AppHandle) -> SqlResult<Connection> {
    let dir = app
        .path()
        .app_data_dir()
        .expect("Failed to get app data dir");
    std::fs::create_dir_all(&dir).ok();
    let db_path = dir.join("memory.db");
    let conn = Connection::open(db_path)?;
    init_schema(&conn)?;
    Ok(conn)
}

fn init_schema(conn: &Connection) -> SqlResult<()> {
    conn.execute_batch("
        CREATE TABLE IF NOT EXISTS interactions (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            task_label  TEXT    NOT NULL,
            raw_intent  TEXT    NOT NULL,
            app_context TEXT,
            guidance    TEXT    NOT NULL,
            tier        INTEGER NOT NULL DEFAULT 1,
            timestamp   INTEGER NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_task_label ON interactions(task_label);

        CREATE TABLE IF NOT EXISTS task_encounters (
            task_label      TEXT    PRIMARY KEY,
            encounter_count INTEGER NOT NULL DEFAULT 1,
            first_seen      INTEGER NOT NULL,
            last_seen       INTEGER NOT NULL
        );
    ")?;
    Ok(())
}
```

**Registration in lib.rs setup:**
```rust
// Source: Tauri v2 state management docs [VERIFIED: v2.tauri.app/develop/state-management/]
.setup(|app| {
    let conn = memory::open_db(app.handle())?;
    app.manage(memory::MemoryDb(std::sync::Mutex::new(conn)));
    // ... existing setup
    Ok(())
})
```

**Command signature:**
```rust
#[tauri::command]
pub fn cmd_record_interaction(
    db: State<'_, MemoryDb>,
    task_label: String,
    raw_intent: String,
    app_context: Option<String>,
    guidance: String,
    tier: u8,
) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    // INSERT + upsert task_encounters
    Ok(())
}
```

### Pattern 2: App Data Dir Path (Tauri v2)

**What:** The existing preferences.rs uses `app.path().app_data_dir()` — the same call works for the DB path.

[VERIFIED: Codebase — preferences.rs line 63-69 already uses this exact pattern]

```rust
// Matches existing prefs_path() pattern in preferences.rs
let dir = app.path().app_data_dir().expect("Failed to get app data dir");
std::fs::create_dir_all(&dir).ok();
dir.join("memory.db")
```

**Cross-platform paths:**
- macOS: `~/Library/Application Support/ai-buddy/memory.db`
- Windows: `%APPDATA%\ai-buddy\memory.db`
- Linux: `~/.local/share/ai-buddy/memory.db`

### Pattern 3: Encounter Count Read Before streamGuidance

**What:** Before calling `streamGuidance`, the frontend fetches the encounter count for the current task label. This requires the label to be available before the main guidance call. However, D-02 says classification happens at write time (after the response), so the encounter count for the *next* call depends on the write that happens at end of the *current* call.

**Resolution:** The encounter count read happens against the already-written history. The flow is:
1. User submits intent
2. Frontend calls `cmd_get_encounter_count(raw_intent)` — Rust classifies intent synchronously (fast path), looks up count
3. Frontend passes `tier` (1/2/3) into `streamGuidance` options
4. After `onDone`, frontend calls `cmd_record_interaction(...)` with the label + tier used

**Alternative (simpler):** Do the classification and count lookup inside a single Rust command that returns `{ tier, task_label }`. This avoids a round trip.

**Recommended:** Single `cmd_prepare_guidance_context(raw_intent)` command returning `{ tier: u8, task_label: String, encounter_count: u32 }`. Frontend uses this to choose prompt variant before streaming.

### Pattern 4: Guidance Tier Prompt Variants

**What:** Three system prompt suffixes injected when `tier > 1`. The base `SYSTEM_PROMPT` is unchanged for tier 1 (first encounter).

[ASSUMED — exact wording is Claude's discretion per CONTEXT.md, but the injection pattern is deterministic]

```typescript
// Source: ai.ts extension — Claude's discretion for exact wording
const TIER_SUFFIX: Record<number, string> = {
  1: "",  // no change — full step-by-step
  2: `\n\nThis user has done this task before. Give a shorter summary — skip obvious sub-steps, consolidate related actions into single steps. Still number the steps.`,
  3: `\n\nThis user has done this task multiple times. Give directional hints only — no numbered list, no sub-steps. One or two sentences maximum pointing them in the right direction.`
};

export interface StreamGuidanceOptions {
  // ... existing fields
  memoryContext?: string;   // short summary string from DB (D-08)
  tier?: number;            // 1/2/3 — controls prompt suffix
  taskLabel?: string;       // for post-completion recording
}
```

**Memory context injection into system prompt:**
```typescript
// D-08: only a short summary string, not raw rows
const systemPrompt = SYSTEM_PROMPT
  + (opts.tier && opts.tier > 1 ? TIER_SUFFIX[opts.tier] : "")
  + (opts.memoryContext ? `\n\n## User's skill context\n${opts.memoryContext}` : "");
```

### Pattern 5: Task Classification Call

**What:** A minimal single-turn Claude call that returns a canonical snake_case task label from the user's raw intent string.

**Call type:** Separate `fetch` to `/chat` (same Cloudflare Worker endpoint) after `onDone`, before or concurrent with `cmd_record_interaction`. This is fire-and-forget from the UI perspective.

[ASSUMED — running classification in Rust as a post-completion reqwest call is equally valid and avoids a second round-trip from the frontend]

**Recommendation:** Run classification inside the Rust `cmd_record_interaction` command itself, before writing to DB. The command receives `raw_intent`, makes a `reqwest` call to `/chat` with the classification prompt, gets the label, then writes to DB. This keeps the logic in Rust and doesn't need an extra frontend call.

**Classification system prompt (kept in Rust):**
```
You are a task classifier. Respond with ONLY a snake_case task label (2-4 words, no spaces, no punctuation except underscores).
Extract the core task the user wants to perform. Make it app-agnostic.
Examples:
"I want to export this as a PDF" → export_pdf
"How do I create a pivot table here" → create_pivot_table
"I need to insert a table into this document" → insert_table
"How do I rename this layer" → rename_layer
```

**Classification user message:**
```
Intent: {raw_intent}
```

**Expected output:** `export_pdf` (token count ~3-6)

Use `claude-haiku` model variant for cost efficiency on classification (cheapest, fastest). This should cost < $0.001 per classification. [ASSUMED — model selection is Claude's discretion but haiku is standard for classification tasks]

### Pattern 6: SolidJS Settings Screen Content Swap

**What:** A `showSettings` signal in SidebarShell drives which content area renders. No router needed — this is a simple boolean swap.

[VERIFIED: docs.solidjs.com/concepts/control-flow/conditional-rendering — Show component is the standard SolidJS pattern for this]

```tsx
// SidebarShell.tsx additions
const [showSettings, setShowSettings] = createSignal(false);

// In JSX — replace current content show blocks:
<Show when={showSettings()}>
  <SettingsScreen onClose={() => setShowSettings(false)} />
</Show>

<Show when={!showSettings()}>
  {/* existing empty/loading/streaming/error states */}
</Show>
```

**Gear icon placement:** In the drag handle row or as a positioned element in the sidebar header area (before the existing `<DragHandle />`). A small settings icon (⚙ or `Settings` from lucide-solid) with a click handler.

### Pattern 7: Skill Profile SQL Derivation

**What:** LEARN-03 requires auto-deriving skill profile from raw DB. This is pure SQL aggregation — no ML needed.

```sql
-- Strengths: task_labels where most recent encounter used tier 3+
SELECT task_label, encounter_count, last_seen
FROM task_encounters
WHERE encounter_count >= 3
ORDER BY encounter_count DESC
LIMIT 10;

-- Recurring struggles: attempted 3+ times, last recorded tier was still 1
SELECT te.task_label, te.encounter_count
FROM task_encounters te
JOIN interactions i ON i.task_label = te.task_label
WHERE te.encounter_count >= 3
  AND i.tier = 1
  AND i.id = (SELECT MAX(id) FROM interactions WHERE task_label = te.task_label)
ORDER BY te.encounter_count DESC
LIMIT 10;

-- Apps used (from app_context column)
SELECT DISTINCT app_context FROM interactions WHERE app_context IS NOT NULL;
```

**Tauri command:** `cmd_get_skill_profile` returns a serialised struct with strengths vec, struggles vec, apps vec, and total interactions count.

### Anti-Patterns to Avoid

- **Opening Connection in every command:** Do NOT call `Connection::open()` inside each command — open once in setup, manage via Mutex state. Multiple open calls create separate connections and bypass WAL consistency.
- **Sending DB rows to Claude:** D-08 is explicit — only a short summary string goes to Claude, not raw interaction rows. Violating this sends user data through the Cloudflare Worker (network).
- **Synchronous classification blocking UI:** If classification runs in the frontend (fetch), it must fire after `onDone` without blocking the UI update. Prefer Rust-side post-record classification.
- **Storing full guidance text without length limit:** Full guidance responses can be 2-4KB. Store them, but do not include them in the memory context string sent to Claude.
- **Exact app name in task labels:** Labels like `"notion_insert_table"` break cross-app skill transfer. Labels should be `"insert_table"` — app context is already stored in the `app_context` column separately.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| SQLite connection | Custom file I/O or JSON-based persistence | rusqlite bundled | rusqlite handles file locking, WAL mode, type conversion; hand-rolled file I/O is prone to corruption |
| Task similarity matching | Levenshtein distance or token overlap | Exact label matching on Claude-classified labels (D-02) | Claude classification normalises synonyms before storage; exact match is sufficient for v1 |
| Vector search | Custom embedding + cosine similarity | Deferred to v2 with sqlite-vec | D-09 explicitly defers this; don't build it now |
| Settings routing | Full SPA router (solid-router) | Signal-based `<Show>` swap | Only two "screens" — adding a router for two states is over-engineering |
| Classification call | Custom NLP parsing | Claude Haiku classification prompt | Intent parsing is highly variable; Claude handles synonyms, typos, context better than any custom parser |

**Key insight:** The entire learning layer is additive — it does not change any existing code path for the base (tier 1) case. The existing `streamGuidance` and `submitIntent` only change when tier > 1 or settings are open.

---

## Common Pitfalls

### Pitfall 1: Mutex Deadlock on Classification Call
**What goes wrong:** If `cmd_record_interaction` holds the Mutex lock while making an async reqwest call (for classification), the Mutex is held for the duration of the network call — blocking all other DB operations.
**Why it happens:** Classification requires a network call; if done inside a locked section, it starves other commands.
**How to avoid:** Classify first (before acquiring the lock), then lock and write:
```rust
let task_label = classify_intent(&app_handle, &raw_intent).await?;
let conn = db.0.lock()?;
// now write with known task_label
```
Or run classification entirely outside the command, pass the result in.
**Warning signs:** UI hangs after guidance completes; multiple requests queuing.

### Pitfall 2: Tauri Command is Sync but Needs Async HTTP
**What goes wrong:** `cmd_record_interaction` needs to call reqwest for classification, but Tauri commands default to sync. Using `tokio::runtime::Handle::current().block_on(...)` inside a sync command on the main thread can deadlock.
**Why it happens:** Tauri v2 Rust commands can be `async fn` — but the Mutex approach works with sync commands. Mixing sync Mutex with async reqwest is the trap.
**How to avoid:** Annotate the storage command as `async`:
```rust
#[tauri::command]
pub async fn cmd_record_interaction(
    app: AppHandle,
    db: State<'_, MemoryDb>,
    ...
) -> Result<(), String> {
    let label = classify_intent(&app, &raw_intent).await?;
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    // ...
}
```
`std::sync::Mutex` works fine in async context when the lock is held briefly (no await inside the lock).
**Warning signs:** Compile error about `Send` bounds, or runtime deadlock on second interaction.

### Pitfall 3: First-Launch DB Init Race
**What goes wrong:** Multiple Tauri commands fire before the DB connection is managed (if setup is slow).
**Why it happens:** DB init happens in setup(); if setup errors, `app.manage()` is never called, and any command that calls `State<MemoryDb>` panics.
**How to avoid:** Propagate setup errors cleanly (already done by existing lib.rs pattern). Wrap `open_db` errors in `map_err` and return from setup with `?`.

### Pitfall 4: task_encounters Upsert Logic
**What goes wrong:** Two INSERT paths (new task vs. repeat task) with no UPSERT leads to duplicates or silent no-ops.
**Why it happens:** SQLite `INSERT OR REPLACE` deletes and re-inserts, resetting AUTOINCREMENT counters.
**How to avoid:** Use `INSERT INTO task_encounters ... ON CONFLICT(task_label) DO UPDATE SET encounter_count = encounter_count + 1, last_seen = excluded.last_seen`:
```sql
INSERT INTO task_encounters (task_label, encounter_count, first_seen, last_seen)
VALUES (?1, 1, ?2, ?2)
ON CONFLICT(task_label) DO UPDATE SET
  encounter_count = encounter_count + 1,
  last_seen = excluded.last_seen;
```
**Warning signs:** Encounter count always 1, or guidance never degrades.

### Pitfall 5: Memory Context String Growing Without Bound
**What goes wrong:** If the memory context string injected into the system prompt grows with every interaction, token costs increase and context window fills.
**Why it happens:** No size cap on the summary string.
**How to avoid:** Cap the memory context to a fixed-length summary. Suggested format (< 200 tokens):
```
User skill context: Has done [export_pdf] 4x, [create_pivot_table] 2x. Struggles with [insert_table] (3 attempts). Uses: Notion, Figma.
```
Derive this from `task_encounters` with a `LIMIT 5` for each category.

### Pitfall 6: Classification Fails Silently, Tier Reverts to 1
**What goes wrong:** If the classification call fails (network error, rate limit), the task label defaults to something unusable, so encounter count never increments.
**Why it happens:** No fallback label strategy.
**How to avoid:** On classification failure, use a deterministic fallback: first 3 words of raw_intent lowercased and underscored (e.g. `"how do I export"` → `"how_do_i"`). This is imperfect but prevents data loss for the interaction. Log the failure.

---

## Code Examples

### Opening the DB in Rust setup (Tauri v2 pattern)
```rust
// Source: preferences.rs (existing codebase) + Tauri v2 state management docs
// [VERIFIED: preferences.rs lines 63-69 — app.path().app_data_dir() pattern confirmed in codebase]
.setup(|app| {
    let conn = memory::open_db(app.handle())
        .map_err(|e| Box::new(std::io::Error::new(std::io::ErrorKind::Other, e.to_string())))?;
    app.manage(memory::MemoryDb(std::sync::Mutex::new(conn)));
    Ok(())
})
```

### SQLite UPSERT for encounter tracking
```sql
-- Source: SQLite docs — INSERT OR ... ON CONFLICT syntax [ASSUMED — standard SQLite 3.24+ syntax]
INSERT INTO task_encounters (task_label, encounter_count, first_seen, last_seen)
VALUES (?1, 1, ?2, ?2)
ON CONFLICT(task_label) DO UPDATE SET
  encounter_count = encounter_count + 1,
  last_seen = excluded.last_seen;
```

### Frontend tier-based guidance call
```typescript
// Source: ai.ts extension pattern [ASSUMED — Claude's discretion on exact wording]
const ctx = await invoke<{ tier: number; task_label: string; encounter_count: number }>(
  "cmd_prepare_guidance_context",
  { rawIntent: intent }
);

await streamGuidance({
  token,
  screenshot,
  userIntent: intent,
  tier: ctx.tier,
  memoryContext: ctx.tier > 1 ? await invoke("cmd_get_memory_context") : undefined,
  onToken, onError,
  onDone: async () => {
    // fire-and-forget — record after response complete
    invoke("cmd_record_interaction", {
      taskLabel: ctx.task_label,
      rawIntent: intent,
      guidance: streamingText(),
      tier: ctx.tier,
    }).catch(() => {});
    onDone();
  },
  signal,
});
```

### SolidJS settings content swap
```tsx
// Source: docs.solidjs.com/reference/components/show [VERIFIED: official SolidJS docs]
const [showSettings, setShowSettings] = createSignal(false);

// In render:
<Show when={showSettings()}>
  <SettingsScreen onClose={() => setShowSettings(false)} />
</Show>
<Show when={!showSettings()}>
  {/* existing guidance content area */}
</Show>
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| rusqlite 0.31.x (CLAUDE.md) | rusqlite 0.39.0 (latest) | 2026-03-15 | Includes SQLite 3.51.3, API compatible — just update version pin |
| `path_resolver().app_data_dir()` (Tauri v1 API) | `app.path().app_data_dir()` (Tauri v2) | Tauri v2 release | preferences.rs already uses v2 API correctly |

**Deprecated/outdated:**
- CLAUDE.md lists `rusqlite = "0.31"` in the installation section — this is stale. Latest is 0.39.0. [VERIFIED: docs.rs 2026-03-15]

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Task classification runs inside `cmd_record_interaction` as async reqwest call after guidance completes | Architecture Pattern 3 | Could be a frontend fetch instead — changes where the classification prompt lives and who calls it |
| A2 | Tier prompt suffix wording (summary/hints) in Pattern 4 | Code Examples | Exact wording is Claude's discretion — planner should treat as draft, not final |
| A3 | `cmd_prepare_guidance_context` single-command approach for tier + label lookup | Architecture Pattern 3 | Could be split into separate classify + lookup commands — changes command count |
| A4 | Memory context string format (< 200 tokens, comma-separated labels) | Common Pitfalls 5 | Actual format is Claude's discretion — token budget is a guideline |
| A5 | Using `claude-haiku` model for classification | Architecture Pattern 5 | Any Claude model works; haiku is cheapest but not yet confirmed as available via existing Worker |
| A6 | Classification fallback to first-3-words on error | Common Pitfalls 6 | Fallback label strategy is Claude's discretion |

---

## Open Questions

1. **Classification model routing in the Worker**
   - What we know: The Worker currently routes `/chat` to `claude-sonnet-4-20250514`
   - What's unclear: Can the frontend (or Rust) pass a different model for the classification call, or does the Worker need a new route?
   - Recommendation: Add a `/classify` route to the Worker (or accept a `model` override in `/chat`) so classification uses a cheaper model. If not, use the same sonnet model — classification latency is not user-facing.

2. **Where encounter count lookup happens (before or after classification)**
   - What we know: To select the correct tier for the *current* call, we need the count for the *current* task label — which requires classifying the intent first
   - What's unclear: This means classification must happen *before* the main guidance call, not after
   - Recommendation: `cmd_prepare_guidance_context` classifies the intent, looks up encounter count, returns `{ tier, task_label }` — all before `streamGuidance` starts. The record is written after. This means a round-trip (classify → get count → guidance call) but classification is < 300ms and not user-visible if done during the loading state.

3. **Gear icon position in SidebarShell**
   - What we know: SidebarShell has a DragHandle at top, then a content area, then TextInput at bottom
   - What's unclear: DragHandle is a separate component — does the gear icon go inside it, or as a separate element above the content area?
   - Recommendation: Add a header row between DragHandle and sidebar-content div, containing a gear icon button on the right. This matches macOS panel conventions and leaves DragHandle untouched.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Rust / Cargo | rusqlite compilation | ✓ | (existing project builds) | — |
| rusqlite 0.39 | memory.rs | needs Cargo.toml addition | not yet added | — |
| SQLite (bundled) | rusqlite bundled feature | ✓ | 3.51.3 (bundled) | — |
| Cloudflare Worker | classification call | ✓ | existing deployment | add /classify route or reuse /chat |
| lucide-solid | gear icon | ✓ | already used (X icon in SidebarShell) | any unicode ⚙ character |

**Missing dependencies with no fallback:**
- `rusqlite = { version = "0.39", features = ["bundled"] }` must be added to `src-tauri/Cargo.toml` before any Rust storage code compiles.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Node built-in test runner (worker tests); no frontend unit test framework detected |
| Config file | none for frontend; worker uses `npx tsx --test src/index.test.ts` |
| Quick run command | `cd /Users/subomi/Desktop/AI-Buddy/worker && npm test` |
| Full suite command | same |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| LEARN-01 | DB creates memory.db in app data dir on first launch | manual smoke | Tauri dev run, check `~/Library/Application Support/ai-buddy/memory.db` exists | ❌ Wave 0 |
| LEARN-01 | `cmd_record_interaction` writes a row to interactions table | integration | Rust `#[test]` in memory.rs using in-memory DB | ❌ Wave 0 |
| LEARN-01 | `task_encounters` encounter_count increments on repeat label | integration | Rust `#[test]` — insert same label twice, assert count == 2 | ❌ Wave 0 |
| LEARN-02 | `cmd_prepare_guidance_context` returns tier=1 for new task | integration | Rust `#[test]` | ❌ Wave 0 |
| LEARN-02 | `cmd_prepare_guidance_context` returns tier=2 after 1 encounter | integration | Rust `#[test]` | ❌ Wave 0 |
| LEARN-02 | `cmd_prepare_guidance_context` returns tier=3 after 2+ encounters | integration | Rust `#[test]` | ❌ Wave 0 |
| LEARN-02 | Tier 2/3 UI shows degradation notice | manual smoke | open sidebar, submit known task 2x | ❌ Wave 0 |
| LEARN-02 | "Show full steps" override re-runs at tier 1 | manual smoke | click override link, verify full guidance | ❌ Wave 0 |
| LEARN-03 | `cmd_get_skill_profile` returns strengths + struggles | integration | Rust `#[test]` with seeded in-memory DB | ❌ Wave 0 |
| LEARN-03 | SettingsScreen displays skill profile data | manual smoke | open gear icon, verify profile sections render | ❌ Wave 0 |

**Rust tests use in-memory DB:**
```rust
#[cfg(test)]
mod tests {
    use super::*;
    fn test_conn() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        init_schema(&conn).unwrap();
        conn
    }
}
```

### Sampling Rate
- **Per task commit:** `cargo build --manifest-path src-tauri/Cargo.toml` (compile check)
- **Per wave merge:** Full Rust test suite: `cargo test --manifest-path src-tauri/Cargo.toml`
- **Phase gate:** All Rust tests pass + manual smoke of all 3 tiers + settings screen renders

### Wave 0 Gaps
- [ ] `src-tauri/src/memory.rs` — all storage logic + `#[cfg(test)]` module with in-memory DB fixture
- [ ] Rust test cases for encounter count increment and tier selection
- [ ] `rusqlite = { version = "0.39", features = ["bundled"] }` added to Cargo.toml

---

## Security Domain

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | n/a — local-only storage, no auth needed |
| V3 Session Management | no | n/a |
| V4 Access Control | no | local SQLite, single-user app |
| V5 Input Validation | yes | task_label, raw_intent bound as SQLite params (not string interpolation) |
| V6 Cryptography | no | learning data is not sensitive; DB file is not encrypted in v1 |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| SQL injection via raw_intent or task_label | Tampering | Always use rusqlite parameterised queries — `conn.execute("... VALUES (?1, ?2)", params![label, intent])` — never string interpolation |
| Memory context string leaking full interaction history to Claude | Information Disclosure | D-08 enforced: only a short summary string constructed from aggregate counts, never raw guidance text or raw_intent |
| DB file readable by other processes | Information Disclosure | SQLite file permissions set to 600 (user-only) at creation, matching the existing `settings.json` pattern in preferences.rs |

---

## Sources

### Primary (HIGH confidence)
- `src-tauri/src/preferences.rs` (codebase) — confirmed `app.path().app_data_dir()` pattern and file permission hardening at lines 63-69
- `src/lib/ai.ts` (codebase) — confirmed SYSTEM_PROMPT shape and streamGuidance options interface
- `src/components/SidebarShell.tsx` (codebase) — confirmed Show-based conditional rendering pattern already in use
- `src-tauri/src/lib.rs` (codebase) — confirmed invoke_handler registration pattern
- docs.rs/crate/rusqlite/latest — rusqlite 0.39.0, released 2026-03-15, bundled = SQLite 3.51.3
- v2.tauri.app/develop/state-management/ — Mutex<Connection> managed state pattern

### Secondary (MEDIUM confidence)
- docs.solidjs.com/reference/components/show — Show component for conditional content swap
- WebSearch: rusqlite 0.39.0 confirmed as latest (multiple sources agree on version number)

### Tertiary (LOW confidence)
- Classification prompt design and haiku model selection — based on general Anthropic best practices; verify model availability through existing Worker

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — rusqlite version verified via docs.rs, Cargo pattern verified in existing codebase
- Architecture: HIGH for Rust patterns (confirmed from preferences.rs), MEDIUM for frontend tier injection (assumed, Claude's discretion on exact wording)
- Pitfalls: HIGH — Mutex + async deadlock and UPSERT patterns are well-documented Rust/SQLite gotchas

**Research date:** 2026-04-10
**Valid until:** 2026-05-10 (30 days — stable libraries, no fast-moving dependencies)
