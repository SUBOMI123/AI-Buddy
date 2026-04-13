/**
 * D-02: Step data shape and parser.
 * Steps are parsed post-stream at onDone only — never during streaming (D-01).
 */
export interface Step {
  label: string;    // step text stripped of number prefix, e.g. "Click the File menu"
  completed: boolean;
}

/**
 * 260413-1x7: Result type returned by parseSteps.
 * title is the extracted "Task: ..." phrase (empty string when absent).
 */
export interface ParseResult {
  steps: Step[];
  title: string;
}

/**
 * Parse a completed guidance text into { steps, title }.
 *
 * Algorithm (D-02 + 260413-1x7):
 * 1. Extract optional "Task: ..." line at the start. If present, capture phrase as title
 *    and remove that line before further processing.
 * 2. Compliance check: if remaining text.trimStart() does not start with "1.", return { steps: [], title }
 *    — caller falls back to RawGuidanceText (D-06a)
 * 3. Split text by "\n", filter empty/whitespace-only lines
 * 4. For each line, match /^\d+\.\s+(.+)$/ — extract capture group as label
 * 5. Non-matching lines (code fences, blank lines) are skipped
 * 6. If result array is empty after parsing, return { steps: [], title } (triggers same fallback)
 */
export function parseSteps(text: string): ParseResult {
  let title = "";
  let remaining = text;

  // 260413-1x7: Extract "Task: ..." line if it appears at the very start of the response
  const taskLineMatch = remaining.trimStart().match(/^Task:\s+(.+?)(?:\n|$)/);
  if (taskLineMatch) {
    title = taskLineMatch[1].trim();
    // Remove the Task: line from remaining text (keep everything after the first newline)
    const newlineIdx = remaining.indexOf("\n");
    remaining = newlineIdx !== -1 ? remaining.slice(newlineIdx + 1) : "";
  }

  // Compliance check (D-02) — on remaining text after stripping Task: line
  if (!remaining.trimStart().startsWith("1. ")) return { steps: [], title };

  const steps: Step[] = [];
  const lines = remaining.split("\n").filter((l) => l.trim().length > 0);

  for (const line of lines) {
    const match = line.match(/^\d+\.\s+(.+)$/);
    if (match) {
      steps.push({ label: match[1].trim(), completed: false });
    }
    // Non-matching lines (code fences, blank lines filtered above) are skipped
  }

  // If empty after parse, return { steps: [], title } — triggers RawGuidanceText fallback (D-02)
  return { steps, title };
}

/**
 * Returns true when parseSteps produced exactly one step whose label ends with "?".
 * This heuristic detects clarifying question responses from the AI so the caller
 * can render prose (RawGuidanceText) instead of StepChecklist.
 *
 * Note: this function must only be called AFTER parseSteps — do not call on raw text.
 */
export function isClarifyingQuestion(steps: Step[]): boolean {
  return steps.length === 1 && steps[0].label.trimEnd().endsWith("?");
}
