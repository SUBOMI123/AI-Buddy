import { createSignal, onMount, Show, For } from "solid-js";
import { getSkillProfile, getPttKey, updatePttShortcut, type SkillProfile } from "../lib/tauri";

interface SettingsScreenProps {
  onClose: () => void;
  ttsEnabled: boolean;
  onTtsChange: (val: boolean) => void;
}

export function SettingsScreen(props: SettingsScreenProps) {
  const [profile, setProfile] = createSignal<SkillProfile | null>(null);
  const [loading, setLoading] = createSignal(true);
  const [error, setError] = createSignal("");

  const [pttKey, setPttKeyLocal] = createSignal("");
  const [pttSaveError, setPttSaveError] = createSignal("");
  const [pttSaving, setPttSaving] = createSignal(false);

  onMount(async () => {
    // Load PTT key
    try {
      const key = await getPttKey();
      setPttKeyLocal(key);
    } catch {
      // Leave empty — will show placeholder
    }

    try {
      const data = await getSkillProfile();
      setProfile(data);
    } catch (e) {
      setError("Couldn't load your skill profile.");
    } finally {
      setLoading(false);
    }
  });

  const handlePttSave = async () => {
    const key = pttKey().trim();
    if (!key) return;
    setPttSaving(true);
    setPttSaveError("");
    try {
      await updatePttShortcut(key);
      setPttSaveError("");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setPttSaveError(msg || "Invalid key format");
    } finally {
      setPttSaving(false);
    }
  };

  return (
    <div style={{
      display: "flex",
      "flex-direction": "column",
      flex: "1",
      height: "100%",
      overflow: "hidden",
    }}>
      {/* Header row */}
      <div style={{
        display: "flex",
        "align-items": "center",
        "justify-content": "space-between",
        padding: "var(--space-sm) 0",
        "border-bottom": "1px solid var(--color-border)",
        "margin-bottom": "var(--space-md)",
      }}>
        <span style={{
          "font-size": "var(--font-size-body)",
          "font-weight": "var(--font-weight-medium)",
          color: "var(--color-text-primary)",
        }}>Your Skill Profile</span>
        <button
          onClick={props.onClose}
          style={{
            border: "none",
            background: "transparent",
            color: "var(--color-accent)",
            "font-size": "var(--font-size-label)",
            cursor: "pointer",
            padding: "var(--space-sm) 0",
            "min-height": "44px",
          }}
        >Done</button>
      </div>

      {/* Scrollable content */}
      <div style={{ "overflow-y": "auto", flex: "1" }}>
        {/* Voice section — always visible, independent of skill profile load */}
        <section style={{ "margin-bottom": "var(--space-lg)" }}>
          <h3 style={{
            "font-size": "var(--font-size-label)",
            "font-weight": "var(--font-weight-medium)",
            color: "var(--color-text-secondary)",
            "text-transform": "uppercase",
            "letter-spacing": "0.05em",
            "margin-bottom": "var(--space-sm)",
          }}>Voice</h3>

          {/* TTS auto-play row */}
          <div style={{
            display: "flex",
            "align-items": "center",
            "justify-content": "space-between",
            padding: "var(--space-xs) 0",
            "margin-bottom": "var(--space-xs)",
          }}>
            <span style={{ "font-size": "var(--font-size-body)", color: "var(--color-text-primary)" }}>
              Auto-play guidance
            </span>
            <input
              type="checkbox"
              checked={props.ttsEnabled}
              onChange={(e) => props.onTtsChange(e.currentTarget.checked)}
              style={{ cursor: "pointer", "flex-shrink": "0" }}
              aria-label="Enable TTS auto-play"
            />
          </div>

          {/* PTT key row */}
          <div style={{
            display: "flex",
            "flex-direction": "column",
            gap: "var(--space-xs)",
            padding: "var(--space-xs) 0",
          }}>
            <span style={{ "font-size": "var(--font-size-body)", color: "var(--color-text-primary)" }}>
              Push-to-talk key
            </span>
            <input
              type="text"
              value={pttKey()}
              onInput={(e) => setPttKeyLocal(e.currentTarget.value)}
              onBlur={handlePttSave}
              onKeyDown={(e) => { if (e.key === "Enter") { e.currentTarget.blur(); } }}
              placeholder="e.g. CommandOrControl+Shift+V"
              disabled={pttSaving()}
              style={{
                "font-size": "var(--font-size-label)",
                color: "var(--color-text-primary)",
                background: "var(--color-surface)",
                border: `1px solid ${pttSaveError() ? "var(--color-accent)" : "var(--color-border)"}`,
                "border-radius": "var(--radius-sm)",
                padding: "var(--space-xs) var(--space-sm)",
                width: "100%",
                "box-sizing": "border-box",
              }}
              aria-label="Push-to-talk key binding"
            />
            <Show when={pttSaveError().length > 0}>
              <span style={{ "font-size": "var(--font-size-label)", color: "var(--color-accent)" }}>
                {pttSaveError()}
              </span>
            </Show>
            <Show when={pttSaving()}>
              <span style={{ "font-size": "var(--font-size-label)", color: "var(--color-text-secondary)" }}>
                Saving...
              </span>
            </Show>
          </div>
        </section>

        <Show when={loading()}>
          <p style={{ color: "var(--color-text-secondary)", "font-size": "var(--font-size-label)" }}>
            Loading...
          </p>
        </Show>

        <Show when={error().length > 0}>
          <p style={{ color: "var(--color-text-secondary)", "font-size": "var(--font-size-label)" }}>
            {error()}
          </p>
        </Show>

        <Show when={!loading() && !error() && profile() !== null}>
          {/* Strengths section */}
          <section style={{ "margin-bottom": "var(--space-lg)" }}>
            <h3 style={{
              "font-size": "var(--font-size-label)",
              "font-weight": "var(--font-weight-medium)",
              color: "var(--color-text-secondary)",
              "text-transform": "uppercase",
              "letter-spacing": "0.05em",
              "margin-bottom": "var(--space-sm)",
            }}>Things you've mastered</h3>
            <Show when={profile()!.strengths.length === 0}>
              <p style={{ "font-size": "var(--font-size-body)", color: "var(--color-text-secondary)" }}>
                None yet — keep using AI Buddy!
              </p>
            </Show>
            <For each={profile()!.strengths}>
              {(entry) => (
                <div style={{
                  "font-size": "var(--font-size-body)",
                  color: "var(--color-text-primary)",
                  padding: "var(--space-xs) 0",
                  display: "flex",
                  "justify-content": "space-between",
                }}>
                  <span>{entry.task_label.replace(/_/g, " ")}</span>
                  <span style={{ color: "var(--color-text-secondary)" }}>{entry.encounter_count}x</span>
                </div>
              )}
            </For>
          </section>

          {/* Recurring struggles section */}
          <section style={{ "margin-bottom": "var(--space-lg)" }}>
            <h3 style={{
              "font-size": "var(--font-size-label)",
              "font-weight": "var(--font-weight-medium)",
              color: "var(--color-text-secondary)",
              "text-transform": "uppercase",
              "letter-spacing": "0.05em",
              "margin-bottom": "var(--space-sm)",
            }}>Areas you're still learning</h3>
            <Show when={profile()!.recurring_struggles.length === 0}>
              <p style={{ "font-size": "var(--font-size-body)", color: "var(--color-text-secondary)" }}>
                None — you're doing great!
              </p>
            </Show>
            <For each={profile()!.recurring_struggles}>
              {(entry) => (
                <div style={{
                  "font-size": "var(--font-size-body)",
                  color: "var(--color-text-primary)",
                  padding: "var(--space-xs) 0",
                  display: "flex",
                  "justify-content": "space-between",
                }}>
                  <span>{entry.task_label.replace(/_/g, " ")}</span>
                  <span style={{ color: "var(--color-text-secondary)" }}>{entry.encounter_count}x</span>
                </div>
              )}
            </For>
          </section>

          {/* Apps used */}
          <Show when={profile()!.apps_used.length > 0}>
            <section style={{ "margin-bottom": "var(--space-lg)" }}>
              <h3 style={{
                "font-size": "var(--font-size-label)",
                "font-weight": "var(--font-weight-medium)",
                color: "var(--color-text-secondary)",
                "text-transform": "uppercase",
                "letter-spacing": "0.05em",
                "margin-bottom": "var(--space-sm)",
              }}>Apps you've used AI Buddy with</h3>
              <p style={{ "font-size": "var(--font-size-body)", color: "var(--color-text-primary)" }}>
                {profile()!.apps_used.join(", ")}
              </p>
            </section>
          </Show>

          {/* Footer — total interactions */}
          <p style={{
            "font-size": "var(--font-size-label)",
            color: "var(--color-text-secondary)",
            "border-top": "1px solid var(--color-border)",
            "padding-top": "var(--space-sm)",
          }}>
            {profile()!.total_interactions} interaction{profile()!.total_interactions !== 1 ? "s" : ""} recorded locally
          </p>
        </Show>
      </div>
    </div>
  );
}
