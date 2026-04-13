interface TryAnotherWayProps {
  onRetry: () => void;
  disabled?: boolean;
}

export function TryAnotherWay(props: TryAnotherWayProps) {
  return (
    <button
      onClick={() => props.onRetry()}
      aria-label="Try another way"
      disabled={props.disabled}
      style={{
        display: "inline-flex",
        "align-items": "center",
        background: "none",
        border: "none",
        padding: "var(--space-sm) var(--space-md)",
        "font-size": "var(--font-size-label)",
        "font-weight": "var(--font-weight-regular)",
        color: "var(--color-text-secondary)",
        cursor: props.disabled ? "not-allowed" : "pointer",
        transition: "var(--transition-fast)",
        "min-height": "32px",
        opacity: props.disabled ? "0.4" : "1",
      }}
      onMouseEnter={(e) => {
        if (!props.disabled) {
          (e.currentTarget as HTMLButtonElement).style.color = "var(--color-text-primary)";
        }
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.color = "var(--color-text-secondary)";
      }}
    >
      Try another way
    </button>
  );
}
