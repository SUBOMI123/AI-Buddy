# Phase 10: Step Tracking + Response Quality - Research

**Researched:** 2026-04-12
**Domain:** SolidJS reactive checklist, clipboard API, markdown parsing, system prompt engineering
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01**: Steps parsed post-stream at `onDone` only — never during streaming
- **D-02**: `Step` interface: `{ label: string; completed: boolean }` — lives in `createSignal<Step[]>([])`; parser in `src/lib/parseSteps.ts`
- **D-03**: Current step = first `completed === false` item; highlighted with 3px `--color-accent` left border
- **D-04**: Non-linear toggle — any step click flips `completed`; "current" auto-advances
- **D-05**: `currentExchange: SessionExchange | null` signal separates active exchange from `sessionHistory`; `onDone` sets `currentExchange`, `submitIntent` moves to history; `handleNewTask` clears both
- **D-06**: Rendering layout — `SessionFeed` (history only) → `StepChecklist` (below) when `contentState === "done"`; `RawGuidanceText` fallback when parse fails; `streamingText` prop is empty string when not streaming
- **D-07**: Prior session history stays flat muted text — no checklist on historical items in Phase 10
- **D-08**: Copy buttons on markdown code fences + command-pattern lines; command regex defined
- **D-09**: `navigator.clipboard.writeText` with `execCommand` fallback; no Tauri plugin; silent fail
- **D-10**: `StepChecklist` props: `{ steps: Step[]; onToggle: (index: number) => void }`; icons from `lucide-solid`; `min-height: 44px`; ARIA labels
- **D-11**: System prompt replaced entirely with strict "start with 1. on first line, no preamble" format; tier suffix + appContext + memoryContext injection unchanged
- **D-12**: One action per step enforced via system prompt only
- **D-13**: Steps reset to `[]` at start of `submitIntent`

### Claude's Discretion
None specified — all decisions locked in CONTEXT.md.

### Deferred Ideas (OUT OF SCOPE)
- Task header visual upgrade (Phase 11)
- Input bar "Continue this task..." placeholder (Phase 11)
- Copy buttons on prior session history (Phase 11)
- Settings screen progress view (future)
- TTS per step (Phase 11+)
- RESP-01 post-process preamble strip (add only if quality issues emerge)
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| STEP-01 | Guidance steps rendered as checklist — current step highlighted, completed steps checkmarked | D-02, D-03, D-10: `StepChecklist` component with `<For>`, reactive `steps` signal, `Check`/`Square` icons from `lucide-solid` |
| STEP-02 | User can click any step to mark complete or jump back — non-linear execution | D-04: click handler calls `onToggle(index)`; parent flips `steps()[index].completed` with array spread |
| STEP-03 | Step progress resets when new response is generated | D-13: `steps` reset to `[]` at start of `submitIntent` before streaming begins |
| RESP-01 | AI responses begin with numbered steps on line 1 — no intro sentence or preamble | D-11: system prompt replaced with strict format; see system prompt text in CONTEXT.md |
| RESP-02 | Every code snippet or terminal command has one-click copy button | D-08, D-09: fence parsing + command heuristic regex; `navigator.clipboard` + `execCommand` fallback |
| RESP-03 | Each step contains exactly one actionable instruction | D-12: enforced by system prompt instruction only |
</phase_requirements>

---

## Summary

Phase 10 adds a reactive step checklist that replaces the flat streaming text view after guidance completes, a strict system prompt that forces numbered-step format, and inline copy buttons on code fences and terminal commands.

The phase is entirely frontend TypeScript/SolidJS work. No new Rust code is needed. No new npm packages are required — `lucide-solid` (v1.8.0, verified installed) already ships `Check`, `Square`, and `Clipboard` icons. `navigator.clipboard` is the clipboard mechanism with an `execCommand` textarea fallback.

The key architectural change is introducing `currentExchange` as a signal separate from `sessionHistory`. This avoids the duplicate-rendering problem that would otherwise occur when `StepChecklist` and `SessionFeed` both try to render the most recent exchange.

**Primary recommendation:** Implement in three distinct files — `src/lib/parseSteps.ts` (parser), `src/components/StepChecklist.tsx` (checklist + copy), `src/components/RawGuidanceText.tsx` (fallback) — then wire into `SidebarShell.tsx` (signals + layout) and `src/lib/ai.ts` (system prompt).

---

## Standard Stack

### Core (all already installed)
| Library | Version | Purpose | Why |
|---------|---------|---------|------|
| solid-js | 1.9.12 | `createSignal`, `<For>`, `<Show>` | Already in project; verified installed |
| lucide-solid | 1.8.0 | `Check`, `Square`, `Clipboard` icons | Already in project; icons confirmed present |

### Relevant Exported Icons (VERIFIED: local node_modules grep)
| Icon Name | Use |
|-----------|-----|
| `Check` | Completed step checkmark |
| `Square` | Incomplete (unchecked) step |
| `SquareCheck` / `SquareCheckBig` | Alternative for completed (combines box+check) |
| `Clipboard` | Copy button on code blocks / commands |
| `ClipboardCopy` | Alternative copy button icon |

All of the above are confirmed exported from `lucide-solid` v1.8.0.

### No New Dependencies Needed
The clipboard implementation (D-09) uses `navigator.clipboard` + `document.execCommand` — browser APIs available in the Tauri WebView without any Rust plugin.

**Installation:** None required.

---

## Architecture Patterns

### Recommended New File Structure
```
src/
├── lib/
│   ├── ai.ts              # MODIFIED: replace SYSTEM_PROMPT
│   └── parseSteps.ts      # NEW: parseSteps(text) → Step[]
├── components/
│   ├── SidebarShell.tsx   # MODIFIED: currentExchange signal, layout wiring
│   ├── SessionFeed.tsx    # MODIFIED: no longer receives currentExchange in sessionHistory
│   ├── StepChecklist.tsx  # NEW: checklist + copy buttons
│   └── RawGuidanceText.tsx # NEW: flat text fallback
```

### Pattern 1: SolidJS Array Signal Toggle (STEP-02)

In SolidJS, a `createSignal<Step[]>([])` stores the steps array. Because SolidJS signals track by reference equality for arrays, toggling an item requires producing a new array. The pattern used throughout the codebase (see `setSessionHistory` in `SidebarShell.tsx`) is the array spread:

```typescript
// Source: existing pattern in SidebarShell.tsx (setSessionHistory) + SolidJS docs
const [steps, setSteps] = createSignal<Step[]>([]);

const toggleStep = (index: number) => {
  setSteps((prev) =>
    prev.map((step, i) =>
      i === index ? { ...step, completed: !step.completed } : step
    )
  );
};
```

This creates a new array each call, which is what SolidJS needs to detect the change and re-render `<For each={steps()}>`. The `map` approach is preferred over spread-index-assignment because it avoids mutating the existing array and works correctly with SolidJS's fine-grained reactivity.

**Alternative — `createStore`:** `solid-js/store` is installed and provides `produce()` for mutable-style updates. However, `createSignal` with `map` is simpler, consistent with the existing codebase pattern (no stores are used anywhere in the project), and sufficient for an array of ~10-20 steps. [ASSUMED: store would add no practical benefit at this scale]

### Pattern 2: `<For>` with index and derived "current step" (STEP-01, STEP-03)

```tsx
// Source: SolidJS docs (docs.solidjs.com/concepts/control-flow/for)
// The "current" step = first index where completed === false
const currentStepIndex = () => steps().findIndex((s) => !s.completed);

<For each={steps()}>
  {(step, index) => {
    const isCurrent = () => index() === currentStepIndex();
    const isCompleted = () => step.completed;
    return (
      <button
        onClick={() => props.onToggle(index())}
        aria-label={`Step ${index() + 1}: ${step.label}`}
        style={{
          "min-height": "44px",
          "border-left": isCurrent()
            ? "3px solid var(--color-accent)"
            : "3px solid transparent",
          "background": isCurrent()
            ? "var(--color-surface-secondary)"
            : "transparent",
          // ...
        }}
      >
        <Show when={isCompleted()} fallback={<Square size={16} />}>
          <Check size={16} />
        </Show>
        <span style={{
          "text-decoration": isCompleted() ? "line-through" : "none",
          color: isCompleted()
            ? "var(--color-text-secondary)"
            : "var(--color-text-primary)",
        }}>
          {step.label}
        </span>
      </button>
    );
  }}
</For>
```

**Critical SolidJS note:** Inside `<For>`, the item (`step`) is reactive when using `createStore`, but when using `createSignal<Step[]>`, the `step` argument is a plain snapshot value (not a reactive getter). This means `step.completed` will NOT auto-update in place — the entire array signal must change. Using `setSteps(prev => prev.map(...))` (Pattern 1) triggers `<For>` to re-run for changed items. [VERIFIED: SolidJS docs on `<For>` reconciliation behavior]

### Pattern 3: Conditional Component Swap — streaming → checklist (D-06)

The locked decision avoids a component "swap" in the sense of unmounting/remounting. Instead, both views coexist in the same panel and are gated by `<Show>`:

```tsx
// Source: CONTEXT.md D-06; consistent with existing Show usage in SidebarShell.tsx

{/* During streaming — SessionFeed with live text */}
<SessionFeed
  sessionHistory={sessionHistory()}
  streamingText={contentState() === "streaming" ? streamingText() : ""}
  ttsEnabled={ttsEnabled()}
  ref={(el) => { sessionFeedRef = el; }}
/>

{/* After done — StepChecklist or fallback below SessionFeed */}
<Show when={contentState() === "done"}>
  {steps().length > 0
    ? <StepChecklist steps={steps()} onToggle={toggleStep} />
    : <RawGuidanceText text={currentExchange()?.guidance ?? ""} />
  }
</Show>
```

This is the simplest pattern: `SessionFeed` always renders (showing prior history), but its `streamingText` goes to empty string once streaming ends. `StepChecklist` appears below it only in the "done" state. No teardown/re-mount transitions needed.

### Pattern 4: parseSteps — Compliance Check + Line Parsing (D-02)

```typescript
// Source: CONTEXT.md D-02 (exact algorithm specified)
// File: src/lib/parseSteps.ts

export interface Step {
  label: string;
  completed: boolean;
}

export function parseSteps(text: string): Step[] {
  // Compliance check: must start with "1." (after trimming leading whitespace)
  if (!text.trimStart().startsWith("1.")) return [];

  const steps: Step[] = [];
  const lines = text.split("\n").filter((l) => l.trim().length > 0);

  for (const line of lines) {
    const match = line.match(/^\d+\.\s+(.+)$/);
    if (match) {
      steps.push({ label: match[1].trim(), completed: false });
    }
    // Non-matching lines (code fences, blank lines filtered above) are skipped
  }

  return steps; // empty array = fallback to RawGuidanceText
}
```

**Regex edge cases verified:**
- `1. Open the terminal:` — matches, label = `"Open the terminal:"`; trailing colon is preserved in label
- `1. Run \`npm install\`` — matches, label = `"Run \`npm install\`"` (inline backtick preserved)
- `1. Click "File" → "New"` — matches; special chars in label are fine (regex capture is `.+`)
- `\`\`\`bash` — does NOT match (no leading digit); skipped correctly
- `  1. Indented step` — does NOT match due to `^` anchor; this is intentional (D-02 does not say to handle indented steps)
- Multi-word steps — match trivially (`.+` is greedy)

**Token budget impact (D-11):** The new system prompt is ~280 tokens vs the existing ~200 tokens — an increase of ~80 tokens. This is negligible relative to the 4096 token `max_tokens` limit and the screenshot image tokens (~800-1500 tokens). [ASSUMED: token count estimate from character count; exact count depends on tokenizer but order of magnitude is correct]

### Pattern 5: Code Fence + Command Copy Button Parsing (D-08)

Per D-08, copy buttons apply at the StepChecklist step label level. Each step's `label` string is scanned for:
1. Markdown fences (` ``` ` start/end blocks) — but step labels are single lines extracted from the guidance text. Code fences spanning multiple lines will NOT appear as a single step label.
2. Command-pattern lines — single-line heuristic regex.

**Important clarification about code fences:** The step regex `/^\d+\.\s+(.+)$/` only captures text on the same line as the step number. Multi-line code fences embedded in the guidance text will not be captured as part of a step label because:
- The fence opening ` ``` ` is on its own line (no leading `\d+\.`)
- Lines inside the fence have no leading number

This means the "code fence" copy button case in D-08 applies when Claude writes a step like:
```
1. Run the following:
```bash
npm install
```
```
In this case, the step label will be `"Run the following:"` and the fence content will be SKIPPED by the parser (no digit prefix). The copy button on this step label would use the command heuristic only.

**Planner note:** This is a potential gap between D-08 intent and actual behavior. The command heuristic (git, npm, npx, etc.) will cover the most common cases. Full multi-line fence parsing within steps would require a more complex parser that joins fence content to the preceding step — which is NOT in scope per CONTEXT.md. The planner should plan copy buttons based on the command heuristic only for Phase 10, and note the fence limitation in comments.

**Command heuristic (from D-08):**
```typescript
// Source: CONTEXT.md D-08
const COMMAND_PATTERN = /^(\$\s|git |npm |npx |yarn |pnpm |pip |python[23]?\s|node |cd |ls |mkdir |curl |brew |cargo |go |docker |kubectl )/;

function isCommandLine(line: string): boolean {
  return COMMAND_PATTERN.test(line.trim());
}
```

### Pattern 6: currentExchange Refactor — Exact Changes to SidebarShell.tsx (D-05)

**Lines to ADD:**
```typescript
// After sessionHistory signal declaration (line 74):
const [currentExchange, setCurrentExchange] = createSignal<SessionExchange | null>(null);
const [steps, setSteps] = createSignal<Step[]>([]);
```

**onDone callback — REPLACE existing logic:**
```typescript
onDone: () => {
  if (thisGen !== submitGen) return;
  if (contentState() === "loading") setContentState("streaming");

  // D-05: set currentExchange instead of pushing to sessionHistory
  const completedExchange: SessionExchange = {
    intent: lastIntent(),
    guidance: accumulatedText,
  };
  setCurrentExchange(completedExchange);

  // D-01, D-02: parse steps post-stream
  setSteps(parseSteps(accumulatedText));

  setContentState("done");

  // TTS and recordInteraction unchanged
  if (ttsEnabled()) playTts(accumulatedText).catch(() => {});
  if (ctx.taskLabel) {
    recordInteraction(ctx.taskLabel, intent, accumulatedText, ctx.tier, detectedApp() ?? undefined).catch(() => {});
  }
},
```

**submitIntent — ADD at top of function (after `const thisGen = ++submitGen`):**
```typescript
// D-05: move currentExchange to history before clearing for new response
// D-13: clear steps
if (currentExchange() !== null) {
  const prev = currentExchange()!;
  setSessionHistory((h) => {
    const updated = [...h, prev];
    return updated.length > 3 ? updated.slice(updated.length - 3) : updated;
  });
  setCurrentExchange(null);
}
setSteps([]);
```

**REMOVE from onDone:** The existing `setSessionHistory((prev) => { ... })` block (lines 362-367 of SidebarShell.tsx).

**handleNewTask — ADD:**
```typescript
setCurrentExchange(null);
setSteps([]);
```

**SessionFeed `<Show>` condition — UNCHANGED:** The existing `Show` condition at line 616 covers "done" state and remains correct. `SessionFeed` will render `sessionHistory()` (prior exchanges only) — `currentExchange` is NOT passed to it.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Icon rendering | Custom SVG checkbox/check icons | `lucide-solid` `Check`, `Square` | Already installed, tree-shaken, consistent with existing codebase (`X`, `Settings`, `Volume2` all use lucide-solid) |
| Clipboard write | Platform-specific Rust tauri_plugin_clipboard | `navigator.clipboard` + `execCommand` fallback | D-09 locks this; no plugin needed; silent fail is acceptable for copy UX |
| Step state management | `createStore` or reducer | `createSignal<Step[]>` with `map()` | Simpler, consistent with existing codebase conventions; no stores used anywhere in project |
| Markdown rendering | Full markdown library (marked, remark) | Targeted regex for fences + commands | Phase 10 only needs copy buttons, not full rendering; a markdown lib adds bundle weight with no UX benefit |

---

## Common Pitfalls

### Pitfall 1: SolidJS `<For>` item is a snapshot, not a reactive getter (with `createSignal`)
**What goes wrong:** If you write `{step.completed}` inside `<For each={steps()}>` where `steps` is a `createSignal`, changing `steps` via `setSteps(prev => prev.map(...))` re-runs `<For>` and re-creates the item callback — but only for changed items due to key-based reconciliation. If you attempt to mutate `step` directly (e.g., `step.completed = true`) without calling `setSteps`, the UI will not update.
**Why it happens:** `createSignal` arrays trigger full reconciliation on change; item values are plain JS objects, not reactive proxies.
**How to avoid:** Always call `setSteps(prev => prev.map((s, i) => i === index ? {...s, completed: !s.completed} : s))`. Never mutate the step object in-place.
**Warning signs:** Toggle click has no visual effect; `console.log(steps())` shows the old values.

### Pitfall 2: navigator.clipboard requires secure context AND document focus
**What goes wrong:** `navigator.clipboard.writeText()` throws `DOMException: NotAllowedError` or returns a rejected promise in two situations: (1) the page is not in a secure context (https or localhost), and (2) the document does not have focus when called.
**Why it happens:** Browsers/WebViews gate clipboard access on user-gesture + document focus. The Tauri sidebar panel may lose focus when the user is clicking content in the AI guidance view. GitHub issue #12007 confirms that `navigator.clipboard` in Tauri macOS WebView triggers permission prompts in some configurations.
**How to avoid:** The `try/catch` + `execCommand` fallback in D-09 handles both cases. The `execCommand` path uses a temporary off-screen textarea — this works even without document focus because `el.select()` + `document.execCommand('copy')` only needs the element to be in the DOM. **Critical:** wrap the entire fallback in its own `try/catch` for silent fail when both paths fail.
**Warning signs:** Copy button appears to do nothing; console shows `DOMException: NotAllowedError`.

### Pitfall 3: Compliance check too strict — rejects valid Claude output
**What goes wrong:** The check `text.trimStart().startsWith("1.")` will reject responses where Claude emits a newline before the first step (e.g., `"\n1. Open terminal"`).
**Why it happens:** Some LLM responses begin with a `\n` or `\r\n` before the first content line even when instructed not to.
**How to avoid:** `text.trimStart().startsWith("1.")` correctly handles this because `trimStart()` removes leading whitespace including newlines. The regex match `/^\d+\.\s+(.+)$/` also uses `^` which in the line-by-line split correctly anchors to line start. This is already correct in D-02.
**Warning signs:** Checklist never appears even when Claude returns correctly formatted steps.

### Pitfall 4: Steps signal not cleared before new response shows StepChecklist
**What goes wrong:** If `setSteps([])` is called in `onDone` (new response) instead of at the start of `submitIntent`, there is a brief flash where the old checklist from the previous response appears before the new one replaces it.
**Why it happens:** `onDone` fires asynchronously at the end of the stream; the old `steps` signal still holds the previous response's data while the new response is loading and streaming.
**How to avoid:** Per D-13, `steps` is reset in `submitIntent` (before streaming begins), not in `onDone`. The current design already handles this correctly — just don't move the reset.
**Warning signs:** Previous step list visible briefly during loading state.

### Pitfall 5: currentExchange not moved to history on retry/re-submit
**What goes wrong:** When the user retries (via `handleRetry`) or re-submits from `handleShowFullSteps`, the current `currentExchange` is silently discarded because both call `submitIntent` which only moves `currentExchange` to history if it was set — but `handleRetry` can be called when `contentState() === "error"` where `currentExchange` is null. This is fine. However, if the user retries a completed response (e.g., clicks Retry after a successful response for some reason), `currentExchange` should be moved to history before the re-submit.
**Why it happens:** `submitIntent` moves `currentExchange` to history at the top — this handles the case correctly. The check `if (currentExchange() !== null)` before moving prevents null errors.
**How to avoid:** The D-05 pattern already handles this correctly (the null guard covers the error-state retry case). No additional work needed.

---

## Code Examples

### StepChecklist Component Skeleton
```typescript
// src/components/StepChecklist.tsx
// Source: CONTEXT.md D-10 + SolidJS For pattern
import { For, Show } from "solid-js";
import { Check, Square, Clipboard } from "lucide-solid";
import type { Step } from "../lib/parseSteps";

interface StepChecklistProps {
  steps: Step[];
  onToggle: (index: number) => void;
}

async function copyToClipboard(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    try {
      const el = document.createElement("textarea");
      el.value = text;
      el.style.position = "fixed";
      el.style.opacity = "0";
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
    } catch {
      // Silent fail — copy is optional UX
    }
  }
}

export function StepChecklist(props: StepChecklistProps) {
  const currentIndex = () => props.steps.findIndex((s) => !s.completed);

  return (
    <div
      aria-label="Step checklist"
      aria-live="polite"
      style={{ display: "flex", "flex-direction": "column", gap: "var(--space-xs)" }}
    >
      <For each={props.steps}>
        {(step, index) => {
          const isCurrent = () => index() === currentIndex();
          const isCompleted = () => step.completed;
          // Command heuristic for copy button
          const COMMAND_RE = /^(\$\s|git |npm |npx |yarn |pnpm |pip |python[23]?\s|node |cd |ls |mkdir |curl |brew |cargo |go |docker |kubectl )/;
          const showCopy = () => COMMAND_RE.test(step.label.trim());

          return (
            <button
              onClick={() => props.onToggle(index())}
              aria-label={`Step ${index() + 1}: ${step.label}`}
              style={{
                "min-height": "44px",
                "border-left": isCurrent()
                  ? "3px solid var(--color-accent)"
                  : "3px solid transparent",
                background: isCurrent()
                  ? "var(--color-surface-secondary)"
                  : "transparent",
                display: "flex",
                "align-items": "flex-start",
                gap: "var(--space-sm)",
                padding: `var(--space-xs) var(--space-sm)`,
                border: "none",
                cursor: "pointer",
                width: "100%",
                "text-align": "left",
              }}
            >
              <span style={{ "flex-shrink": "0", "padding-top": "2px" }}>
                <Show when={isCompleted()} fallback={<Square size={16} />}>
                  <Check size={16} color="var(--color-accent)" />
                </Show>
              </span>
              <span
                style={{
                  flex: "1",
                  "font-size": "var(--font-size-body)",
                  "line-height": "var(--line-height-body)",
                  color: isCompleted()
                    ? "var(--color-text-secondary)"
                    : "var(--color-text-primary)",
                  "text-decoration": isCompleted() ? "line-through" : "none",
                  "white-space": "pre-wrap",
                  "word-break": "break-word",
                }}
              >
                {step.label}
              </span>
              <Show when={showCopy()}>
                <button
                  onClick={(e) => { e.stopPropagation(); copyToClipboard(step.label.trim()); }}
                  aria-label="Copy command"
                  title="Copy"
                  style={{
                    border: "none",
                    background: "transparent",
                    cursor: "pointer",
                    color: "var(--color-text-secondary)",
                    "flex-shrink": "0",
                    "min-height": "44px",
                    "min-width": "36px",
                    display: "flex",
                    "align-items": "center",
                    "justify-content": "center",
                    padding: "0",
                  }}
                >
                  <Clipboard size={14} />
                </button>
              </Show>
            </button>
          );
        }}
      </For>
    </div>
  );
}
```

### parseSteps Utility
```typescript
// src/lib/parseSteps.ts
// Source: CONTEXT.md D-02
export interface Step {
  label: string;
  completed: boolean;
}

export function parseSteps(text: string): Step[] {
  if (!text.trimStart().startsWith("1.")) return [];

  const steps: Step[] = [];
  const lines = text.split("\n").filter((l) => l.trim().length > 0);

  for (const line of lines) {
    const match = line.match(/^\d+\.\s+(.+)$/);
    if (match) {
      steps.push({ label: match[1].trim(), completed: false });
    }
  }

  return steps;
}
```

### New System Prompt (RESP-01)
```typescript
// src/lib/ai.ts — replace SYSTEM_PROMPT constant
// Source: CONTEXT.md D-11
export const SYSTEM_PROMPT = `You are a task execution assistant.

STRICT RULES:
- Start your response with "1." on the FIRST LINE.
- Do NOT include any intro sentence.
- Do NOT describe the screen.
- Do NOT explain context.
- ONLY output numbered steps.

Each step must:
- Begin with its number followed by a period (1., 2., etc.)
- Contain exactly ONE actionable instruction
- Reference visible UI elements by label, color, and position: "Click the blue 'New' button in the top-left toolbar"
- Use a markdown code block (\`\`\`) for any terminal command or code snippet

If the user's intent is vague, ask ONE clarifying question as step 1 instead of guessing.
If a step requires waiting (loading, processing), say so in that step.`;
```

Tier suffix, `appContext`, and `memoryContext` injection in `streamGuidance` are **unchanged**.

---

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| Flat streaming text persists as final view | Post-stream checklist replaces flat text | User can track progress + copy commands |
| `sessionHistory` holds all exchanges including current | `currentExchange` signal separate from `sessionHistory` | Eliminates duplicate rendering in "done" state |
| System prompt gives numbered steps as guideline | Strict system prompt with "1. on first line" hard rule | Higher compliance rate for step parsing |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `createSignal<Step[]>` + `map()` is adequate for ~10-20 steps; `createStore` adds no practical benefit | Architecture Patterns §1 | If steps array grows very large (unlikely), store would be more efficient — low risk |
| A2 | New system prompt token cost ~80 tokens more than existing | Architecture Patterns §4 | Negligible impact; only risk is if total prompt already near context limit (it isn't) |
| A3 | `execCommand('copy')` remains functional in Tauri WebView macOS (it is deprecated in browsers but not removed from WebKit) | Common Pitfalls §2 | If WebKit removes `execCommand('copy')`, the fallback silently fails — acceptable per D-09 |
| A4 | Code fence content inside guidance will not appear as step labels (multi-line fences are skipped by parser) | Architecture Patterns §5 | Expected behavior — matches D-08 intent for single-line command heuristic copy |

---

## Open Questions

1. **navigator.clipboard on macOS Tauri — permission prompt frequency**
   - What we know: GitHub issue #12007 (open) indicates `navigator.clipboard` can trigger a macOS permission dialog in Tauri WebViews
   - What's unclear: Whether `writeText` specifically (vs `read`) triggers the prompt; the issue title says "native webview clipboard methods" which may include both read and write
   - Recommendation: The `execCommand` fallback (D-09) avoids the permission prompt entirely because it uses DOM selection, not the Clipboard API. Plan the `execCommand` path as primary for testing, with `navigator.clipboard` as the first-try. If prompts appear in testing, the fallback already handles it silently.

2. **`<For>` reconciliation when steps array is replaced wholesale**
   - What we know: SolidJS `<For>` uses key-based reconciliation; when the array is replaced (new response), it will unmount all old items and mount new ones
   - What's unclear: Whether there will be a visible flash when `steps` goes from previous response's array to `[]` (cleared in `submitIntent`) and then `onDone` sets a new array
   - Recommendation: This is fine — between `submitIntent` clearing `steps` and `onDone` setting new ones, `contentState` is `"loading"` or `"streaming"`, so `<Show when={contentState() === "done"}>` gates the checklist from rendering during that window. No flash.

---

## Environment Availability

Step 2.6: SKIPPED — Phase 10 is purely frontend TypeScript/SolidJS changes with no new external tools, CLIs, services, or runtimes beyond what the existing Vite/Tauri dev environment provides.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | None detected (no vitest.config, no jest.config, no test/ directory) |
| Config file | None — Wave 0 gap |
| Quick run command | Manual browser test via `cargo tauri dev` |
| Full suite command | Manual browser test via `cargo tauri dev` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| STEP-01 | Steps render as checklist with highlight | manual-smoke | `cargo tauri dev` → submit intent → verify checklist appears | ❌ Wave 0 |
| STEP-02 | Click any step to toggle completed | manual-smoke | `cargo tauri dev` → click step → verify toggle non-linear | ❌ Wave 0 |
| STEP-03 | Steps reset on new response | manual-smoke | `cargo tauri dev` → submit twice → verify steps cleared | ❌ Wave 0 |
| RESP-01 | Response starts with 1. on first line | manual-smoke | `cargo tauri dev` → submit intent → verify no preamble | ❌ Wave 0 |
| RESP-02 | Copy button on commands | manual-smoke | `cargo tauri dev` → click copy → verify clipboard | ❌ Wave 0 |
| RESP-03 | One action per step | manual-smoke (LLM behavior) | Verify via prompt compliance in dev | ❌ Wave 0 |

**Unit-testable:** `parseSteps()` in `src/lib/parseSteps.ts` is a pure function — ideal for a unit test. The planner should include a Wave 0 task to add a test file (even a simple Vitest setup) to cover edge cases:
- Compliance check: text not starting with "1." returns `[]`
- Steps with colons/inline code pass through correctly
- Empty result triggers fallback
- Non-step lines (code fences) are skipped

### Sampling Rate
- **Per task commit:** Manual `cargo tauri dev` smoke test
- **Per wave merge:** Full manual smoke — all 6 requirements verified interactively
- **Phase gate:** All 6 requirements pass before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `src/lib/parseSteps.test.ts` — unit tests for `parseSteps()` pure function (covers STEP-01/STEP-03 compliance check path)
- [ ] Vitest config (optional but recommended): `vitest.config.ts` if unit tests are added

*(parseSteps is the only unit-testable new module; all other requirements require UI interaction)*

---

## Security Domain

> `security_enforcement` not explicitly set to false — treating as enabled.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | N/A — no auth changes in this phase |
| V3 Session Management | No | Session history remains in-memory signal only (D-10 from Phase 9, unchanged) |
| V4 Access Control | No | N/A |
| V5 Input Validation | Minimal | System prompt injection risk: `appContext` and `memoryContext` are injected into the system prompt. Phase 8 already trims/caps `app_name` at 100 chars (existing mitigation in place). `parseSteps` input is the AI response — no user-controlled input. |
| V6 Cryptography | No | Clipboard write is plaintext — no encryption needed |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Prompt injection via app name | Tampering | Already mitigated: app_name trimmed + capped at 100 chars in Phase 8 |
| Clipboard content exposure | Information Disclosure | Only copies content the user is explicitly clicking to copy from visible guidance — acceptable |
| XSS via step label rendering | Tampering | SolidJS JSX renders text content as text nodes (not innerHTML) — `step.label` as `{step.label}` is safe |

**XSS safety note:** All step label content in `StepChecklist` must be rendered as `{step.label}` text interpolation (which SolidJS escapes), never `innerHTML`. Copy button content is also a plain string passed to `clipboard.writeText`. No `innerHTML` usage anywhere in the component. [VERIFIED: existing codebase uses the same pattern — no innerHTML in any component]

---

## Sources

### Primary (HIGH confidence)
- Local codebase inspection — `SidebarShell.tsx`, `SessionFeed.tsx`, `GuidanceList.tsx`, `ai.ts` — confirmed current implementation details
- Local `node_modules/lucide-solid` CJS bundle grep — confirmed `Check`, `Square`, `Clipboard`, `ClipboardCopy` icons exported in v1.8.0
- CONTEXT.md Phase 10 decisions — all locked decisions verified

### Secondary (MEDIUM confidence)
- [SolidJS `<For>` docs](https://docs.solidjs.com/concepts/control-flow/for) — item reactivity behavior with `createSignal` arrays
- [SolidJS `createSignal` docs](https://docs.solidjs.com/reference/basic-reactivity/create-signal) — signal update triggers re-render
- [Tauri issue #12007](https://github.com/tauri-apps/tauri/issues/12007) — `navigator.clipboard` security prompt in Tauri WebView

### Tertiary (LOW confidence — or ASSUMED)
- Token count estimate for new system prompt — character-length based, not tokenizer verified
- `execCommand('copy')` WebKit deprecation status — assumed still functional based on known MDN status

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries verified installed and version-confirmed locally
- Architecture: HIGH — locked decisions in CONTEXT.md; patterns match existing codebase conventions
- Pitfalls: MEDIUM — clipboard WebView behavior has one known open issue (GitHub #12007); handled by fallback

**Research date:** 2026-04-12
**Valid until:** 2026-05-12 (stable domain; SolidJS and lucide-solid APIs are not fast-moving)
