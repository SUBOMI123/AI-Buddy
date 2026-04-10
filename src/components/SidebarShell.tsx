import { createSignal, onMount, onCleanup, Show } from "solid-js";
import { X } from "lucide-solid";
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
  onPttStart,
  onSttPartial,
  onSttFinal,
  onSttError,
  getTtsEnabled,
  playTts,
  openRegionSelect,
  captureRegion,
  onRegionSelected,
  onRegionCancelled,
  type RegionCoords,
} from "../lib/tauri";
import { streamGuidance } from "../lib/ai";

// D-08: "listening" added for PTT active state
// Phase 4: "selecting" added for region selection in-progress state
type ContentState = "empty" | "loading" | "streaming" | "error" | "listening" | "selecting";

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

  // Phase 4: Region selection (D-03 to D-08)
  const [selectedRegion, setSelectedRegion] = createSignal<RegionCoords | null>(null);
  // Thumbnail is the base64 JPEG of the selected crop, captured immediately after region-selected fires
  const [thumbnailB64, setThumbnailB64] = createSignal<string | null>(null);

  let inputRef: HTMLInputElement | undefined;
  let unlistenOverlay: (() => void) | undefined;
  let unlistenPttStart: (() => void) | undefined;
  let unlistenSttPartial: (() => void) | undefined;
  let unlistenSttFinal: (() => void) | undefined;
  let unlistenSttError: (() => void) | undefined;
  let unlistenRegionSelected: (() => void) | undefined;
  let unlistenRegionCancelled: (() => void) | undefined;
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
    // ptt-start fires immediately on key press so mic indicator appears at once
    unlistenPttStart = await onPttStart(() => {
      setIsListening(true);
      setSttError("");
    });

    // D-05, D-06, D-07: Partial transcripts replace field value in real-time
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

    // Phase 4: Region selection listeners
    // region-selected fires when user finishes drawing in the region-select window
    // RegionSelect closes its own window before emitting, so no closeRegionSelect() needed here
    unlistenRegionSelected = await onRegionSelected(async (coords) => {
      setSelectedRegion(coords);
      setContentState("empty");  // return sidebar to idle with thumbnail visible

      // Capture thumbnail immediately so user sees what Claude will see (D-05)
      try {
        const b64 = await captureRegion(coords);
        setThumbnailB64(b64);
      } catch {
        // Thumbnail capture failed — still allow submission with stored coords
        setThumbnailB64(null);
      }
    });

    // region-cancelled fires on Esc or too-small drag (D-10)
    // RegionSelect closes its own window before emitting
    unlistenRegionCancelled = await onRegionCancelled(() => {
      setContentState("empty");  // restore sidebar (Constraint 6: sidebar MUST reappear)
      // Do NOT set selectedRegion — region stays null, fallback to full-screen (D-04)
    });
  });

  onCleanup(() => {
    unlistenOverlay?.();
    unlistenPttStart?.();
    unlistenSttPartial?.();
    unlistenSttFinal?.();
    unlistenSttError?.();
    unlistenRegionSelected?.();
    unlistenRegionCancelled?.();
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

  // D-01, D-02: Crop button handler — hide sidebar, open overlay
  const handleRegionSelect = async () => {
    setContentState("selecting");  // signals sidebar to hide
    await openRegionSelect();
  };

  // D-06, D-07: Clear button handler — reset region, fall back to full-screen
  const handleClearRegion = () => {
    setSelectedRegion(null);
    setThumbnailB64(null);
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

    // 1. Capture screenshot or region (D-04, D-08)
    let screenshot: string | null = null;
    const region = selectedRegion();
    try {
      if (region) {
        // D-08: only crop sent to Claude when region is set
        screenshot = await captureRegion(region);
      } else {
        // D-04: full-screen fallback when no region selected
        screenshot = await captureScreenshot();
      }
    } catch {
      // D-04, D-12: fall back to text-only with notice
      screenshot = null;
      setScreenshotFailed(true);
    }

    // D-07: region resets after every submit — each question starts fresh
    setSelectedRegion(null);
    setThumbnailB64(null);

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
        // Auto-play full guidance on arrival if TTS enabled (D-12: silent fail)
        if (ttsEnabled()) {
          playTts(streamingText()).catch(() => {});
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
        {/* Phase 4 D-05, D-06: Region thumbnail preview — shown when region is set */}
        <Show when={selectedRegion() !== null && thumbnailB64() !== null}>
          <div
            style={{
              background: "var(--color-surface-secondary)",
              "border-radius": "var(--radius-md)",
              padding: "var(--space-sm)",
              "margin-bottom": "var(--space-sm)",
              position: "relative",
              animation: "thumbnailFadeIn var(--transition-fast) ease forwards",
            }}
          >
            <style>{`
              @keyframes thumbnailFadeIn {
                from { opacity: 0; }
                to { opacity: 1; }
              }
            `}</style>

            {/* X clear button — top-right, absolute positioned (D-06) */}
            <button
              onClick={handleClearRegion}
              aria-label="Clear selected region"
              style={{
                position: "absolute",
                top: "var(--space-xs)",
                right: "var(--space-xs)",
                border: "none",
                background: "transparent",
                cursor: "pointer",
                color: "var(--color-text-secondary)",
                "min-height": "44px",
                "min-width": "44px",
                display: "flex",
                "align-items": "center",
                "justify-content": "center",
                padding: "0",
                "z-index": "1",
              }}
            >
              <X size={12} />
            </button>

            {/* Thumbnail image */}
            <img
              src={`data:image/jpeg;base64,${thumbnailB64()}`}
              alt="Selected region preview"
              style={{
                width: "100%",
                "max-height": "80px",
                "object-fit": "cover",
                "border-radius": "var(--radius-sm)",
                display: "block",
              }}
            />

            {/* Dimensions label (UI-SPEC: physical pixels from coords) */}
            <div
              style={{
                "font-size": "var(--font-size-label)",
                color: "var(--color-text-secondary)",
                "margin-top": "var(--space-xs)",
                "text-align": "center",
              }}
            >
              {selectedRegion()!.width} × {selectedRegion()!.height}
            </div>
          </div>
        </Show>

        <TextInput
          value={inputValue}
          setValue={setInputValue}
          onSubmit={handleSubmit}
          disabled={needsPermission()}
          listening={isListening()}
          sttError={sttError()}
          ref={(el) => { inputRef = el; }}
          onRegionSelect={handleRegionSelect}
          regionActive={selectedRegion() !== null}
        />
      </div>
    </div>
  );
}
