import { Accessor, Setter } from "solid-js";
import { Crop, Mic, Send } from "lucide-solid";

interface TextInputProps {
  value: Accessor<string>;
  setValue: Setter<string>;
  onSubmit: (text: string) => void;
  disabled?: boolean;
  listening?: boolean;   // D-08: true when PTT is active
  sttError?: string;     // D-24: inline error message near input
  ref?: (el: HTMLInputElement) => void;
  onRegionSelect?: () => void;  // called when Crop button is clicked (D-01)
  regionActive?: boolean;       // true when a region is locked in (drives icon color)
}

export function TextInput(props: TextInputProps) {
  const handleSubmit = () => {
    const text = props.value().trim();
    if (text) {
      props.onSubmit(text);
      props.setValue("");
    }
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSubmit();
    }
  };

  // D-08: Listening indicator styles — pulsing border ring when PTT is active
  const boxShadow = () => props.listening
    ? "0 0 0 2px var(--color-accent)"
    : "none";

  const animation = () => props.listening ? "ptt-pulse 1.2s ease-in-out infinite" : "none";

  return (
    <div style={{ display: "flex", "flex-direction": "column", gap: "var(--space-xs)" }}>
      {/* D-24, D-25: STT error shown inline — field text preserved, not cleared */}
      {props.sttError && (
        <p
          style={{
            "font-size": "var(--font-size-label)",
            color: "var(--color-text-secondary)",
            margin: "0",
            padding: "0 var(--space-xs)",
          }}
          aria-live="polite"
        >
          {props.sttError}
        </p>
      )}

      <style>{`
        @keyframes ptt-pulse {
          0%, 100% { box-shadow: 0 0 0 2px var(--color-accent); }
          50% { box-shadow: 0 0 0 4px var(--color-accent); opacity: 0.7; }
        }
      `}</style>

      <div
        style={{
          display: "flex",
          "align-items": "center",
          gap: "var(--space-sm)",
          background: "var(--color-surface-secondary)",
          "border-radius": "var(--radius-md)",
          padding: "var(--space-sm) var(--space-md)",
          "min-height": "44px",
          opacity: props.disabled ? "0.5" : "1",
          "pointer-events": props.disabled ? "none" : "auto",
          transition: "opacity var(--transition-fast), box-shadow var(--transition-fast)",
          "box-shadow": boxShadow(),
          animation: animation(),
        }}
      >
        {/* D-08: Mic icon visible during PTT listening state */}
        {props.listening && (
          <Mic
            size={16}
            style={{
              color: "var(--color-accent)",
              "flex-shrink": "0",
              animation: "none",
            }}
            aria-label="Listening..."
          />
        )}

        <input
          ref={props.ref}
          type="text"
          placeholder={props.listening ? "Listening..." : "Or type your own task..."}
          value={props.value()}
          onInput={(e) => props.setValue(e.currentTarget.value)}
          onKeyDown={handleKeyDown}
          disabled={props.disabled}
          style={{
            flex: "1",
            border: "none",
            outline: "none",
            background: "transparent",
            color: "var(--color-text-primary)",
            "font-size": "var(--font-size-body)",
            "font-weight": "var(--font-weight-regular)",
            "line-height": "var(--line-height-body)",
            "font-family": "inherit",
          }}
        />

        {/* D-01: Region select button — left of Send, always visible when not disabled */}
        {props.onRegionSelect && (
          <button
            onClick={props.onRegionSelect}
            title="Select screen region"
            aria-label="Select screen region"
            aria-pressed={props.regionActive ? "true" : "false"}
            disabled={props.disabled}
            style={{
              display: "flex",
              "align-items": "center",
              "justify-content": "center",
              border: "none",
              background: "transparent",
              cursor: "pointer",
              padding: "var(--space-xs)",
              // UI-SPEC: active = accent, idle = text-secondary
              color: props.regionActive
                ? "var(--color-accent)"
                : "var(--color-text-secondary)",
              "min-height": "44px",
              "min-width": "44px",
              "flex-shrink": "0",
              transition: "color var(--transition-fast)",
            }}
          >
            <Crop size={16} />
          </button>
        )}

        <button
          onClick={handleSubmit}
          disabled={props.disabled || !props.value().trim()}
          style={{
            display: "flex",
            "align-items": "center",
            "justify-content": "center",
            border: "none",
            background: "transparent",
            cursor: props.value().trim() ? "pointer" : "default",
            padding: "var(--space-xs)",
            color: props.value().trim() ? "var(--color-accent)" : "var(--color-text-secondary)",
            opacity: props.value().trim() ? "1" : "0.5",
            transition: "color var(--transition-fast), opacity var(--transition-fast)",
            "flex-shrink": "0",
          }}
          aria-label="Send message"
        >
          <Send size={24} />
        </button>
      </div>
    </div>
  );
}
