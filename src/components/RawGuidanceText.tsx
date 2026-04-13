import { For } from "solid-js";

interface RawGuidanceTextProps {
  text: string;  // guidance text when parseSteps() returned []
}

/**
 * D-06a: Fallback renderer when step parsing fails (Claude emits non-compliant format).
 * Renders guidance as flat paragraph lines — identical visual treatment to
 * SessionFeed's active exchange rendering (body 14px / 400 / 1.5 / primary color).
 *
 * No label, no caption — just the raw guidance lines. (UI-SPEC Copywriting Contract)
 */
export function RawGuidanceText(props: RawGuidanceTextProps) {
  return (
    <div style={{ display: "flex", "flex-direction": "column", gap: "var(--space-sm)" }}>
      <For
        each={props.text
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
              color: "var(--color-text-primary)",
              "white-space": "pre-wrap",
              "word-wrap": "break-word",
              margin: "0",
            }}
          >
            {line}
          </p>
        )}
      </For>
    </div>
  );
}
