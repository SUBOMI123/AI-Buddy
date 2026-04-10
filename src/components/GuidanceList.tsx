import { For, Show } from "solid-js";
import { Volume2 } from "lucide-solid";
import { playTts } from "../lib/tauri";

interface GuidanceListProps {
  streamingText: string;
  ttsEnabled?: boolean; // D-12, D-13: Play button visible only when true
}

export function GuidanceList(props: GuidanceListProps) {
  let containerRef: HTMLDivElement | undefined;

  const scrollToBottom = () => {
    if (containerRef) {
      const isNearBottom =
        containerRef.scrollHeight - containerRef.scrollTop - containerRef.clientHeight < 40;
      if (isNearBottom) {
        containerRef.scrollTop = containerRef.scrollHeight;
      }
    }
  };

  // Split streaming text into lines, filter empty lines
  const lines = () => {
    scrollToBottom();
    return props.streamingText
      .split("\n")
      .filter((line) => line.trim().length > 0);
  };

  const handlePlay = async (text: string) => {
    try {
      // D-16: stop-before-play handled inside Rust cmd_play_tts
      await playTts(text);
    } catch (err) {
      console.error("TTS playback failed:", err);
      // Silently fail — TTS is optional, not blocking (D-12)
    }
  };

  return (
    <div
      ref={(el) => { containerRef = el; }}
      style={{
        flex: "1",
        "overflow-y": "auto",
        padding: "0",
        display: "flex",
        "flex-direction": "column",
        gap: "var(--space-xs)",
      }}
    >
      <Show when={props.streamingText}>
        <For each={lines()}>
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

              {/* D-13: Play button per item, visible only when ttsEnabled */}
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
                    (e.currentTarget as HTMLButtonElement).style.color = "var(--color-accent)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.color = "var(--color-text-secondary)";
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
