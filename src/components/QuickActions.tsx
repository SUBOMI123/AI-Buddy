import { For } from "solid-js";
import { QUICK_PRESETS } from "../lib/quickActionPresets";

interface QuickActionsProps {
  onAction: (preset: string) => void;
  onAsk: () => void;
  disabled?: boolean;
}

export function QuickActions(props: QuickActionsProps) {
  const buttons = [
    { label: "Fix",      action: () => props.onAction(QUICK_PRESETS["Fix"]) },
    { label: "Explain",  action: () => props.onAction(QUICK_PRESETS["Explain"]) },
    { label: "Optimize", action: () => props.onAction(QUICK_PRESETS["Optimize"]) },
    { label: "Ask",      action: () => props.onAsk() },
  ];

  return (
    <div
      role="group"
      aria-label="Quick actions"
      aria-busy={props.disabled ? "true" : undefined}
      style={{
        display: "grid",
        "grid-template-columns": "1fr 1fr",
        gap: "var(--space-sm)",
        padding: "var(--space-lg) var(--space-md)",
        opacity: props.disabled ? "0.5" : "1",
        "pointer-events": props.disabled ? "none" : "auto",
        cursor: props.disabled ? "not-allowed" : "auto",
      }}
    >
      <For each={buttons}>
        {(btn, index) => (
          <button
            aria-label={btn.label}
            aria-disabled={props.disabled ? "true" : undefined}
            onClick={btn.action}
            style={{
              "min-height": "44px",
              "border-radius": "var(--radius-md)",
              padding: "var(--space-sm) var(--space-md)",
              border: index() === 3
                ? "1px solid color-mix(in srgb, var(--color-accent) 40%, transparent)"
                : "1px solid var(--color-border)",
              background: "var(--color-surface-secondary)",
              "font-size": "var(--font-size-body)",
              "font-weight": "var(--font-weight-regular)",
              color: "var(--color-text-primary)",
              cursor: "pointer",
              transition: "var(--transition-fast)",
              "text-align": "center",
              width: "100%",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.filter = "brightness(1.15)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.filter = "";
            }}
          >
            {btn.label}
          </button>
        )}
      </For>
    </div>
  );
}
