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
    { label: "Fix issue",    ariaLabel: "Fix issue",    action: () => props.onAction(QUICK_PRESETS["Fix"]) },
    { label: "Explain this", ariaLabel: "Explain this", action: () => props.onAction(QUICK_PRESETS["Explain"]) },
    { label: "Improve this", ariaLabel: "Improve this", action: () => props.onAction(QUICK_PRESETS["Optimize"]) },
    { label: "Ask",          ariaLabel: "Ask",          action: () => props.onAsk() },
  ];

  return (
    <div style={{ display: "flex", "flex-direction": "column" }}>
      {/* Context label — always shown */}
      <div style={{ padding: "0 var(--space-md)", "margin-bottom": "var(--space-xs)" }}>
        <span
          style={{
            "font-size": "var(--font-size-label)",
            color: "var(--color-text-secondary)",
          }}
        >
          What should I do with this?
        </span>
      </div>

      {/* Selection active indicator — only when region is selected */}
      {props.hasRegion && (
        <div
          style={{
            display: "flex",
            "align-items": "center",
            gap: "var(--space-xs)",
            padding: "0 var(--space-md)",
            "margin-bottom": "var(--space-xs)",
          }}
        >
          <span
            style={{
              width: "6px",
              height: "6px",
              "border-radius": "50%",
              background: "var(--color-accent)",
              "flex-shrink": "0",
            }}
          />
          <span
            style={{
              "font-size": "var(--font-size-label)",
              color: "var(--color-accent)",
            }}
          >
            Selection active
          </span>
        </div>
      )}

      {/* Button grid */}
      <div
        role="group"
        aria-label="Quick actions"
        aria-busy={props.disabled ? "true" : undefined}
        style={{
          display: "grid",
          "grid-template-columns": "1fr 1fr",
          gap: "calc(var(--space-sm) * 0.9)",
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
                transition: "filter 100ms ease, transform 100ms ease",
                "text-align": "center",
                width: "100%",
              }}
              onMouseEnter={(e) => {
                const el = e.currentTarget as HTMLButtonElement;
                el.style.filter = "brightness(1.15)";
                el.style.transform = "scale(1.02)";
              }}
              onMouseLeave={(e) => {
                const el = e.currentTarget as HTMLButtonElement;
                el.style.filter = "";
                el.style.transform = "";
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
