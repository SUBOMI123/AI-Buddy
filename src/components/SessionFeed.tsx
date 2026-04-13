import { For, Show } from "solid-js";
import { Volume2 } from "lucide-solid";
import { playTts } from "../lib/tauri";

export interface SessionExchange {
  intent: string;   // user's raw text for this turn
  guidance: string; // complete guidance text (set after onDone fires)
}

interface SessionFeedProps {
  sessionHistory: SessionExchange[];      // prior completed exchanges
  streamingText: string;                  // active (current) exchange in progress
  ttsEnabled?: boolean;                   // show TTS play buttons
  ref?: (el: HTMLDivElement) => void;     // parent needs ref for auto-scroll
}

export function SessionFeed(props: SessionFeedProps) {
  const handlePlay = async (text: string) => {
    try {
      // D-16: stop-before-play handled inside Rust cmd_play_tts
      await playTts(text);
    } catch (err) {
      console.error("TTS playback failed:", err);
      // Silently fail — TTS is optional, not blocking
    }
  };

  return (
    <div
      ref={props.ref}
      aria-label="Conversation history"
      style={{
        display: "flex",
        "flex-direction": "column",
        gap: "var(--space-sm)",
      }}
    >
      {/* Prior exchanges — rendered in secondary color with intent labels (D-03, D-04) */}
      <For each={props.sessionHistory}>
        {(exchange) => (
          <div style={{ padding: "var(--space-xs) 0" }}>
            {/* User intent label — secondary color, label size (D-04) */}
            <p
              style={{
                "font-family": "inherit",
                "font-size": "var(--font-size-label)",
                "font-weight": "var(--font-weight-regular)",
                "line-height": "var(--line-height-label)",
                color: "var(--color-text-secondary)",
                "padding-bottom": "var(--space-xs)",
                margin: "0",
              }}
            >
              {exchange.intent}
            </p>
            {/* Guidance lines — secondary color (D-04), no TTS on prior exchanges */}
            <For
              each={exchange.guidance
                .split("\n")
                .filter((line) => line.trim().length > 0)}
            >
              {(line) => (
                <p
                  style={{
                    "font-family": "inherit",
                    "font-size": "var(--font-size-body)",
                    "font-weight": "var(--font-weight-regular)",
                    "line-height": "var(--line-height-body)",
                    color: "var(--color-text-secondary)",
                    margin: "0",
                    "white-space": "pre-wrap",
                    "word-wrap": "break-word",
                  }}
                >
                  {line}
                </p>
              )}
            </For>
          </div>
        )}
      </For>

      {/* Active exchange — primary color, no intent label (TaskHeaderStrip shows it), with optional TTS */}
      <Show when={props.streamingText.length > 0}>
        <For
          each={props.streamingText
            .split("\n")
            .filter((line) => line.trim().length > 0)}
        >
          {(line) => (
            <div
              style={{
                display: "flex",
                "align-items": "flex-start",
                gap: "var(--space-sm)",
                padding: "var(--space-xs) 0",
              }}
            >
              <p
                style={{
                  "font-family": "inherit",
                  "font-size": "var(--font-size-body)",
                  "font-weight": "var(--font-weight-regular)",
                  "line-height": "var(--line-height-body)",
                  color: "var(--color-text-primary)",
                  "white-space": "pre-wrap",
                  "word-wrap": "break-word",
                  margin: "0",
                  flex: "1",
                }}
              >
                {line}
              </p>

              {/* TTS play button — visible only when ttsEnabled */}
              <Show when={props.ttsEnabled}>
                <button
                  onClick={() => handlePlay(line)}
                  title="Read aloud"
                  aria-label={`Read aloud: ${line}`}
                  style={{
                    display: "flex",
                    "align-items": "center",
                    "justify-content": "center",
                    border: "none",
                    background: "transparent",
                    cursor: "pointer",
                    padding: "var(--space-xs)",
                    color: "var(--color-text-secondary)",
                    "flex-shrink": "0",
                    "min-height": "44px",
                    "min-width": "36px",
                    "border-radius": "var(--radius-sm)",
                    transition: "color var(--transition-fast)",
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.color =
                      "var(--color-accent)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.color =
                      "var(--color-text-secondary)";
                  }}
                >
                  <Volume2 size={16} />
                </button>
              </Show>
            </div>
          )}
        </For>
      </Show>
    </div>
  );
}
