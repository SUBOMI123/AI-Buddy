import { createSignal, onMount, Show, For } from "solid-js";
import { getSkillProfile, type SkillProfile } from "../lib/tauri";

interface SettingsScreenProps {
  onClose: () => void;
}

export function SettingsScreen(props: SettingsScreenProps) {
  const [profile, setProfile] = createSignal<SkillProfile | null>(null);
  const [loading, setLoading] = createSignal(true);
  const [error, setError] = createSignal("");

  onMount(async () => {
    try {
      const data = await getSkillProfile();
      setProfile(data);
    } catch (e) {
      setError("Couldn't load your skill profile.");
    } finally {
      setLoading(false);
    }
  });

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
