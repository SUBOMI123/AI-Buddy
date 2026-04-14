import { Show } from "solid-js";

interface QuotaBannerProps {
  remaining: number;
  limit: number;
  onUpgrade: () => void;
  onDismiss: () => void;
}

export function QuotaBanner(props: QuotaBannerProps) {
  return (
    <Show when={props.remaining <= 2}>
      <div style={{
        display: "flex",
        "flex-direction": "row",
        "align-items": "center",
        background: "#fef3c7",
        padding: "8px 12px",
        "border-radius": "6px",
        gap: "8px",
        "font-size": "13px",
        "margin-bottom": "8px",
      }}>
        <span style={{
          flex: "1",
          color: "#92400e",
        }}>
          {props.remaining} AI request{props.remaining === 1 ? "" : "s"} left today
        </span>
        <button
          onClick={props.onUpgrade}
          style={{
            background: "#d97706",
            color: "white",
            border: "none",
            "border-radius": "4px",
            padding: "4px 10px",
            cursor: "pointer",
            "font-size": "12px",
            "font-weight": "600",
          }}
        >
          Upgrade
        </button>
        <button
          onClick={props.onDismiss}
          aria-label="Dismiss"
          style={{
            background: "none",
            border: "none",
            color: "#92400e",
            cursor: "pointer",
            "font-size": "14px",
            padding: "0 2px",
          }}
        >
          ✕
        </button>
      </div>
    </Show>
  );
}
