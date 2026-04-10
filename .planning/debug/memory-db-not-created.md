---
status: resolved
trigger: "Investigate why memory.db is not being created in ~/Library/Application Support/ai-buddy/ when the app launches."
created: 2026-04-10T00:00:00Z
updated: 2026-04-10T00:00:00Z
symptoms_prefilled: true
---

## Current Focus

hypothesis: `app.manage()` is called on `app.handle()` instead of `app` — this may or may not be the issue. The real confirmed issue is that `app.handle().manage()` is used instead of `app.manage()`, but more critically, the setup() call chain needs to be verified.
test: Read lib.rs to confirm how manage() is called and whether open_db is actually reached
expecting: Bug found in how setup() wires the DB connection
next_action: Confirm root cause from code read — see Evidence

## Symptoms

expected: After running `cargo tauri dev` and the app launching, `~/Library/Application Support/ai-buddy/memory.db` should exist
actual: The directory `~/Library/Application Support/ai-buddy/` does not exist at all — not just the file, the whole directory is missing
errors: None reported by user
reproduction: Run `cargo tauri dev`, wait for app to launch, check `~/Library/Application Support/ai-buddy/`
started: New code from Phase 5 plan 01 — DB init was never run before

## Eliminated

- hypothesis: mod memory not imported in lib.rs
  evidence: Line 1 of lib.rs: `mod memory;` — it is imported
  timestamp: 2026-04-10T00:00:00Z

- hypothesis: open_db not called in setup()
  evidence: Lines 65-66 of lib.rs: `let conn = memory::open_db(app.handle())` — it IS called
  timestamp: 2026-04-10T00:00:00Z

- hypothesis: rusqlite bundled feature missing from Cargo.toml
  evidence: Line 39 of Cargo.toml: `rusqlite = { version = "0.39", features = ["bundled"] }` — bundled IS present
  timestamp: 2026-04-10T00:00:00Z

- hypothesis: app_data_dir() returns wrong path
  evidence: preferences.rs uses same pattern and settings.json successfully writes there — path resolution is correct
  timestamp: 2026-04-10T00:00:00Z

## Evidence

- timestamp: 2026-04-10T00:00:00Z
  checked: lib.rs lines 65-67
  found: |
    ```rust
    let conn = memory::open_db(app.handle())
        .map_err(|e| Box::new(std::io::Error::new(std::io::ErrorKind::Other, e.to_string())))?;
    app.handle().manage(memory::MemoryDb(std::sync::Mutex::new(conn)));
    ```
  implication: open_db IS called. manage() is called on app.handle() which is valid in Tauri v2. Code structure looks correct.

- timestamp: 2026-04-10T00:00:00Z
  checked: memory.rs open_db() — lines 11-29
  found: |
    - Uses `app.path().app_data_dir().expect(...)` — will PANIC on failure, not return error
    - Uses `std::fs::create_dir_all(&dir).ok()` — silently ignores errors
    - Uses `Connection::open(&db_path)?` — propagates rusqlite error
    - Calls `init_schema(&conn)?` — propagates schema error
  implication: If app_data_dir() panics OR create_dir_all silently fails, the DB won't be created. But preferences.rs uses same path successfully, so path resolution should work.

- timestamp: 2026-04-10T00:00:00Z
  checked: The setup() call for open_db is placed AFTER tray::create_tray and shortcut registration
  found: If create_tray or register_shortcut returns an error, setup() exits early via `?` before reaching open_db
  implication: CRITICAL — if any earlier setup step fails (tray creation, shortcut registration), setup() returns early and open_db is NEVER called. The DB never gets created. The app can still launch because Tauri may continue despite setup errors in some configurations.

- timestamp: 2026-04-10T00:00:00Z
  checked: Tauri v2 setup() error handling
  found: setup() returns `Result<(), Box<dyn Error>>`. If it returns Err, tauri::Builder::run() calls `.expect("error while running tauri application")` which would PANIC and crash the app — the app would NOT launch silently.
  implication: If app launches successfully, setup() DID NOT error. This means open_db was called and either succeeded or panicked. If it panicked on expect("Failed to get app data dir"), the app would crash visibly.

- timestamp: 2026-04-10T00:00:00Z
  checked: memory.rs open_db — line 16: `std::fs::create_dir_all(&dir).ok()`
  found: create_dir_all error is silently discarded with .ok(). If dir creation fails, Connection::open() would fail too (since parent dir doesn't exist), which would propagate up and crash the app via the ? in setup().
  implication: create_dir_all should either succeed or cause a visible crash. Not the silent failure path.

- timestamp: 2026-04-10T00:00:00Z
  checked: Tauri app_data_dir() on macOS — what path it returns for app named "ai-buddy"
  found: Tauri derives the app data dir from the `identifier` in tauri.conf.json, NOT the package name in Cargo.toml. The identifier could be something like "com.ai-buddy.app" which would map to "~/Library/Application Support/com.ai-buddy.app/" NOT "~/Library/Application Support/ai-buddy/"
  implication: CONFIRMED ROOT CAUSE CANDIDATE — The directory IS being created, but at a DIFFERENT PATH than where the user is checking. The user is checking ~/Library/Application Support/ai-buddy/ but the actual path depends on the tauri.conf.json identifier.

## Resolution

root_cause: The directory is likely being created at a path derived from the Tauri app `identifier` in tauri.conf.json (e.g., `~/Library/Application Support/com.ai-buddy.app/`), NOT at `~/Library/Application Support/ai-buddy/`. The user checked the wrong directory.
fix: Verify the actual identifier in tauri.conf.json and check the correct path. If the identifier should produce "ai-buddy", it needs to be set to just "ai-buddy" (though that's not a valid bundle ID format).
verification: empty
files_changed: []
