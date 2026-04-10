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
  onSttPartial,
  onSttFinal,
  onSttError,
  getTtsEnabled,
} from "../lib/tauri";
import { streamGuidance } from "../lib/ai";

// D-08: "listening" added for PTT active state
type ContentState = "empty" | "loading" | "streaming" | "error" | "listening";

export function SidebarShell() {
  const [needsPermission, setNeedsPermission] = createSignal(true);
  const [permissionDenied, setPermissionDenied] = createSignal(false);
  const [contentState, setContentState] = createSignal<ContentState>("empty");
  const [streamingText, setStreamingText] = createSignal("");
  const [errorMessage, setErrorMessage] = createSignal("");
  const [screenshotFailed, setScreenshotFailed] = createSignal(false);
  const [lastIntent, setLastIntent] = createSignal("");

  // Phase 3: Lifted input state (D-17: unified input field)
  const [inputValue, setInputValue] = createSignal("");
  // Phase 3: STT inline error (D-24)
  const [sttError, setSttError] = createSignal("");
  // Phase 3: TTS preference (D-12: off by default)
  const [ttsEnabled, setTtsEnabled] = createSignal(false);
  // Phase 3: PTT listening indicator — MUST be declared before onMount (D-08)
  const [isListening, setIsListening] = createSignal(false);

  let inputRef: HTMLInputElement | undefined;
  let unlistenOverlay: (() => void) | undefined;
  let unlistenSttPartial: (() => void) | undefined;
  let unlistenSttFinal: (() => void) | undefined;
  let unlistenSttError: (() => void) | undefined;
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

    // Load TTS preference (D-12, D-14)
    try {
      const enabled = await getTtsEnabled();
      setTtsEnabled(enabled);
    } catch {
      // Default to false on error
    }

    const unlisten = await onOverlayShown(() => {
      // Reset to idle on every open so stale error/loading states don't persist
      setContentState("empty");
      setErrorMessage("");
      setStreamingText("");
      abortController?.abort();
      abortController = null;
      if (inputRef && !needsPermission()) {
        inputRef.focus();
      }
    });
    unlistenOverlay = unlisten;

    // Phase 3: STT event listeners
    // D-05, D-06, D-07: Partial transcripts replace field value in real-time
    // D-08: setIsListening(true) on first partial — shows mic indicator
    unlistenSttPartial = await onSttPartial((transcript) => {
      setInputValue(transcript);  // D-07: full partial (not delta) — overwrite
      setSttError("");             // clear any previous error on new speech
      setIsListening(true);        // D-08: mic indicator active during PTT
    });

    // D-09: Final transcript stays in field — user must press Enter to submit
    // D-19: PTT does NOT clear field — transcript stays as-is on release
    unlistenSttFinal = await onSttFinal((transcript) => {
      if (transcript) setInputValue(transcript); // only update if non-empty (D-11, D-19)
      setIsListening(false);       // D-26: return mic indicator to idle
      setContentState("empty");    // return to idle (NOT auto-submit — D-09)
    });

    // D-24, D-25, D-26: STT error — show message, preserve text, return to idle
    unlistenSttError = await onSttError((error) => {
      console.error("STT error:", error);
      setSttError("Didn't catch that — try again"); // D-24
      setIsListening(false);       // D-26: mic indicator returns to idle
      setContentState("empty");    // D-26: return to idle state
      // D-25: inputValue is NOT cleared — preserve user's partial text
    });
  });

  onCleanup(() => {
    unlistenOverlay?.();
    unlistenSttPartial?.();
    unlistenSttFinal?.();
    unlistenSttError?.();
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
    // Clear STT error on new submission
    setSttError("");

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
        {/* Permission flow (unchanged from Phase 2) */}
        <Show when={needsPermission()}>
          <PermissionDialog
            onGranted={handlePermissionGranted}
            onDismissed={handlePermissionDismissed}
          />
        </Show>

        {/* Screenshot fallback notice (D-04) */}
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

        {/* Streaming state — pass ttsEnabled to GuidanceList */}
        <Show when={!needsPermission() && contentState() === "streaming"}>
          <GuidanceList
            streamingText={streamingText()}
            ttsEnabled={ttsEnabled()}
          />
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
          value={inputValue}
          setValue={setInputValue}
          onSubmit={handleSubmit}
          disabled={needsPermission()}
          listening={isListening()}
          sttError={sttError()}
          ref={(el) => { inputRef = el; }}
        />
      </div>
    </div>
  );
}
