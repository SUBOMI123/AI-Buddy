import { createSignal, onMount, onCleanup, Show, For } from "solid-js";
import { X, Settings, Plus } from "lucide-solid";
import { DragHandle } from "./DragHandle";
import { SettingsScreen } from "./SettingsScreen";
import { TextInput } from "./TextInput";
import { EmptyState, NoPermissionState } from "./EmptyState";
import { SessionFeed, type SessionExchange } from "./SessionFeed";
import { LoadingDots } from "./LoadingDots";
import { parseSteps, isClarifyingQuestion, type Step } from "../lib/parseSteps";
import { StepChecklist } from "./StepChecklist";
import { RawGuidanceText } from "./RawGuidanceText";
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
// Phase 9: "done" added — post-completion stable state (distinct from "streaming" and "empty")
type ContentState = "empty" | "loading" | "streaming" | "done" | "error" | "listening" | "selecting";

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
  // 260413-09m: per-item expand state for collapsible history rows (collapsed by default)
  const [expandedHistoryItems, setExpandedHistoryItems] = createSignal<Set<number>>(new Set<number>());

  // Phase 10 D-05: currentExchange separates active exchange from sessionHistory
  // — avoids duplicate rendering when StepChecklist is shown below SessionFeed
  const [currentExchange, setCurrentExchange] = createSignal<SessionExchange | null>(null);
  // Phase 10 D-02, D-13: steps parsed at onDone; reset at start of submitIntent
  const [steps, setSteps] = createSignal<Step[]>([]);
  // Phase 10 UAT fix: explicit highlight state — not derived from first-incomplete
  const [currentStepIndex, setCurrentStepIndex] = createSignal<number>(0);
  // 260413-1x7: AI-generated task title from "Task: ..." line in response
  const [taskTitle, setTaskTitle] = createSignal<string>("");

  let inputRef: HTMLInputElement | undefined;
  let unlistenOverlay: (() => void) | undefined;
  let unlistenPttStart: (() => void) | undefined;
  let unlistenSttPartial: (() => void) | undefined;
  let unlistenSttFinal: (() => void) | undefined;
  let unlistenSttError: (() => void) | undefined;
  let unlistenRegionSelected: (() => void) | undefined;
  let unlistenRegionCancelled: (() => void) | undefined;
  let abortController: AbortController | null = null;
  let contentAreaRef: HTMLDivElement | undefined;
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
        // "done" is included so stale streaming text from a prior completed response is cleared
        if (["loading", "streaming", "error", "done"].includes(contentState())) {
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

    // D-05: move currentExchange to sessionHistory before clearing (history-first, then clear)
    // D-13: reset steps at start of each new submission
    if (currentExchange() !== null) {
      const prev = currentExchange()!;
      setSessionHistory((h) => {
        const updated = [...h, prev];
        return updated.length > 3 ? updated.slice(updated.length - 3) : updated;
      });
      setExpandedHistoryItems(new Set<number>()); // 260413-09m: reset collapse state on new submission
      setCurrentExchange(null);
    }
    setSteps([]);
    setCurrentStepIndex(0);
    setTaskTitle(""); // 260413-1x7: reset AI title on new submission

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
          if (contentAreaRef) {
            contentAreaRef.scrollTop = contentAreaRef.scrollHeight;
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
        // D-05: set currentExchange instead of pushing to sessionHistory
        // D-01, D-02: parse steps post-stream only (never during streaming)
        const completedExchange: SessionExchange = {
          intent: lastIntent(),
          guidance: accumulatedText, // use local accumulator, not signal (CR-02)
        };
        setCurrentExchange(completedExchange);
        const { steps: parsedSteps, title: parsedTitle } = parseSteps(accumulatedText);
        setSteps(parsedSteps);
        setTaskTitle(parsedTitle);
        // Phase 9 WR-02: transition to "done" — stable post-completion state that prevents
        // the degradation notice from appearing as a false positive on overlay re-open.
        setContentState("done");
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
    setExpandedHistoryItems(new Set<number>()); // 260413-09m: reset collapse state on new task
    setCurrentExchange(null);
    setSteps([]);
    setCurrentStepIndex(0);
    setTaskTitle("");
    setLastIntent("");
    setStreamingText("");
    setContentState("empty");
    setErrorMessage("");
    setSttError("");
    setScreenshotFailed(false);
    setTimeout(() => inputRef?.focus(), 0);
  };

  const cleanLabel = (raw: string): string => {
    let s = raw.trim().replace(/[?.]+$/, "");   // strip trailing ? or .
    s = s.charAt(0).toUpperCase() + s.slice(1); // capitalize first word
    return s.length > 40 ? s.slice(0, 40) + "\u2026" : s;
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

      {/* Phase 5 D-06: Settings gear icon header row — shown only when no task is active */}
      <Show when={lastIntent().length === 0}>
        <div style={{
          display: "flex",
          "justify-content": "flex-end",
          "align-items": "center",
          padding: "var(--space-xs) var(--space-md)",
          "border-bottom": "1px solid var(--color-border)",
          "flex-shrink": "0",
        }}>
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
      </Show>

      {/* Main content — hidden when settings open */}
      <Show when={!showSettings()}>
      {/* Phase 9 TASK-01 / 260413-1kn: Compact single-row task header — shows when session is active */}
      <Show when={lastIntent().length > 0}>
        <div
          aria-live="polite"
          style={{
            background: "var(--color-surface-secondary)",
            "border-bottom": "1px solid var(--color-border)",
            padding: "0 var(--space-md)",
            "flex-shrink": "0",
            display: "flex",
            "align-items": "center",
            gap: "var(--space-xs)",
            height: "38px",
            "min-height": "38px",
          }}
        >
          {/* Cleaned task label — fills remaining space, truncates */}
          <span
            style={{
              "font-size": "var(--font-size-label)",
              "font-weight": "500",
              "line-height": "1",
              color: "var(--color-text-secondary)",
              overflow: "hidden",
              "text-overflow": "ellipsis",
              "white-space": "nowrap",
              flex: "1",
              "min-width": "0",
            }}
          >
            {taskTitle() ? taskTitle() : `Working on: ${cleanLabel(lastIntent())}`}
          </span>

          {/* + button — new task */}
          <button
            onClick={handleNewTask}
            aria-label="New task"
            title="New task"
            style={{
              border: "none",
              background: "transparent",
              color: "var(--color-text-secondary)",
              cursor: "pointer",
              display: "flex",
              "align-items": "center",
              "justify-content": "center",
              padding: "0",
              width: "28px",
              height: "28px",
              "flex-shrink": "0",
              "border-radius": "var(--radius-sm)",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.color = "var(--color-text-primary)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.color = "var(--color-text-secondary)";
            }}
          >
            <Plus size={14} />
          </button>

          {/* Gear icon — settings, same row */}
          <button
            onClick={() => setShowSettings(true)}
            aria-label="Open skill profile and settings"
            title="Skill profile"
            style={{
              border: "none",
              background: "transparent",
              color: "var(--color-text-secondary)",
              cursor: "pointer",
              display: "flex",
              "align-items": "center",
              "justify-content": "center",
              padding: "0",
              width: "28px",
              height: "28px",
              "flex-shrink": "0",
              "border-radius": "var(--radius-sm)",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.color = "var(--color-text-primary)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.color = "var(--color-text-secondary)";
            }}
          >
            <Settings size={14} />
          </button>
        </div>
      </Show>
      <div
        class="sidebar-content"
        ref={(el) => { contentAreaRef = el; }}
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

        {/* Phase 5 D-04: Degradation notice — shown when tier > 1 and streaming or done */}
        {/* WR-02: "done" replaces "empty" — avoids false positive on overlay re-open */}
        <Show when={!needsPermission() && currentTier() > 1 && (contentState() === "streaming" || contentState() === "done") && streamingText().length > 0}>
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
        {/* WR-02: include "done" so feed remains visible after stream completes */}
        <Show when={!needsPermission() && (sessionHistory().length > 0 || contentState() === "streaming" || contentState() === "loading" || contentState() === "done")}>
          {/* 260413-09m: Collapsible history rows — rendered above the live SessionFeed */}
          <For each={sessionHistory()}>
            {(exchange, index) => {
              const isExpanded = () => expandedHistoryItems().has(index());
              const toggleExpanded = () => {
                setExpandedHistoryItems((prev) => {
                  const next = new Set(prev);
                  if (next.has(index())) next.delete(index());
                  else next.add(index());
                  return next;
                });
              };
              const summary = exchange.intent.length > 40
                ? exchange.intent.slice(0, 40) + "\u2026"
                : exchange.intent;
              return (
                <div style={{ "border-bottom": "1px solid var(--color-border)" }}>
                  <button
                    onClick={toggleExpanded}
                    aria-expanded={isExpanded()}
                    style={{
                      width: "100%",
                      display: "flex",
                      "align-items": "center",
                      "justify-content": "space-between",
                      background: "transparent",
                      border: "none",
                      padding: "var(--space-sm) 0",
                      cursor: "pointer",
                      color: "var(--color-text-secondary)",
                      "font-size": "var(--font-size-label)",
                      "text-align": "left",
                      gap: "var(--space-xs)",
                    }}
                  >
                    <span style={{
                      overflow: "hidden",
                      "text-overflow": "ellipsis",
                      "white-space": "nowrap",
                      flex: "1",
                    }}>
                      {summary}
                    </span>
                    <span style={{ "flex-shrink": "0", "font-size": "10px" }}>
                      {isExpanded() ? "\u25BC" : "\u25B6"}
                    </span>
                  </button>
                  <Show when={isExpanded()}>
                    <div style={{
                      "font-size": "var(--font-size-label)",
                      "line-height": "var(--line-height-body)",
                      color: "var(--color-text-secondary)",
                      padding: "0 0 var(--space-sm) 0",
                      "white-space": "pre-wrap",
                      "word-break": "break-word",
                    }}>
                      {exchange.guidance}
                    </div>
                  </Show>
                </div>
              );
            }}
          </For>
          <SessionFeed
            sessionHistory={[]}
            streamingText={contentState() === "streaming" ? streamingText() : ""}
            ttsEnabled={ttsEnabled()}
          />
          {/* Phase 10 D-06: StepChecklist or RawGuidanceText — shown after streaming completes */}
          {/* D-06a: RawGuidanceText is the fallback when parseSteps returns [] */}
          <Show when={contentState() === "done"}>
            {steps().length > 0 && !isClarifyingQuestion(steps())
              ? (
                <StepChecklist
                  steps={steps()}
                  currentStepIndex={currentStepIndex()}
                  onToggle={(index) => {
                    setCurrentStepIndex(index);
                    setSteps((prev) =>
                      prev.map((step, i) =>
                        i === index ? { ...step, completed: !step.completed } : step
                      )
                    );
                  }}
                />
              )
              : (
                <RawGuidanceText
                  text={currentExchange()?.guidance ?? ""}
                />
              )
            }
          </Show>
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
