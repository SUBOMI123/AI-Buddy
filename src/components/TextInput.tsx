import { createSignal } from "solid-js";
import { Send } from "lucide-solid";

interface TextInputProps {
  onSubmit: (text: string) => void;
  disabled?: boolean;
  ref?: (el: HTMLInputElement) => void;
}

export function TextInput(props: TextInputProps) {
  const [value, setValue] = createSignal("");

  const handleSubmit = () => {
    const text = value().trim();
    if (text) {
      props.onSubmit(text);
      setValue("");
    }
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
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
        transition: "opacity var(--transition-fast)",
      }}
    >
      <input
        ref={props.ref}
        type="text"
        placeholder="Ask me anything about what's on your screen..."
        value={value()}
        onInput={(e) => setValue(e.currentTarget.value)}
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
      <button
        onClick={handleSubmit}
        disabled={props.disabled || !value().trim()}
        style={{
          display: "flex",
          "align-items": "center",
          "justify-content": "center",
          border: "none",
          background: "transparent",
          cursor: value().trim() ? "pointer" : "default",
          padding: "var(--space-xs)",
          color: value().trim() ? "var(--color-accent)" : "var(--color-text-secondary)",
          opacity: value().trim() ? "1" : "0.5",
          transition: "color var(--transition-fast), opacity var(--transition-fast)",
          "flex-shrink": "0",
        }}
        aria-label="Send message"
      >
        <Send size={24} />
      </button>
    </div>
  );
}
