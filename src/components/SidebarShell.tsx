import { createSignal, onMount, onCleanup, Show } from "solid-js";
import { DragHandle } from "./DragHandle";
import { TextInput } from "./TextInput";
import { EmptyState, NoPermissionState } from "./EmptyState";
import { GuidanceList } from "./GuidanceList";
import { LoadingDots } from "./LoadingDots";
import { PermissionDialog } from "./PermissionDialog";
import {
  checkScreenPermission,
  onOverlayShown,
  captureScreenshot,
  getInstallationToken,
} from "../lib/tauri";
import { streamGuidance } from "../lib/ai";

type ContentState = "empty" | "loading" | "streaming" | "error";

export function SidebarShell() {
  const [needsPermission, setNeedsPermission] = createSignal(true);
  const [permissionDenied, setPermissionDenied] = createSignal(false);
  const [contentState, setContentState] = createSignal<ContentState>("empty");
  const [streamingText, setStreamingText] = createSignal("");
  const [errorMessage, setErrorMessage] = createSignal("");
  const [screenshotFailed, setScreenshotFailed] = createSignal(false);
  const [lastIntent, setLastIntent] = createSignal("");

  let inputRef: HTMLInputElement | undefined;
  let unlistenOverlay: (() => void) | undefined;
  let abortController: AbortController | null = null;

  onMount(async () => {
    try {
      const hasPermission = await checkScreenPermission();
      if (hasPermission) {
        setNeedsPermission(false);
      }
    } catch {
      // Permission check failed, keep dialog showing
    }

    const unlisten = await onOverlayShown(() => {
      if (inputRef && !needsPermission()) {
        inputRef.focus();
      }
    });
    unlistenOverlay = unlisten;
  });

  onCleanup(() => {
    unlistenOverlay?.();
    abortController?.abort();
  });

  const handlePermissionGranted = () => {
    setNeedsPermission(false);
    setPermissionDenied(false);
    setTimeout(() => inputRef?.focus(), 100);
  };

  const handlePermissionDismissed = () => {
    setNeedsPermission(false);
    setPermissionDenied(true);
  };

  const submitIntent = async (intent: string) => {
    // Abort any in-flight request (D-07: clear and replace)
    abortController?.abort();
    abortController = new AbortController();

    // Clear previous state (D-07)
    setStreamingText("");
    setErrorMessage("");
    setScreenshotFailed(false);
    setContentState("loading");
    setLastIntent(intent);

    // 1. Capture screenshot (D-01: on every submit)
    let screenshot: string | null = null;
    try {
      screenshot = await captureScreenshot();
    } catch {
      // D-04, D-12: fall back to text-only with notice
      screenshot = null;
      setScreenshotFailed(true);
    }

    // 2. Get signed auth token
    let token: string;
    try {
      token = await getInstallationToken();
    } catch {
      setErrorMessage("Couldn't reach AI -- check your connection.");
      setContentState("error");
      return;
    }

    // 3. Stream guidance from Claude via Worker
    await streamGuidance({
      token,
      screenshot,
      userIntent: intent,
      onToken: (text) => {
        // First token: switch from loading to streaming (D-06)
        if (contentState() === "loading") {
          setContentState("streaming");
        }
        setStreamingText((prev) => prev + text);
      },
      onError: (err) => {
        setErrorMessage(err);
        setContentState("error");
      },
      onDone: () => {
        if (contentState() === "loading") {
          // Stream completed with no tokens (edge case)
          setContentState("streaming");
        }
      },
      signal: abortController.signal,
    });
  };

  const handleSubmit = (text: string) => {
    submitIntent(text);
  };

  const handleRetry = () => {
    const intent = lastIntent();
    if (intent) {
      submitIntent(intent);
    }
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
        {/* Permission flow (unchanged from Phase 1) */}
        <Show when={needsPermission()}>
          <PermissionDialog
            onGranted={handlePermissionGranted}
            onDismissed={handlePermissionDismissed}
          />
        </Show>

        {/* Screenshot fallback notice (D-04) -- overlay on loading/streaming/error */}
        <Show when={!needsPermission() && screenshotFailed()}>
          <div
            style={{
              "font-size": "var(--font-size-label)",
              "line-height": "var(--line-height-label)",
              color: "var(--color-text-secondary)",
              padding: "var(--space-sm) 0",
            }}
          >
            Screen capture unavailable -- guidance may be less specific
          </div>
        </Show>

        {/* Empty state */}
        <Show when={!needsPermission() && !permissionDenied() && contentState() === "empty"}>
          <EmptyState />
        </Show>

        {/* No permission state */}
        <Show when={!needsPermission() && permissionDenied() && contentState() === "empty"}>
          <NoPermissionState />
        </Show>

        {/* Loading state (D-06) */}
        <Show when={!needsPermission() && contentState() === "loading"}>
          <LoadingDots />
        </Show>

        {/* Streaming state (D-05) */}
        <Show when={!needsPermission() && contentState() === "streaming"}>
          <GuidanceList streamingText={streamingText()} />
        </Show>

        {/* Error state (D-11) */}
        <Show when={!needsPermission() && contentState() === "error"}>
          <div
            style={{
              display: "flex",
              "flex-direction": "column",
              "align-items": "flex-start",
              "justify-content": "center",
              gap: "var(--space-sm)",
              flex: "1",
            }}
          >
            <p
              style={{
                "font-size": "var(--font-size-body)",
                "line-height": "var(--line-height-body)",
                color: "var(--color-text-primary)",
              }}
            >
              {errorMessage()}
            </p>
            <button
              onClick={handleRetry}
              style={{
                border: "none",
                background: "transparent",
                color: "var(--color-accent)",
                "font-size": "var(--font-size-body)",
                "font-weight": "var(--font-weight-regular)",
                cursor: "pointer",
                padding: "var(--space-sm) 0",
                "min-height": "44px",
                display: "flex",
                "align-items": "center",
              }}
            >
              Retry
            </button>
          </div>
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
