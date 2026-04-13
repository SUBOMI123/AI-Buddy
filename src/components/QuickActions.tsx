import { For } from "solid-js";
import { QUICK_PRESETS } from "../lib/quickActionPresets";

interface QuickActionsProps {
  onAction: (preset: string) => void;
  onAsk: () => void;
  disabled?: boolean;
  hasRegion?: boolean;
}

export function QuickActions(props: QuickActionsProps) {
  const buttons = [
    { label: "Fix issue",      ariaLabel: "Fix issue",      action: () => props.onAction(QUICK_PRESETS["Fix"]) },
    { label: "Explain this",   ariaLabel: "Explain this",   action: () => props.onAction(QUICK_PRESETS["Explain"]) },
    { label: "Improve this",   ariaLabel: "Improve this",   action: () => props.onAction(QUICK_PRESETS["Optimize"]) },
    { label: "Ask about this", ariaLabel: "Ask about this", action: () => props.onAsk() },
  ];

  return (
    <div style={{ display: "flex", "flex-direction": "column" }}>
      {/* Context label / region indicator */}
      <div
        style={{
          display: "flex",
          "align-items": "center",
          gap: "var(--space-xs)",
          padding: "0 var(--space-md)",
          "margin-bottom": "var(--space-xs)",
        }}
      >
        {props.hasRegion && (
          <span
            style={{
              width: "6px",
              height: "6px",
              "border-radius": "50%",
              background: "var(--color-accent)",
              "flex-shrink": "0",
            }}
          />
        )}
        <span
          style={{
            "font-size": "var(--font-size-label)",
            color: "var(--color-text-secondary)",
          }}
        >
          {props.hasRegion ? "Region selected" : "What do you want to do?"}
        </span>
      </div>

      {/* Button grid */}
      <div
        role="group"
        aria-label="Quick actions"
        aria-busy={props.disabled ? "true" : undefined}
        style={{
          display: "grid",
          "grid-template-columns": "1fr 1fr",
          gap: "var(--space-sm)",
          padding: "calc(var(--space-lg) * 0.85) var(--space-md)",
          opacity: props.disabled ? "0.5" : "1",
          "pointer-events": props.disabled ? "none" : "auto",
          cursor: props.disabled ? "not-allowed" : "auto",
        }}
      >
        <For each={buttons}>
          {(btn, index) => (
            <button
              aria-label={btn.ariaLabel}
              aria-disabled={props.disabled ? "true" : undefined}
              onClick={btn.action}
              style={{
                "min-height": "44px",
                "border-radius": "var(--radius-md)",
                padding: "var(--space-xs) var(--space-md)",
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
    </div>
  );
}
