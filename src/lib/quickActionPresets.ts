/**
 * Quick action preset prompt strings (D-03).
 * "Ask" is NOT a preset — it focuses the text input (UI action only).
 */
export const QUICK_PRESETS: Record<string, string> = {
  Fix: "Fix the issue shown in the screenshot",
  Explain: "Explain what's happening in the screenshot",
  Optimize: "How can I improve or optimize what's shown",
};

/**
 * Suffix appended by buildTryAnotherPrompt to request a different approach.
 * Uses em-dash (\u2014), not a hyphen.
 */
export const TRY_ANOTHER_SUFFIX =
  " \u2014 suggest a meaningfully different approach than before";

/**
 * Returns base + TRY_ANOTHER_SUFFIX, stripping a prior suffix first to prevent compounding.
 * If base already contains TRY_ANOTHER_SUFFIX, it is stripped before re-appending — so
 * calling buildTryAnotherPrompt twice produces the same result as calling it once.
 */
export function buildTryAnotherPrompt(base: string): string {
  const stripped = base.replace(TRY_ANOTHER_SUFFIX, "");
  return stripped + TRY_ANOTHER_SUFFIX;
}
