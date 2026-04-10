---
status: awaiting_human_verify
trigger: "Investigate why interactions are not being recorded to memory.db after AI responses complete."
created: 2026-04-10T00:00:00Z
updated: 2026-04-10T00:00:00Z
---

## Current Focus

hypothesis: `recordInteraction` is never called because `onDone` in SidebarShell.tsx guards the call with `if (ctx.taskLabel)`, but `ctx.taskLabel` is always an EMPTY STRING when `forceFullSteps=true` (because ctx defaults to `{ tier: 1, taskLabel: "", encounterCount: 0 }` and `prepareGuidanceContext` is skipped). For the normal (non-forceFullSteps) path, the call IS made — but there is a TYPE MISMATCH: `recordInteraction` sends `tier` as a number (TypeScript `number`), while the Rust command `cmd_record_interaction` expects `tier: u8`. Tauri's IPC deserializer should handle this. The actual root cause is more subtle: the `onDone` callback captures `ctx` from the closure scope correctly. But `streamingText()` is read at `onDone` time — this should be fine since it's a signal read. On careful re-inspection: the real bug is that the `tier` field is typed as `u8` in Rust but sent as a JS `number`. Tauri IPC can handle this. Re-examining more carefully...

CONFIRMED ROOT CAUSE: In `tauri.ts` line 155-161, `recordInteraction` calls `invoke("cmd_record_interaction", { taskLabel, rawIntent, appContext, guidance, tier })`. The Rust command at `memory.rs` line 233-253 has parameter `tier: u8`. In Rust, `u8` deserializes correctly from a JSON number. The IPC signature matches.

ACTUAL ROOT CAUSE FOUND: The `onDone` callback in SidebarShell.tsx line 289-305 guards `recordInteraction` with `if (ctx.taskLabel)`. When `prepareGuidanceContext` FAILS (network issue calling /classify), the catch block sets `ctx.taskLabel` to a fallback derived from `intent.slice(0,50)`. So that path is covered.

BUT: when `forceFullSteps = true`, the code skips `prepareGuidanceContext` entirely and leaves `ctx.taskLabel = ""`. In that case the `if (ctx.taskLabel)` guard evaluates to falsy and `recordInteraction` is NEVER called. This means "Show full steps" re-runs never record interactions.

MORE CRITICALLY: For the NORMAL path — the code looks correct. But wait — re-reading the `onDone` block. `onDone` is declared as `() => void` (synchronous) in `StreamGuidanceOptions`. The `recordInteraction` call uses `.catch(() => {})` fire-and-forget. That's fine.

WAIT — found it. In `tauri.ts` line 155: the invoke parameter object uses camelCase keys (`taskLabel`, `rawIntent`, `appContext`). Tauri v2 IPC deserializes these as camelCase → snake_case automatically for Rust structs, BUT for individual `#[tauri::command]` function parameters, Tauri expects the JS keys to match the Rust parameter names EXACTLY (snake_case). The Rust function `cmd_record_interaction` has parameters: `task_label`, `raw_intent`, `app_context`, `guidance`, `tier`. The JS invoke sends: `taskLabel`, `rawIntent`, `appContext`, `guidance`, `tier`. **MISMATCH: camelCase in JS vs snake_case in Rust.** Tauri v2 does NOT auto-convert parameter names for `invoke` — the JS keys must match Rust parameter names exactly.

test: Verify by checking Tauri v2 IPC docs behavior for parameter name matching
expecting: Confirms camelCase→snake_case mismatch causes silent failure (Rust receives None/defaults, SQLite write never happens)
next_action: Fix tauri.ts recordInteraction and prepareGuidanceContext invoke calls to use snake_case keys

## Symptoms

expected: After submitting an intent and receiving a response, cmd_record_interaction should write a row to the interactions table and upsert task_encounters. The settings screen should show interaction count > 0.
actual: Settings screen shows "0 interactions recorded locally" even after multiple submissions. No degradation notice appears on repeat queries, suggesting tier is always 1 (because encounter_count never increments).
errors: None visible to user
reproduction: Submit any question in the sidebar, receive a response, open settings screen — still shows 0 interactions.
started: New code from Phase 5 plans 02 and 03. Never worked.

## Eliminated

- hypothesis: cmd_record_interaction not registered in invoke_handler
  evidence: lib.rs line 39 shows `memory::cmd_record_interaction` is registered
  timestamp: 2026-04-10T00:00:00Z

- hypothesis: onDone callback not called when response ends
  evidence: ai.ts calls onDone() on data === "[DONE]" (line 114) and also at end of stream (line 141). Both paths exist.
  timestamp: 2026-04-10T00:00:00Z

- hypothesis: recordInteraction not called in onDone at all
  evidence: SidebarShell.tsx lines 298-304 show recordInteraction IS called inside onDone, guarded by `if (ctx.taskLabel)`
  timestamp: 2026-04-10T00:00:00Z

- hypothesis: MemoryDb not initialized before commands run
  evidence: lib.rs lines 65-67 show memory::open_db called in setup() and managed via app.handle().manage()
  timestamp: 2026-04-10T00:00:00Z

## Evidence

- timestamp: 2026-04-10T00:00:00Z
  checked: tauri.ts recordInteraction invoke call (lines 155-161)
  found: invoke called with camelCase keys: `{ taskLabel, rawIntent, appContext, guidance, tier }`
  implication: Tauri v2 command parameter matching — needs investigation

- timestamp: 2026-04-10T00:00:00Z
  checked: memory.rs cmd_record_interaction signature (lines 233-241)
  found: Rust function parameters are snake_case: task_label, raw_intent, app_context, guidance, tier
  implication: Tauri v2 IPC requires JS invoke keys to match Rust parameter names. In Tauri v2, command parameters are deserialized by name — camelCase JS keys do NOT auto-map to snake_case Rust params for tauri::command functions

- timestamp: 2026-04-10T00:00:00Z
  checked: tauri.ts prepareGuidanceContext invoke call (line 144)
  found: invoke called with `{ rawIntent }` (camelCase), Rust expects `raw_intent` (snake_case)
  implication: Same mismatch — prepareGuidanceContext also fails silently, always returning the fallback ctx

- timestamp: 2026-04-10T00:00:00Z
  checked: Other working IPC calls in tauri.ts for comparison
  found: All other working commands use simple single-word params (shortcut, key, enabled, text) or no params — none use multi-word camelCase params. This is why only memory commands fail.
  implication: Confirms this is the root cause — camelCase/snake_case name mismatch specific to memory commands

## Resolution

root_cause: Tauri v2 IPC parameter name mismatch. tauri.ts passes camelCase keys (`taskLabel`, `rawIntent`, `appContext`) to `invoke()`, but the Rust #[tauri::command] functions expect snake_case parameter names (`task_label`, `raw_intent`, `app_context`). Tauri v2 does NOT auto-convert camelCase→snake_case for function parameter names in invoke calls. The commands receive `None`/empty values and either fail silently or write no-op rows. The `.catch(() => {})` on recordInteraction swallows the error.
fix: Change tauri.ts invoke parameter keys for memory commands to snake_case to match Rust parameter names
verification: empty until verified
files_changed: [src/lib/tauri.ts]
