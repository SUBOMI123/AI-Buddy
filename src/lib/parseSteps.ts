/**
 * D-02: Step data shape and parser.
 * Steps are parsed post-stream at onDone only — never during streaming (D-01).
 */
export interface Step {
  label: string;    // step text stripped of number prefix, e.g. "Click the File menu"
  completed: boolean;
}

/**
 * Parse a completed guidance text into Step[].
 *
 * Algorithm (D-02):
 * 1. Compliance check: if text.trimStart() does not start with "1.", return []
 *    — caller falls back to RawGuidanceText (D-06a)
 * 2. Split text by "\n", filter empty/whitespace-only lines
 * 3. For each line, match /^\d+\.\s+(.+)$/ — extract capture group as label
 * 4. Non-matching lines (code fences, blank lines) are skipped
 * 5. If result array is empty after parsing, return [] (triggers same fallback)
 */
export function parseSteps(text: string): Step[] {
  // Compliance check first (D-02)
  if (!text.trimStart().startsWith("1. ")) return [];

  const steps: Step[] = [];
  const lines = text.split("\n").filter((l) => l.trim().length > 0);

  for (const line of lines) {
    const match = line.match(/^\d+\.\s+(.+)$/);
    if (match) {
      steps.push({ label: match[1].trim(), completed: false });
    }
    // Non-matching lines (code fences, blank lines filtered above) are skipped
  }

  // If empty after parse, return [] — triggers RawGuidanceText fallback (D-02)
  return steps;
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
