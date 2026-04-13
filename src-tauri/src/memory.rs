use rusqlite::{Connection, Result as SqlResult, params};
use serde::Serialize;
use std::sync::Mutex;
use tauri::{AppHandle, Manager, State};
use std::time::{SystemTime, UNIX_EPOCH};

pub struct MemoryDb(pub Mutex<Connection>);

/// Open (or create) the memory.db in the Tauri app data directory.
/// Mirrors the prefs_path pattern in preferences.rs (D-07).
pub fn open_db(app: &AppHandle) -> SqlResult<Connection> {
    let dir = app
        .path()
        .app_data_dir()
        .expect("Failed to get app data dir");
    std::fs::create_dir_all(&dir).ok();
    let db_path = dir.join("memory.db");
    let conn = Connection::open(&db_path)?;
    // Restrict file permissions to owner-only on Unix — matches preferences.rs pattern (T-05-04)
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(
            &db_path,
            std::fs::Permissions::from_mode(0o600),
        );
    }
    init_schema(&conn)?;
    Ok(conn)
}

/// Initialise the DB schema. Idempotent — safe to call on every open.
pub fn init_schema(conn: &Connection) -> SqlResult<()> {
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
        CREATE INDEX IF NOT EXISTS idx_interactions_task_label
            ON interactions(task_label);

        CREATE TABLE IF NOT EXISTS task_encounters (
            task_label      TEXT    PRIMARY KEY,
            encounter_count INTEGER NOT NULL DEFAULT 1,
            first_seen      INTEGER NOT NULL,
            last_seen       INTEGER NOT NULL
        );
    ")?;
    Ok(())
}

/// Returns current Unix epoch seconds.
fn now_unix() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64
}

// ---------------------------------------------------------------------------
// Inner SQL helpers — called from both Tauri commands and tests
// ---------------------------------------------------------------------------

/// Look up the encounter count for a task label. Returns 0 if not seen before.
fn get_encounter_count(conn: &Connection, task_label: &str) -> u32 {
    conn.query_row(
        "SELECT encounter_count FROM task_encounters WHERE task_label = ?1",
        params![task_label],
        |row| row.get::<_, u32>(0),
    )
    .unwrap_or(0)
}

/// Map encounter count to guidance tier.
fn encounter_count_to_tier(count: u32) -> u8 {
    match count {
        0 => 1,
        1 => 2,
        _ => 3,
    }
}

/// Write an interaction row and upsert the task_encounters counter.
/// Both operations run inside a single lock scope — caller holds the lock.
fn record_interaction_inner(
    conn: &Connection,
    task_label: &str,
    raw_intent: &str,
    app_context: Option<&str>,
    guidance: &str,
    tier: u8,
) -> SqlResult<()> {
    let ts = now_unix();
    // INSERT interaction — all params bound, never interpolated (T-05-01)
    conn.execute(
        "INSERT INTO interactions (task_label, raw_intent, app_context, guidance, tier, timestamp)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![task_label, raw_intent, app_context, guidance, tier, ts],
    )?;

    // UPSERT task_encounters — increment counter without resetting first_seen (Pitfall 4)
    conn.execute(
        "INSERT INTO task_encounters (task_label, encounter_count, first_seen, last_seen)
         VALUES (?1, 1, ?2, ?2)
         ON CONFLICT(task_label) DO UPDATE SET
           encounter_count = encounter_count + 1,
           last_seen = excluded.last_seen",
        params![task_label, ts],
    )?;

    Ok(())
}

// ---------------------------------------------------------------------------
// Async HTTP helper — classify intent via Worker /classify
// ---------------------------------------------------------------------------

/// Classify raw user intent into a canonical snake_case task label.
///
/// Calls the Worker /classify endpoint with `claude-haiku-4-5`.
/// On any error, falls back to first-3-words fallback to prevent data loss (Pitfall 6).
/// IMPORTANT: Must be called BEFORE acquiring the MemoryDb Mutex (Pitfall 1).
async fn classify_intent(app: &AppHandle, raw_intent: &str) -> String {
    let worker_url =
        option_env!("WORKER_URL").unwrap_or("http://localhost:8787").to_string();

    // Build signed token for auth header — re-use cmd_get_token which signs the installation ID
    let token = crate::preferences::cmd_get_token(app.clone());

    let client = reqwest::Client::new();
    let result = client
        .post(format!("{}/classify", worker_url))
        .header("x-app-token", &token)
        .json(&serde_json::json!({ "intent": raw_intent }))
        .send()
        .await;

    match result {
        Ok(resp) if resp.status().is_success() => {
            match resp.json::<serde_json::Value>().await {
                Ok(body) => {
                    if let Some(label) = body.get("label").and_then(|v| v.as_str()) {
                        let clean = label.trim().to_lowercase();
                        if !clean.is_empty() {
                            return clean;
                        }
                    }
                    intent_fallback_label(raw_intent)
                }
                Err(_) => intent_fallback_label(raw_intent),
            }
        }
        _ => intent_fallback_label(raw_intent),
    }
}

/// Deterministic fallback label: first 3 words lowercased and joined with underscores.
/// e.g. "How do I export this" → "how_do_i"
fn intent_fallback_label(raw_intent: &str) -> String {
    let label: String = raw_intent
        .split_whitespace()
        .take(3)
        .map(|w| {
            w.chars()
                .map(|c| if c.is_alphanumeric() { c.to_lowercase().next().unwrap_or(c) } else { '_' })
                .collect::<String>()
        })
        .collect::<Vec<_>>()
        .join("_");

    // Truncate to 50 chars
    label.chars().take(50).collect()
}

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GuidanceContext {
    pub tier: u8,
    pub task_label: String,
    pub encounter_count: u32,
}

#[derive(Serialize)]
pub struct SkillEntry {
    pub task_label: String,
    pub encounter_count: u32,
}

#[derive(Serialize)]
pub struct SkillProfile {
    pub strengths: Vec<SkillEntry>,
    pub recurring_struggles: Vec<SkillEntry>,
    pub apps_used: Vec<String>,
    pub total_interactions: u32,
}

// ---------------------------------------------------------------------------
// Tauri commands
// ---------------------------------------------------------------------------

/// Called BEFORE streamGuidance to determine guidance tier.
/// Classifies intent (async HTTP), then reads encounter count (brief lock).
#[tauri::command]
pub async fn cmd_prepare_guidance_context(
    app: AppHandle,
    db: State<'_, MemoryDb>,
    raw_intent: String,
) -> Result<GuidanceContext, String> {
    // 1. Classify BEFORE acquiring lock — avoids Mutex held during HTTP (Pitfall 1)
    let task_label = classify_intent(&app, &raw_intent).await;

    // 2. Brief lock to read encounter count
    let count = {
        let conn = db.0.lock().map_err(|e| e.to_string())?;
        get_encounter_count(&conn, &task_label)
    };

    let tier = encounter_count_to_tier(count);
    Ok(GuidanceContext { tier, task_label, encounter_count: count })
}

/// Called AFTER onDone — records the completed interaction.
/// Async because it calls classify_intent (HTTP) before acquiring the lock.
#[tauri::command]
pub async fn cmd_record_interaction(
    _app: AppHandle,
    db: State<'_, MemoryDb>,
    task_label: String,
    raw_intent: String,
    app_context: Option<String>,
    guidance: String,
    tier: u8,
) -> Result<(), String> {
    // Lock once for both INSERT + UPSERT (Pitfall 1: no await inside lock)
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    record_interaction_inner(
        &conn,
        &task_label,
        &raw_intent,
        app_context.as_deref(),
        &guidance,
        tier,
    )
    .map_err(|e| e.to_string())
}

/// Returns a short memory context string for system prompt injection (D-08).
/// Aggregate counts only — no raw guidance text or raw_intent (T-05-03).
/// String stays under ~800 chars / 200 tokens via LIMIT 5 (T-05-05).
#[tauri::command]
pub fn cmd_get_memory_context(db: State<'_, MemoryDb>) -> Result<String, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    build_memory_context_string(&conn).map_err(|e| e.to_string())
}

fn build_memory_context_string(conn: &Connection) -> SqlResult<String> {
    // Tasks with the highest encounter count (completed tasks)
    let mut stmt = conn.prepare(
        "SELECT task_label, encounter_count FROM task_encounters
         ORDER BY encounter_count DESC LIMIT 5",
    )?;
    let completed: Vec<(String, u32)> = stmt
        .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))?
        .filter_map(|r| r.ok())
        .collect();

    // Recurring struggles: encounter_count >= 3 where last tier was 1
    let mut stmt2 = conn.prepare(
        "SELECT te.task_label, te.encounter_count
         FROM task_encounters te
         JOIN interactions i ON i.task_label = te.task_label
         WHERE te.encounter_count >= 3
           AND i.tier = 1
           AND i.id = (SELECT MAX(id) FROM interactions WHERE task_label = te.task_label)
         ORDER BY te.encounter_count DESC LIMIT 5",
    )?;
    let struggles: Vec<(String, u32)> = stmt2
        .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))?
        .filter_map(|r| r.ok())
        .collect();

    if completed.is_empty() && struggles.is_empty() {
        return Ok(String::new());
    }

    let mut parts = Vec::new();

    if !completed.is_empty() {
        let task_list: Vec<String> = completed
            .iter()
            .map(|(label, count)| format!("[{}] {}x", label, count))
            .collect();
        parts.push(format!("Has completed {}.", task_list.join(", ")));
    }

    if !struggles.is_empty() {
        let struggle_list: Vec<String> = struggles
            .iter()
            .map(|(label, count)| format!("[{}] ({} attempts)", label, count))
            .collect();
        parts.push(format!("Recurring struggles: {}.", struggle_list.join(", ")));
    }

    let result = format!("User skill context: {}", parts.join(" "));
    Ok(result)
}

/// Returns derived skill profile for the settings screen (LEARN-03).
#[tauri::command]
pub fn cmd_get_skill_profile(db: State<'_, MemoryDb>) -> Result<SkillProfile, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    build_skill_profile(&conn).map_err(|e| e.to_string())
}

fn build_skill_profile(conn: &Connection) -> SqlResult<SkillProfile> {
    // Strengths: encounter_count >= 3 where most recent interaction had tier = 3
    let mut stmt = conn.prepare(
        "SELECT te.task_label, te.encounter_count
         FROM task_encounters te
         JOIN interactions i ON i.task_label = te.task_label
         WHERE te.encounter_count >= 3
           AND i.tier = 3
           AND i.id = (SELECT MAX(id) FROM interactions WHERE task_label = te.task_label)
         ORDER BY te.encounter_count DESC LIMIT 10",
    )?;
    let strengths: Vec<SkillEntry> = stmt
        .query_map([], |row| {
            Ok(SkillEntry {
                task_label: row.get(0)?,
                encounter_count: row.get(1)?,
            })
        })?
        .filter_map(|r| r.ok())
        .collect();

    // Recurring struggles: encounter_count >= 3 where most recent interaction had tier = 1
    let mut stmt2 = conn.prepare(
        "SELECT te.task_label, te.encounter_count
         FROM task_encounters te
         JOIN interactions i ON i.task_label = te.task_label
         WHERE te.encounter_count >= 3
           AND i.tier = 1
           AND i.id = (SELECT MAX(id) FROM interactions WHERE task_label = te.task_label)
         ORDER BY te.encounter_count DESC LIMIT 10",
    )?;
    let recurring_struggles: Vec<SkillEntry> = stmt2
        .query_map([], |row| {
            Ok(SkillEntry {
                task_label: row.get(0)?,
                encounter_count: row.get(1)?,
            })
        })?
        .filter_map(|r| r.ok())
        .collect();

    // Apps used
    let mut stmt3 = conn.prepare(
        "SELECT DISTINCT app_context FROM interactions WHERE app_context IS NOT NULL",
    )?;
    let apps_used: Vec<String> = stmt3
        .query_map([], |row| row.get(0))?
        .filter_map(|r| r.ok())
        .collect();

    // Total interactions
    let total_interactions: u32 = conn.query_row(
        "SELECT COUNT(*) FROM interactions",
        [],
        |row| row.get(0),
    )?;

    Ok(SkillProfile {
        strengths,
        recurring_struggles,
        apps_used,
        total_interactions,
    })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    fn test_conn() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        init_schema(&conn).unwrap();
        conn
    }

    fn insert_interaction(
        conn: &Connection,
        task_label: &str,
        tier: u8,
    ) {
        record_interaction_inner(
            conn,
            task_label,
            "some raw intent",
            None,
            "some guidance text",
            tier,
        )
        .unwrap();
    }

    // Test: first insert has count == 1
    #[test]
    fn test_first_encounter_count_is_one() {
        let conn = test_conn();
        insert_interaction(&conn, "export_pdf", 1);
        let count = get_encounter_count(&conn, "export_pdf");
        assert_eq!(count, 1, "First encounter should have count == 1");
    }

    // Test: insert same task_label twice → encounter_count == 2
    #[test]
    fn test_encounter_count_increments() {
        let conn = test_conn();
        insert_interaction(&conn, "export_pdf", 1);
        insert_interaction(&conn, "export_pdf", 2);
        let count = get_encounter_count(&conn, "export_pdf");
        assert_eq!(count, 2, "Second encounter should have count == 2");
    }

    // Test: tier == 1 for encounter_count == 0 (new task)
    #[test]
    fn test_tier_selection_new_task() {
        assert_eq!(encounter_count_to_tier(0), 1, "New task should use tier 1");
    }

    // Test: tier == 2 for encounter_count == 1 (second call)
    #[test]
    fn test_tier_selection_second_encounter() {
        assert_eq!(
            encounter_count_to_tier(1),
            2,
            "After 1 encounter, next call should use tier 2"
        );
    }

    // Test: tier == 3 for encounter_count >= 2
    #[test]
    fn test_tier_selection_third_plus_encounter() {
        assert_eq!(encounter_count_to_tier(2), 3, "encounter_count=2 → tier 3");
        assert_eq!(encounter_count_to_tier(5), 3, "encounter_count=5 → tier 3");
    }

    // Test: cmd_get_skill_profile with seeded data returns expected strengths/struggles
    #[test]
    fn test_skill_profile_derivation() {
        let conn = test_conn();

        // Seed a "strength": insert export_pdf 3 times, last tier = 3
        insert_interaction(&conn, "export_pdf", 1);
        insert_interaction(&conn, "export_pdf", 2);
        insert_interaction(&conn, "export_pdf", 3);

        // Seed a "recurring struggle": insert create_pivot_table 3 times, last tier = 1
        insert_interaction(&conn, "create_pivot_table", 1);
        insert_interaction(&conn, "create_pivot_table", 1);
        insert_interaction(&conn, "create_pivot_table", 1);

        let profile = build_skill_profile(&conn).unwrap();

        assert!(
            profile.strengths.iter().any(|e| e.task_label == "export_pdf"),
            "export_pdf should appear in strengths (3 encounters, last tier=3)"
        );
        assert!(
            profile.recurring_struggles.iter().any(|e| e.task_label == "create_pivot_table"),
            "create_pivot_table should appear in recurring_struggles (3 encounters, last tier=1)"
        );
        assert_eq!(profile.total_interactions, 6);
    }

    // Test: memory context string is under 800 chars for 10 seeded tasks
    #[test]
    fn test_memory_context_length_bounded() {
        let conn = test_conn();

        // Seed 10 distinct tasks with varying encounter counts
        for i in 0..10 {
            let label = format!("task_label_{}", i);
            for _ in 0..((i % 4) + 1) {
                insert_interaction(&conn, &label, 1);
            }
        }

        let ctx = build_memory_context_string(&conn).unwrap();
        assert!(
            ctx.len() <= 800,
            "Memory context string must be <= 800 chars, got {}",
            ctx.len()
        );
    }

    // Test: insert two different tasks — encounter counts are independent
    #[test]
    fn test_different_tasks_independent_counts() {
        let conn = test_conn();
        insert_interaction(&conn, "export_pdf", 1);
        insert_interaction(&conn, "insert_table", 1);
        insert_interaction(&conn, "export_pdf", 2);

        assert_eq!(get_encounter_count(&conn, "export_pdf"), 2);
        assert_eq!(get_encounter_count(&conn, "insert_table"), 1);
    }

    // Test: intent_fallback_label produces correct output
    #[test]
    fn test_intent_fallback_label() {
        assert_eq!(intent_fallback_label("How do I export"), "how_do_i");
        assert_eq!(intent_fallback_label("export PDF now"), "export_pdf_now");
        // Single word
        assert_eq!(intent_fallback_label("resize"), "resize");
    }
}
