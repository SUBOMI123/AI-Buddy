import { MessageCircle } from "lucide-solid";

export function EmptyState() {
  return (
    <div
      style={{
        display: "flex",
        "flex-direction": "column",
        "align-items": "center",
        "justify-content": "center",
        "text-align": "center",
        gap: "var(--space-sm)",
        flex: "1",
        padding: "var(--space-lg)",
      }}
    >
      <MessageCircle
        size={48}
        color="var(--color-text-secondary)"
        style={{ opacity: "0.5" }}
      />
      <h2
        style={{
          "font-size": "var(--font-size-heading)",
          "font-weight": "var(--font-weight-semibold)",
          "line-height": "var(--line-height-heading)",
          color: "var(--color-text-primary)",
        }}
      >
        Ready to help
      </h2>
      <p
        style={{
          "font-size": "var(--font-size-body)",
          "font-weight": "var(--font-weight-regular)",
          "line-height": "var(--line-height-body)",
          color: "var(--color-text-secondary)",
        }}
      >
        Ask me anything about what's on your screen. I'll guide you step by step.
      </p>
    </div>
  );
}

export function NoPermissionState() {
  return (
    <div
      style={{
        display: "flex",
        "flex-direction": "column",
        "align-items": "center",
        "justify-content": "center",
        "text-align": "center",
        gap: "var(--space-sm)",
        flex: "1",
        padding: "var(--space-lg)",
      }}
    >
      <h2
        style={{
          "font-size": "var(--font-size-heading)",
          "font-weight": "var(--font-weight-semibold)",
          "line-height": "var(--line-height-heading)",
          color: "var(--color-text-primary)",
        }}
      >
        Screen capture permission needed
      </h2>
      <p
        style={{
          "font-size": "var(--font-size-body)",
          "font-weight": "var(--font-weight-regular)",
          "line-height": "var(--line-height-body)",
          color: "var(--color-text-secondary)",
        }}
      >
        Screen capture permission is needed to help you. Open System Preferences &gt; Privacy &gt; Screen Recording to grant access.
      </p>
    </div>
  );
}
