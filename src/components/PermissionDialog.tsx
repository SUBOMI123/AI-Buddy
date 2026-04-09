import { createSignal, Show } from "solid-js";
import { requestScreenPermission } from "../lib/tauri";

interface PermissionDialogProps {
  onGranted: () => void;
  onDismissed: () => void;
}

export function PermissionDialog(props: PermissionDialogProps) {
  const [error, setError] = createSignal("");
  const [requesting, setRequesting] = createSignal(false);

  const handleGrant = async () => {
    setError("");
    setRequesting(true);
    try {
      const granted = await requestScreenPermission();
      if (granted) {
        props.onGranted();
      } else {
        setError(
          "Could not check screen capture permission. Try again, or restart AI Buddy from the system tray."
        );
      }
    } catch {
      setError(
        "Could not check screen capture permission. Try again, or restart AI Buddy from the system tray."
      );
    } finally {
      setRequesting(false);
    }
  };

  return (
    <div
      style={{
        display: "flex",
        "flex-direction": "column",
        gap: "var(--space-md)",
        padding: "var(--space-lg) var(--space-md)",
        flex: "1",
        "justify-content": "center",
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
        Screen Recording Permission
      </h2>
      <p
        style={{
          "font-size": "var(--font-size-body)",
          "font-weight": "var(--font-weight-regular)",
          "line-height": "var(--line-height-body)",
          color: "var(--color-text-secondary)",
        }}
      >
        AI Buddy captures a screenshot of your screen when you ask for help.
        Screenshots are sent to the AI for analysis and are never stored. No
        continuous recording.
      </p>

      <Show when={error()}>
        <p
          style={{
            "font-size": "var(--font-size-body)",
            "line-height": "var(--line-height-body)",
            color: "var(--color-destructive)",
          }}
        >
          {error()}
        </p>
      </Show>

      <button
        onClick={handleGrant}
        disabled={requesting()}
        style={{
          width: "100%",
          "min-height": "44px",
          border: "none",
          "border-radius": "var(--radius-md)",
          background: "var(--color-accent)",
          color: "#fff",
          "font-size": "var(--font-size-body)",
          "font-weight": "var(--font-weight-semibold)",
          "font-family": "inherit",
          cursor: requesting() ? "wait" : "pointer",
          opacity: requesting() ? "0.7" : "1",
          transition: "opacity var(--transition-fast)",
        }}
      >
        Grant Permission
      </button>

      <button
        onClick={() => props.onDismissed()}
        style={{
          background: "transparent",
          border: "none",
          color: "var(--color-text-secondary)",
          "font-size": "var(--font-size-body)",
          "font-family": "inherit",
          "text-decoration": "underline",
          cursor: "pointer",
          padding: "var(--space-xs) 0",
          "text-align": "center",
        }}
      >
        Not Now
      </button>
    </div>
  );
}
