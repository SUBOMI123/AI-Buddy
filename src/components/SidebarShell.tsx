import { createSignal, onMount, onCleanup, Show } from "solid-js";
import { DragHandle } from "./DragHandle";
import { TextInput } from "./TextInput";
import { EmptyState, NoPermissionState } from "./EmptyState";
import { GuidanceList } from "./GuidanceList";
import { PermissionDialog } from "./PermissionDialog";
import { checkScreenPermission, onOverlayShown } from "../lib/tauri";

export function SidebarShell() {
  const [needsPermission, setNeedsPermission] = createSignal(true);
  const [permissionDenied, setPermissionDenied] = createSignal(false);
  const [steps, setSteps] = createSignal<string[]>([]);
  let inputRef: HTMLInputElement | undefined;
  let unlistenOverlay: (() => void) | undefined;

  onMount(async () => {
    // Check if screen permission is already granted
    try {
      const hasPermission = await checkScreenPermission();
      if (hasPermission) {
        setNeedsPermission(false);
      }
    } catch {
      // Permission check failed, keep dialog showing
    }

    // Listen for overlay-shown events to auto-focus input
    const unlisten = await onOverlayShown(() => {
      if (inputRef && !needsPermission()) {
        inputRef.focus();
      }
    });
    unlistenOverlay = unlisten;
  });

  onCleanup(() => {
    unlistenOverlay?.();
  });

  const handlePermissionGranted = () => {
    setNeedsPermission(false);
    setPermissionDenied(false);
    // Focus input after permission granted
    setTimeout(() => inputRef?.focus(), 100);
  };

  const handlePermissionDismissed = () => {
    setNeedsPermission(false);
    setPermissionDenied(true);
  };

  const handleSubmit = (text: string) => {
    void text;
    setSteps([
      "Not connected yet -- AI guidance will be available in the next update.",
    ]);
  };

  return (
    <div
      class="sidebar-shell"
      style={{
        width: "var(--sidebar-width)",
        height: "100vh",
        background: "var(--color-surface)",
        "border-left": "1px solid var(--color-border)",
        display: "flex",
        "flex-direction": "column",
        overflow: "hidden",
        animation: "slideIn 200ms cubic-bezier(0.16, 1, 0.3, 1) forwards",
      }}
    >
      <style>{`
        @keyframes slideIn {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
      `}</style>

      <DragHandle />

      <div
        class="sidebar-content"
        style={{
          flex: "1",
          "overflow-y": "auto",
          display: "flex",
          "flex-direction": "column",
          padding: "0 var(--space-md)",
        }}
      >
        <Show when={needsPermission()}>
          <PermissionDialog
            onGranted={handlePermissionGranted}
            onDismissed={handlePermissionDismissed}
          />
        </Show>

        <Show when={!needsPermission() && !permissionDenied() && steps().length === 0}>
          <EmptyState />
        </Show>

        <Show when={!needsPermission() && permissionDenied()}>
          <NoPermissionState />
        </Show>

        <Show when={!needsPermission() && steps().length > 0}>
          <GuidanceList steps={steps()} />
        </Show>
      </div>

      <div
        class="sidebar-input-area"
        style={{
          padding: "var(--space-md)",
          "border-top": "1px solid var(--color-border)",
          "flex-shrink": "0",
        }}
      >
        <TextInput
          onSubmit={handleSubmit}
          disabled={needsPermission()}
          ref={(el) => { inputRef = el; }}
        />
      </div>
    </div>
  );
}
