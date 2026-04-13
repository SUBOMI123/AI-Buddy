---
phase: 10-step-tracking-response-quality
type: context
created: 2026-04-12
---

# Phase 10 Context: Step Tracking + Response Quality

## Locked Decisions

### D-01: Step parse timing — post-stream only
Steps are parsed from the completed guidance text at `onDone`, not during streaming.
- During streaming (`contentState === "streaming"`): render flat text (existing behavior via SessionFeed)
- At `onDone`: parse `accumulatedText` with `/^\d+\.\s+(.+)$/` per line → produce `Step[]` → transition to checklist view
- **Rationale:** Avoids partial-step edge cases when step number arrives before its text. Simpler state management. Checklist appears all-at-once as a coherent view.

### D-02: Step data shape
```typescript
export interface Step {
  label: string;    // step text stripped of number prefix, e.g. "Click the File menu"
  completed: boolean;
}
```
Steps live in a new `steps` signal in SidebarShell: `createSignal<Step[]>([])`.

Parser function (shared utility, can live in `src/lib/parseSteps.ts`):
- **Compliance check first:** if `accumulatedText.trimStart()` does not start with `"1."`, return `[]` immediately — caller falls back to `RawGuidanceText` (D-06a)
- Split text by `\n`, filter non-empty lines
- Match `/^\d+\.\s+(.+)$/` → extract capture group as `label`, `completed: false`
- Skip non-matching lines (code blocks, blank lines)
- If result array is empty after parsing, also return `[]` (triggers same fallback)

### D-03: Current step definition
"Current step" = first item in `steps` where `completed === false`.
Highlighted with a left-border stripe using `--color-accent` (3px solid). All completed steps render with secondary color + check icon. Uncompleted non-current steps render in primary color without highlight.

### D-04: Non-linear step execution (STEP-02)
Clicking any step item toggles its `completed` state (true → false, false → true). No enforced linear order. The "current" highlight auto-advances to the first uncompleted item after each toggle.

### D-05: Session history refactor — separate currentExchange from sessionHistory
Phase 9 immediately adds the completed exchange to `sessionHistory` in `onDone`. Phase 10 separates these concerns to avoid duplicate rendering:

- Add new signal: `currentExchange: SessionExchange | null` (`createSignal<SessionExchange | null>(null)`)
- `onDone`: sets `currentExchange` + parses `steps` — does NOT touch `sessionHistory`
- `submitIntent` (at start of each new call): if `currentExchange()` is non-null, move it to `sessionHistory` (with 3-turn cap), then clear `currentExchange` to null and `steps` to `[]`
- `handleNewTask`: clear both `currentExchange` and `sessionHistory` (and `steps`)
- **Why:** eliminates the need to slice the last history item out of SessionFeed when StepChecklist is displayed below it

### D-06: Rendering layout — StepChecklist below SessionFeed
```
TaskHeaderStrip       (when lastIntent is set)
SessionFeed           (prior sessionHistory — flat muted text, empty streamingText when "done")
  └─ active streaming (streamingText — only when contentState === "streaming")
StepChecklist         (when contentState === "done" && steps.length > 0)
Input bar
```

- SessionFeed receives `streamingText` only when `contentState === "streaming"`, empty string otherwise
- SessionFeed receives `sessionHistory` (prior exchanges only — NOT currentExchange)
- StepChecklist sits below SessionFeed — but always rendered when `contentState === "done"`, not gated on `steps.length`:
  ```tsx
  <Show when={contentState() === "done"}>
    {steps().length > 0 ? <StepChecklist ... /> : <RawGuidanceText text={currentExchange()?.guidance ?? ""} />}
  </Show>
  ```
  **Rationale (D-06a):** If step parsing fails (Claude emits non-compliant format), the user must never see an empty panel. `RawGuidanceText` is a simple flat-text fallback rendering `guidance` as unstyled paragraph lines — same approach as SessionFeed's prior exchange rendering.
- Loading dots (first query): still shown when `contentState === "loading" && sessionHistory().length === 0`

### D-07: Prior session history display — flat text (Phase 9 behavior unchanged)
Prior exchanges in `sessionHistory` render as flat muted text in SessionFeed. No checklist, no copy buttons on history items in Phase 10. Deferred: copy buttons on historical guidance can be added in a future phase.

### D-08: Copy button scope — code fences + command heuristics
Two patterns get inline copy buttons in the StepChecklist:
1. **Markdown code fences**: blocks starting with `` ``` `` and ending with `` ``` `` → copy the full block content (without fence delimiters)
2. **Command-like lines**: lines matching `/^(\$\s|git |npm |npx |yarn |pnpm |pip |python[23]?\s|node |cd |ls |mkdir |curl |brew |cargo |go |docker |kubectl )/` → copy the single line

Copy button: small `<Clipboard>` icon from `lucide-solid`, appearing to the right of the code block or command line.

For StepChecklist rendering: each step's label is parsed for these patterns. If any match, the copy button is rendered inline after the matching text.

### D-09: Clipboard API — navigator.clipboard with execCommand fallback
```typescript
async function copyToClipboard(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // Fallback for unfocused window or restricted macOS context
    const el = document.createElement("textarea");
    el.value = text;
    el.style.position = "fixed";
    el.style.opacity = "0";
    document.body.appendChild(el);
    el.select();
    document.execCommand("copy");
    document.body.removeChild(el);
  }
}
```
No Tauri clipboard plugin required. `execCommand` is deprecated but remains functional in Tauri WebView and is the standard fallback. Silent fail if both paths error — clipboard is optional UX, never blocking.

### D-10: StepChecklist — new component at src/components/StepChecklist.tsx
```typescript
interface StepChecklistProps {
  steps: Step[];
  onToggle: (index: number) => void;
}
```
The component:
- Iterates steps with `<For each={props.steps}>`
- Renders each step as a row: [check icon] [step label text with inline copy buttons] 
- `Check` icon (lucide-solid) for completed, `Square` icon for incomplete
- Current step (first uncompleted): left border `3px solid var(--color-accent)`, slight bg tint
- Completed steps: `--color-text-secondary` + `text-decoration: line-through` on label
- Each step row is `min-height: 44px` (accessibility)
- `aria-label="Step N: [label]"` on each row button
- Container: `aria-label="Step checklist"`, `aria-live="polite"`

### D-11: System prompt replacement (RESP-01)
Replace the `SYSTEM_PROMPT` constant in `src/lib/ai.ts`:
```
You are a task execution assistant.

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
- Use a markdown code block (```) for any terminal command or code snippet

If the user's intent is vague, ask ONE clarifying question as step 1 instead of guessing.
If a step requires waiting (loading, processing), say so in that step.
```

Keep the tier suffix logic, `appContext` injection, and `memoryContext` injection unchanged — they append to this new base.

### D-12: RESP-03 — one action per step
Enforced via system prompt instruction. No UI-level enforcement or post-processing.

### D-13: Step reset on new response (STEP-03)
`steps` resets to `[]` at the start of `submitIntent` (same moment `currentExchange` is moved to history). No "continue previous steps" opt-out in Phase 10 scope.

## Deferred Ideas

- **Task header visual upgrade**: User requested "Working on: [task]" label with a prominent `[New Task]` button (vs current text link under the label). Defer to Phase 11 (ACTN-* requirements / Action-First UI).
- **Input bar context hint**: "Continue this task..." placeholder when a session is active. Phase 11.
- **Copy buttons on prior history**: RESP-02 could apply to historical guidance in SessionFeed. Phase 11.
- **Settings screen progress view**: Visual progress bars, trend data, "Areas to improve." Phase 5/6 backlog.
- **TTS per step**: Read each step aloud as the user checks it off. Phase 11+.
- **RESP-01 post-process strip**: Stripping preamble if Claude ignores the strict prompt. Not needed now — trust the explicit prompt. Add if quality issues emerge in testing.

## Open Questions

None. All gray areas resolved for Phase 10.
