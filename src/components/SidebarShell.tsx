import { createSignal, onMount, onCleanup, Show } from "solid-js";
import { X, Settings } from "lucide-solid";
import { DragHandle } from "./DragHandle";
import { SettingsScreen } from "./SettingsScreen";
import { TextInput } from "./TextInput";
import { EmptyState, NoPermissionState } from "./EmptyState";
import { SessionFeed, type SessionExchange } from "./SessionFeed";
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
  setTtsEnabled as setTtsEnabledIpc,
  playTts,
  openRegionSelect,
  captureRegion,
  onRegionSelected,
  onRegionCancelled,
  prepareGuidanceContext,
  recordInteraction,
  getMemoryContext,
  getActiveApp,
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

  // Phase 5: Learning & Adaptation
  const [currentTier, setCurrentTier] = createSignal<number>(1);
  // showFullStepsOverride getter unused in JSX — setter used by handleShowFullSteps to reset state
  const [_showFullStepsOverride, setShowFullStepsOverride] = createSignal(false);

  // Phase 5: Settings screen (D-06)
  const [showSettings, setShowSettings] = createSignal(false);

  // Phase 8: CTX-01 — detected active app name (null until overlay shown)
  const [detectedApp, setDetectedApp] = createSignal<string | null>(null);

  // Phase 9: SESS-01, SESS-02 — session exchange history (D-10: in-memory only)
  const [sessionHistory, setSessionHistory] = createSignal<SessionExchange[]>([]);

  let inputRef: HTMLInputElement | undefined;
  let unlistenOverlay: (() => void) | undefined;
  let unlistenPttStart: (() => void) | undefined;
  let unlistenSttPartial: (() => void) | undefined;
  let unlistenSttFinal: (() => void) | undefined;
  let unlistenSttError: (() => void) | undefined;
  let unlistenRegionSelected: (() => void) | undefined;
  let unlistenRegionCancelled: (() => void) | undefined;
  let abortController: AbortController | null = null;
  let sessionFeedRef: HTMLDivElement | undefined;
  // WR-01: generation counter guards against double-submit races.
  // Each submitIntent call captures its own generation; stale callbacks are discarded.
  let submitGen = 0;

  onMount(() => {
    // WR-02: Use a cancelled flag + inline cleanups array so that if the component
    // unmounts (hot-reload, fast close) while the async setup is still awaiting,
    // any listeners registered after that point are immediately unlistened.
    // Without this, the onCleanup below runs before the awaits resolve, leaving
    // listeners alive for the full WebView lifetime.
    let cancelled = false;
    const cleanups: Array<() => void> = [];

    (async () => {
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

      const unlisten = await onOverlayShown(async () => {
        // Phase 9 D-11: Only reset transient UI states — never session history or task header
        if (["loading", "streaming", "error"].includes(contentState())) {
          setContentState("empty");
          setStreamingText("");
          abortController?.abort();
          abortController = null;
        }
        setErrorMessage(""); // always clear error message
        setSttError("");     // always clear STT error
        if (inputRef && !needsPermission()) {
          inputRef.focus();
        }
        // CTX-01: Detect active app non-blocking — do NOT await (Pitfall 4: blocks overlay open)
        setDetectedApp(null);
        getActiveApp().then((app) => setDetectedApp(app)).catch(() => setDetectedApp(null));
        // sessionHistory and lastIntent are NOT touched here (D-11)
      });
      if (cancelled) { unlisten(); return; }
      unlistenOverlay = unlisten;
      cleanups.push(unlisten);

      // Phase 3: STT event listeners
      // ptt-start fires immediately on key press so mic indicator appears at once
      const ulPttStart = await onPttStart(() => {
        setIsListening(true);
        setSttError("");
      });
      if (cancelled) { ulPttStart(); return; }
      unlistenPttStart = ulPttStart;
      cleanups.push(ulPttStart);

      // D-05, D-06, D-07: Partial transcripts replace field value in real-time
      const ulSttPartial = await onSttPartial((transcript) => {
        setInputValue(transcript);  // D-07: full partial (not delta) — overwrite
        setSttError("");             // clear any previous error on new speech
        setIsListening(true);        // D-08: mic indicator active during PTT
      });
      if (cancelled) { ulSttPartial(); return; }
      unlistenSttPartial = ulSttPartial;
      cleanups.push(ulSttPartial);

      // D-09: Final transcript stays in field — user must press Enter to submit
      // D-19: PTT does NOT clear field — transcript stays as-is on release
      const ulSttFinal = await onSttFinal((transcript) => {
        if (transcript) setInputValue(transcript); // only update if non-empty (D-11, D-19)
        setIsListening(false);       // D-26: return mic indicator to idle
        setContentState("empty");    // return to idle (NOT auto-submit — D-09)
      });
      if (cancelled) { ulSttFinal(); return; }
      unlistenSttFinal = ulSttFinal;
      cleanups.push(ulSttFinal);

      // D-24, D-25, D-26: STT error — show message, preserve text, return to idle
      const ulSttError = await onSttError((error) => {
        if (import.meta.env.DEV) console.error("STT error:", error);
        setSttError("Didn't catch that — try again"); // D-24
        setIsListening(false);       // D-26: mic indicator returns to idle
        setContentState("empty");    // D-26: return to idle state
        // D-25: inputValue is NOT cleared — preserve user's partial text
      });
      if (cancelled) { ulSttError(); return; }
      unlistenSttError = ulSttError;
      cleanups.push(ulSttError);

      // Phase 4: Region selection listeners
      // region-selected fires when user finishes drawing in the region-select window
      // RegionSelect closes its own window before emitting, so no closeRegionSelect() needed here
      const ulRegionSelected = await onRegionSelected(async (coords) => {
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
      if (cancelled) { ulRegionSelected(); return; }
      unlistenRegionSelected = ulRegionSelected;
      cleanups.push(ulRegionSelected);

      // region-cancelled fires on Esc or too-small drag (D-10)
      // RegionSelect closes its own window before emitting
      const ulRegionCancelled = await onRegionCancelled(() => {
        setContentState("empty");  // restore sidebar (Constraint 6: sidebar MUST reappear)
        // Do NOT set selectedRegion — region stays null, fallback to full-screen (D-04)
      });
      if (cancelled) { ulRegionCancelled(); return; }
      unlistenRegionCancelled = ulRegionCancelled;
      cleanups.push(ulRegionCancelled);
    })();

    onCleanup(() => {
      cancelled = true;
      cleanups.forEach((fn) => fn());
      abortController?.abort();
    });
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

  const submitIntent = async (intent: string, forceFullSteps = false) => {
    // WR-01: capture generation before any await so stale callbacks can self-discard
    const thisGen = ++submitGen;

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

    // Phase 9 SESS-01: build prior turn context for Claude (D-08, D-09)
    const conversationHistory = sessionHistory().flatMap((exchange) => [
      { role: "user" as const, content: exchange.intent },
      { role: "assistant" as const, content: exchange.guidance },
    ]);

    // Phase 5: Classify intent + get tier (D-02, D-03)
    // Force tier 1 if user clicked "Show full steps" (D-04)
    const fallbackLabel = intent.slice(0, 50).replace(/\s+/g, "_").toLowerCase();
    let ctx = { tier: 1, taskLabel: fallbackLabel, encounterCount: 0 };
    if (!forceFullSteps) {
      try {
        ctx = await prepareGuidanceContext(intent);
      } catch {
        // Classification failed — default to tier 1 (full guidance)
        ctx = { tier: 1, taskLabel: fallbackLabel, encounterCount: 0 };
      }
    }
    setCurrentTier(ctx.tier);
    setShowFullStepsOverride(false);

    // Phase 5: Build memory context for tier > 1 (D-08 — only send summary string, never raw rows)
    let memoryContext: string | undefined;
    if (ctx.tier > 1) {
      try {
        memoryContext = await getMemoryContext();
      } catch {
        memoryContext = undefined;
      }
    }

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
    // CR-02: accumulate tokens locally so onDone reads the complete text, not the signal.
    // SolidJS signals are synchronous but onDone arrives via a separate micro-task boundary
    // from the SSE reader loop; reading the signal in onDone may capture an incomplete value.
    let accumulatedText = "";

    await streamGuidance({
      token,
      screenshot,
      userIntent: intent,
      tier: ctx.tier,
      memoryContext,
      taskLabel: ctx.taskLabel,
      appContext: detectedApp() ?? undefined,  // CTX-02: active app for prompt enrichment
      conversationHistory,  // Phase 9 SESS-01 (D-08): prior turns text-only
      onToken: (text) => {
        accumulatedText += text;               // local accumulator — synchronous, no signal read lag
        if (contentState() === "loading") {
          setContentState("streaming");
          // Phase 9 D-05: auto-scroll to bottom when first token arrives
          if (sessionFeedRef) {
            sessionFeedRef.scrollTop = sessionFeedRef.scrollHeight;
          }
        }
        setStreamingText(accumulatedText);     // signal for UI display
      },
      onError: (err) => {
        if (thisGen !== submitGen) return; // WR-01: discard stale error from superseded request
        setErrorMessage(err);
        setContentState("error");
      },
      onDone: () => {
        if (thisGen !== submitGen) return; // WR-01: discard stale done from superseded request
        if (contentState() === "loading") {
          setContentState("streaming");
        }
        // Phase 9 SESS-01: append completed exchange to history, cap at 3 (D-09)
        const completedExchange: SessionExchange = {
          intent: lastIntent(),
          guidance: accumulatedText, // use local accumulator, not signal (CR-02)
        };
        setSessionHistory((prev) => {
          const updated = [...prev, completedExchange];
          return updated.length > 3 ? updated.slice(updated.length - 3) : updated;
        });
        // Auto-play full guidance on arrival if TTS enabled (D-12: silent fail)
        if (ttsEnabled()) {
          playTts(accumulatedText).catch(() => {});  // use local, not signal
        }
        // Phase 5: Record interaction fire-and-forget (D-01)
        if (ctx.taskLabel) {
          recordInteraction(
            ctx.taskLabel,
            intent,
            accumulatedText,                         // use local, not signal
            ctx.tier,
            detectedApp() ?? undefined,  // CTX-02: pass app context to memory DB
          ).catch(() => {}); // silent fail — never block the UI
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

  // Phase 5 D-04: "Show full steps" re-runs at tier 1, bypassing memory
  const handleShowFullSteps = () => {
    const intent = lastIntent();
    if (intent) {
      setShowFullStepsOverride(true);
      submitIntent(intent, true); // forceFullSteps = true
    }
  };

  // Phase 9 D-01, SESS-03: "New task" resets all session state explicitly
  const handleNewTask = () => {
    abortController?.abort();
    abortController = null;
    setSessionHistory([]);
    setLastIntent("");
    setStreamingText("");
    setContentState("empty");
    setErrorMessage("");
    setSttError("");
    setScreenshotFailed(false);
    setTimeout(() => inputRef?.focus(), 0);
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
        animation: "slideIn 80ms cubic-bezier(0.16, 1, 0.3, 1) forwards",
      }}
    >
      <style>{`
        @keyframes slideIn {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
      `}</style>

      <DragHandle />

      {/* Phase 5 D-06: Settings gear icon header row */}
      <div
        style={{
          display: "flex",
          "justify-content": "flex-end",
          "align-items": "center",
          padding: "var(--space-xs) var(--space-md)",
          "border-bottom": "1px solid var(--color-border)",
          "flex-shrink": "0",
        }}
      >
        <button
          onClick={() => setShowSettings(true)}
          aria-label="Open skill profile and settings"
          title="Skill profile"
          style={{
            border: "none",
            background: "transparent",
            color: "var(--color-text-secondary)",
            cursor: "pointer",
            "min-height": "44px",
            "min-width": "44px",
            display: "flex",
            "align-items": "center",
            "justify-content": "center",
            padding: "0",
          }}
        >
          <Settings size={14} />
        </button>
      </div>

      {/* Main content — hidden when settings open */}
      <Show when={!showSettings()}>
      {/* Phase 9 TASK-01: Task header strip — shows when session is active (D-07) */}
      <Show when={lastIntent().length > 0}>
        <div
          aria-live="polite"
          style={{
            background: "var(--color-surface-secondary)",
            "border-bottom": "1px solid var(--color-border)",
            padding: "var(--space-sm) var(--space-md)",
            "flex-shrink": "0",
            display: "flex",
            "flex-direction": "column",
          }}
        >
          <p
            style={{
              "font-size": "var(--font-size-label)",
              "line-height": "var(--line-height-label)",
              color: "var(--color-text-primary)",
              margin: "0",
              overflow: "hidden",
              "text-overflow": "ellipsis",
              "white-space": "nowrap",
            }}
          >
            {lastIntent().length > 50 ? lastIntent().slice(0, 50) + "\u2026" : lastIntent()}
          </p>
          <button
            onClick={handleNewTask}
            aria-label="Start a new task"
            style={{
              border: "none",
              background: "transparent",
              color: "var(--color-accent)",
              "font-size": "var(--font-size-label)",
              cursor: "pointer",
              padding: "0",
              "text-decoration": "underline",
              "min-height": "44px",
              display: "inline-flex",
              "align-items": "center",
              "align-self": "flex-start",
            }}
          >
            New task
          </button>
        </div>
      </Show>
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

        {/* Phase 5 D-04: Degradation notice — shown when tier > 1 and streaming/after streaming */}
        <Show when={!needsPermission() && currentTier() > 1 && (contentState() === "streaming" || contentState() === "empty") && streamingText().length > 0}>
          <div
            style={{
              "font-size": "var(--font-size-label)",
              "line-height": "var(--line-height-label)",
              color: "var(--color-text-secondary)",
              padding: "var(--space-xs) 0 var(--space-sm) 0",
              display: "flex",
              gap: "var(--space-xs)",
              "align-items": "center",
              "flex-wrap": "wrap",
            }}
          >
            <span>
              You've done this before — showing {currentTier() === 2 ? "summary" : "hints"}.
            </span>
            <button
              onClick={handleShowFullSteps}
              style={{
                border: "none",
                background: "transparent",
                color: "var(--color-accent)",
                "font-size": "var(--font-size-label)",
                cursor: "pointer",
                padding: "0",
                "text-decoration": "underline",
                "min-height": "44px",
                display: "inline-flex",
                "align-items": "center",
              }}
            >
              Show full steps
            </button>
          </div>
        </Show>

        {/* Empty state */}
        <Show when={!needsPermission() && !permissionDenied() && contentState() === "empty" && sessionHistory().length === 0}>
          <EmptyState />
        </Show>

        {/* No permission state */}
        <Show when={!needsPermission() && permissionDenied() && contentState() === "empty"}>
          <NoPermissionState />
        </Show>

        {/* Loading state — only shown on first query (no history yet) */}
        <Show when={!needsPermission() && contentState() === "loading" && sessionHistory().length === 0}>
          <LoadingDots />
        </Show>

        {/* Phase 9 SESS-02: Session feed — visible whenever session has content or is active */}
        <Show when={!needsPermission() && (sessionHistory().length > 0 || contentState() === "streaming" || contentState() === "loading")}>
          <SessionFeed
            sessionHistory={sessionHistory()}
            streamingText={streamingText()}
            ttsEnabled={ttsEnabled()}
            ref={(el) => { sessionFeedRef = el; }}
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
      </Show>

      {/* Settings screen — replaces full content area (D-06) */}
      <Show when={showSettings()}>
        <div style={{
          flex: "1",
          overflow: "hidden",
          display: "flex",
          "flex-direction": "column",
          padding: "0 var(--space-md)",
        }}>
          <SettingsScreen
            onClose={() => setShowSettings(false)}
            ttsEnabled={ttsEnabled()}
            onTtsChange={(val: boolean) => {
              setTtsEnabled(val);                       // update in-memory signal immediately
              setTtsEnabledIpc(val).catch(() => {});    // persist to disk (silent fail)
            }}
          />
        </div>
      </Show>
    </div>
  );
}
