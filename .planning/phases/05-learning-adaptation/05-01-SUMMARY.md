---
phase: 05-learning-adaptation
plan: "01"
subsystem: learning-memory
tags: [rust, sqlite, rusqlite, tauri-commands, cloudflare-worker, classification]
dependency_graph:
  requires: []
  provides: [memory-db-schema, memory-managed-state, classify-route]
  affects: [05-02, 05-03]
tech_stack:
  added: [rusqlite 0.39 bundled]
  patterns: [tauri-managed-state, sqlite-upsert, async-classify-before-lock]
key_files:
  created:
    - src-tauri/src/memory.rs
  modified:
    - src-tauri/Cargo.toml
    - src-tauri/src/lib.rs
    - worker/src/index.ts
decisions:
  - "MemoryDb managed via app.handle().manage() — Tauri v2 requires AppHandle not &mut App for manage()"
  - "cmd_record_interaction keeps app: AppHandle as _app for Tauri command signature compatibility"
  - "classify_intent called before Mutex acquisition to prevent Mutex held during async HTTP (Pitfall 1)"
  - "intent_fallback_label uses first-3-words on classification failure to prevent data loss"
metrics:
  duration_minutes: 15
  completed_date: "2026-04-10"
  tasks_completed: 2
  files_changed: 4
---

# Phase 05 Plan 01: Learning Memory Storage Layer Summary

**One-liner:** SQLite learning memory with rusqlite 0.39 bundled, 4 Tauri commands for tier-based guidance, and Worker /classify route using claude-haiku-4-5 for canonical task label classification.

## What Was Built

The foundation for Phase 5's learning and adaptation system:

1. **`src-tauri/src/memory.rs`** — Complete SQLite storage layer:
   - `MemoryDb(Mutex<Connection>)` managed state wrapper
   - `open_db()` / `init_schema()` — creates `interactions` and `task_encounters` tables with index
   - `cmd_prepare_guidance_context` — classifies intent (async HTTP to /classify), reads encounter count, returns `{ tier, task_label, encounter_count }` — called BEFORE streamGuidance
   - `cmd_record_interaction` — writes interaction row + upserts encounter counter in single lock scope — called AFTER onDone
   - `cmd_get_memory_context` — builds < 800 char summary string from aggregate DB counts for system prompt injection (D-08)
   - `cmd_get_skill_profile` — SQL-derived strengths (last tier=3) and recurring struggles (last tier=1) for settings screen (LEARN-03)
   - 9 Rust unit tests using in-memory DB fixture

2. **`src-tauri/src/lib.rs`** — Registration:
   - `mod memory` module declaration + `use tauri::Manager` import
   - `open_db` called in setup, result wrapped in `MemoryDb(Mutex::new(...))` and managed via `app.handle().manage()`
   - 4 memory commands appended to `invoke_handler`

3. **`worker/src/index.ts`** — `/classify` route:
   - POST `{ intent: string }` — validates non-empty, max 500 chars (T-05-02)
   - Calls Anthropic with `claude-haiku-4-5`, `max_tokens: 20`, `stream: false`
   - Sanitises label: lowercase, `[^a-z0-9_]` → `_`, truncated to 50 chars
   - Returns `{ label: "unknown_task" }` on any error — never 5xx

## Test Results

```
test memory::tests::test_first_encounter_count_is_one ... ok
test memory::tests::test_encounter_count_increments ... ok
test memory::tests::test_tier_selection_new_task ... ok
test memory::tests::test_tier_selection_second_encounter ... ok
test memory::tests::test_tier_selection_third_plus_encounter ... ok
test memory::tests::test_skill_profile_derivation ... ok
test memory::tests::test_memory_context_length_bounded ... ok
test memory::tests::test_different_tasks_independent_counts ... ok
test memory::tests::test_intent_fallback_label ... ok

test result: ok. 15 passed; 0 failed; 0 ignored; 0 measured
```

All 9 memory tests + 6 existing voice tests = 15 total passing.

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | 117f23b | feat(05-01): create memory.rs — DB schema, managed state, and Tauri commands |
| 2 | 2df2a74 | feat(05-01): register memory managed state in lib.rs + add /classify route to Worker |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `manage()` not found on `&mut tauri::App`**
- **Found during:** Task 2
- **Issue:** Plan showed `app.manage(...)` in setup closure but Tauri v2 setup receives `&mut tauri::App` which doesn't implement `manage()` — only `AppHandle` does
- **Fix:** Changed to `app.handle().manage(...)` and added `use tauri::Manager` import for the `manage` method trait
- **Files modified:** `src-tauri/src/lib.rs`

**2. [Rule 1 - Bug] Unused variable warnings cleaned up**
- **Found during:** Task 2
- **Issue:** `installation_id` was computed but unused in `classify_intent` (cmd_get_token already computes the full signed token); `Deserialize` import unused; `app` param in `cmd_record_interaction` unused
- **Fix:** Removed unused `installation_id` line, changed `Deserialize` to just `Serialize`, prefixed `app` to `_app`
- **Files modified:** `src-tauri/src/memory.rs`

## Security Review

| Threat ID | Status | Implementation |
|-----------|--------|----------------|
| T-05-01 | Mitigated | All SQL values bound via `params![]` — no string interpolation anywhere |
| T-05-02 | Mitigated | Worker /classify validates intent: non-empty string, max 500 chars, returns 400 |
| T-05-03 | Mitigated | `cmd_get_memory_context` returns aggregate counts only — no raw_intent or guidance text |
| T-05-04 | Mitigated | DB file permissions set to 0600 on Unix via `set_permissions` after `open()` |
| T-05-05 | Mitigated | `LIMIT 5` on all summary queries; output string verified < 800 chars by test |

## Known Stubs

None — all commands are fully wired to the DB. The `/classify` route is a real Anthropic call. No placeholder data flows to any UI rendering path in this plan (UI integration is Plan 02/03).

## Threat Flags

None — no new network endpoints beyond the /classify route documented in the plan's threat model. No new auth paths, file access patterns outside the planned memory.db, or unexpected schema changes.

## Self-Check: PASSED

- [x] `src-tauri/src/memory.rs` — FOUND
- [x] `src-tauri/Cargo.toml` — contains `rusqlite = { version = "0.39", features = ["bundled"] }`
- [x] `src-tauri/src/lib.rs` — contains `memory::MemoryDb`, 4 commands registered
- [x] `worker/src/index.ts` — contains `/classify` route
- [x] commit 117f23b — FOUND (`git log --oneline | grep 117f23b`)
- [x] commit 2df2a74 — FOUND (`git log --oneline | grep 2df2a74`)
- [x] All 15 tests pass (`cargo test` exits 0)
- [x] `cargo build` exits 0, no warnings
- [x] `npx tsc --noEmit` exits 0
