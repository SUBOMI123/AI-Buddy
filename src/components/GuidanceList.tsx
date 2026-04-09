import { For } from "solid-js";

interface GuidanceListProps {
  steps: string[];
}

export function GuidanceList(props: GuidanceListProps) {
  return (
    <ol
      style={{
        "list-style": "none",
        padding: "0 var(--space-md)",
        display: "flex",
        "flex-direction": "column",
        gap: "var(--space-sm)",
      }}
    >
      <For each={props.steps}>
        {(step, index) => (
          <li
            style={{
              display: "flex",
              gap: "var(--space-sm)",
              "font-size": "var(--font-size-body)",
              "line-height": "var(--line-height-body)",
            }}
          >
            <span
              style={{
                color: "var(--color-text-secondary)",
                "font-weight": "var(--font-weight-regular)",
                "flex-shrink": "0",
                "min-width": "20px",
              }}
            >
              {index() + 1}.
            </span>
            <span style={{ color: "var(--color-text-primary)" }}>{step}</span>
          </li>
        )}
      </For>
    </ol>
  );
}
