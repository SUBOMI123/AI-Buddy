import { createSignal, createEffect, onCleanup, onMount, Show, For } from "solid-js";
import { getSkillProfile, getPttKey, updatePttShortcut, type SkillProfile } from "../lib/tauri";

interface SettingsScreenProps {
  onClose: () => void;
  ttsEnabled: boolean;
  onTtsChange: (val: boolean) => void;
}

/** Convert Tauri accelerator string to human-readable symbols.
 *  "CommandOrControl+Shift+V" → "⌘⇧V"
 */
function tauriToDisplay(key: string): string {
  const symbolMap: Record<string, string> = {
    "CommandOrControl": "⌘",
    "Command": "⌘",
    "Control": "⌃",
    "Ctrl": "⌃",
    "Shift": "⇧",
    "Alt": "⌥",
    "Option": "⌥",
  };
  return key
    .split("+")
    .map((part) => symbolMap[part] ?? part)
    .join("");
}

/** Build a Tauri accelerator string from a KeyboardEvent. Returns null if only modifiers pressed. */
function eventToTauri(e: KeyboardEvent): string | null {
  if (["Meta", "Control", "Shift", "Alt"].includes(e.key)) return null;

  const parts: string[] = [];
  if (e.metaKey || e.ctrlKey) parts.push("CommandOrControl");
  if (e.altKey) parts.push("Alt");
  if (e.shiftKey) parts.push("Shift");

  let keyName: string;
  if (e.code.startsWith("Key")) {
    keyName = e.code.slice(3); // KeyB → B
  } else if (e.code.startsWith("Digit")) {
    keyName = e.code.slice(5); // Digit1 → 1
  } else {
    keyName = e.key; // F1, Space, Tab, Backspace, etc.
  }

  parts.push(keyName);
  return parts.join("+");
}

export function SettingsScreen(props: SettingsScreenProps) {
  const [profile, setProfile] = createSignal<SkillProfile | null>(null);
  const [loading, setLoading] = createSignal(true);
  const [error, setError] = createSignal("");

  const [pttKey, setPttKeyLocal] = createSignal(""); // Tauri format, e.g. "CommandOrControl+Shift+V"
  const [pttDisplay, setPttDisplay] = createSignal(""); // Symbol format, e.g. "⌘⇧V"
  const [pttSaveError, setPttSaveError] = createSignal("");
  const [pttSaving, setPttSaving] = createSignal(false);
  const [pttListening, setPttListening] = createSignal(false);

  let captureRef: HTMLButtonElement | undefined;

  // Global keydown listener — active only while in listening mode.
  // Window-level capture is more reliable than button onKeyDown in Tauri WebView.
  createEffect(() => {
    if (!pttListening()) return;

    const handler = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      if (e.key === "Escape") {
        setPttListening(false);
        return;
      }

      const tauriKey = eventToTauri(e);
      if (!tauriKey) return; // standalone modifier — keep listening

      setPttListening(false);
      handlePttSave(tauriKey);
    };

    window.addEventListener("keydown", handler, true); // capture phase
    onCleanup(() => window.removeEventListener("keydown", handler, true));
  });

  onMount(async () => {
    try {
      const key = await getPttKey();
      setPttKeyLocal(key);
      setPttDisplay(tauriToDisplay(key));
    } catch {
      // Leave empty — will show placeholder
    }

    try {
      const data = await getSkillProfile();
      setProfile(data);
    } catch {
      setError("Couldn't load your skill profile.");
    } finally {
      setLoading(false);
    }
  });

  const handlePttSave = async (tauriKey: string) => {
    if (!tauriKey) return;
    setPttSaving(true);
    setPttSaveError("");
    try {
      await updatePttShortcut(tauriKey);
      setPttKeyLocal(tauriKey);
      setPttDisplay(tauriToDisplay(tauriKey));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setPttSaveError(msg || "Failed to register shortcut");
      // Revert display to last saved key
      setPttDisplay(tauriToDisplay(pttKey()));
    } finally {
      setPttSaving(false);
    }
  };

  const handleStartListening = () => {
    setPttListening(true);
    setPttSaveError("");
    captureRef?.focus();
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

          {/* PTT key row — key capture */}
          <div style={{
            display: "flex",
            "flex-direction": "column",
            gap: "var(--space-xs)",
            padding: "var(--space-xs) 0",
          }}>
            <span style={{ "font-size": "var(--font-size-body)", color: "var(--color-text-primary)" }}>
              Push-to-talk key
            </span>

            {/* Key capture button */}
            <button
              ref={captureRef}
              onClick={handleStartListening}
              onBlur={() => setPttListening(false)}
              disabled={pttSaving()}
              style={{
                display: "flex",
                "align-items": "center",
                "justify-content": "space-between",
                "font-size": "var(--font-size-label)",
                color: pttListening() ? "var(--color-text-secondary)" : "var(--color-text-primary)",
                background: "var(--color-surface)",
                border: `1px solid ${pttSaveError() ? "var(--color-accent)" : pttListening() ? "var(--color-accent)" : "var(--color-border)"}`,
                "border-radius": "var(--radius-sm)",
                padding: "var(--space-xs) var(--space-sm)",
                width: "100%",
                "box-sizing": "border-box",
                cursor: pttSaving() ? "not-allowed" : "pointer",
                "min-height": "44px",
                "text-align": "left",
              }}
              aria-label="Click to set push-to-talk key"
            >
              <span>
                {pttListening()
                  ? "Press your shortcut…"
                  : pttDisplay() || "Click to set shortcut"}
              </span>
              <Show when={!pttListening() && pttDisplay()}>
                <span style={{
                  "font-size": "var(--font-size-label)",
                  color: "var(--color-text-secondary)",
                  "margin-left": "var(--space-sm)",
                  "flex-shrink": "0",
                }}>click to change</span>
              </Show>
            </button>

            <Show when={pttSaveError().length > 0}>
              <span style={{ "font-size": "var(--font-size-label)", color: "var(--color-accent)" }}>
                {pttSaveError()}
              </span>
            </Show>
            <Show when={pttSaving()}>
              <span style={{ "font-size": "var(--font-size-label)", color: "var(--color-text-secondary)" }}>
                Registering…
              </span>
            </Show>
            <Show when={pttListening()}>
              <span style={{ "font-size": "var(--font-size-label)", color: "var(--color-text-secondary)" }}>
                Press Escape to cancel
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
