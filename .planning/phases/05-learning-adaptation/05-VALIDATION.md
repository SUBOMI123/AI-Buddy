---
phase: 05-learning-adaptation
generated_from: 05-RESEARCH.md
---

# Phase 05 Validation Strategy

## Test Framework

| Property | Value |
|----------|-------|
| Framework | Node built-in test runner (worker tests); Rust built-in test runner (`cargo test`) |
| Config file | none for frontend; Rust tests inline in `memory.rs` using `#[cfg(test)]` |
| Quick run command | `cargo test --manifest-path src-tauri/Cargo.toml` |
| Full suite command | `cargo test --manifest-path src-tauri/Cargo.toml` |

## Phase Requirements → Test Map

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

## Rust Test Fixture

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

## Sampling Rate

- **Per task commit:** `cargo build --manifest-path src-tauri/Cargo.toml` (compile check)
- **Per wave merge:** Full Rust test suite: `cargo test --manifest-path src-tauri/Cargo.toml`
- **Phase gate:** All Rust tests pass + manual smoke of all 3 tiers + settings screen renders

## Wave 0 Gaps

- [ ] `src-tauri/src/memory.rs` — all storage logic + `#[cfg(test)]` module with in-memory DB fixture
- [ ] Rust test cases for encounter count increment and tier selection
- [ ] `rusqlite = { version = "0.39", features = ["bundled"] }` added to Cargo.toml
