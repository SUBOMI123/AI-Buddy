import { describe, it, expect } from "vitest";
import { QUICK_PRESETS, TRY_ANOTHER_SUFFIX, buildTryAnotherPrompt } from "./quickActionPresets";

describe("QUICK_PRESETS", () => {
  it('QUICK_PRESETS["Fix"] equals exact D-03 preset string', () => {
    expect(QUICK_PRESETS["Fix"]).toBe("Fix the issue shown in the screenshot");
  });

  it('QUICK_PRESETS["Explain"] equals exact D-03 preset string', () => {
    expect(QUICK_PRESETS["Explain"]).toBe("Explain what's happening in the screenshot");
  });

  it('QUICK_PRESETS["Optimize"] equals exact D-03 preset string', () => {
    expect(QUICK_PRESETS["Optimize"]).toBe("How can I improve or optimize what's shown");
  });

  it('QUICK_PRESETS does NOT have an "Ask" key (Ask is a UI action, not a preset prompt)', () => {
    expect(Object.prototype.hasOwnProperty.call(QUICK_PRESETS, "Ask")).toBe(false);
  });
});

describe("TRY_ANOTHER_SUFFIX", () => {
  it("TRY_ANOTHER_SUFFIX contains an em-dash (\\u2014), not a hyphen", () => {
    // em-dash = \u2014, hyphen = \u002D
    expect(TRY_ANOTHER_SUFFIX).toContain("\u2014");
    expect(TRY_ANOTHER_SUFFIX).not.toContain(" - ");
  });

  it("TRY_ANOTHER_SUFFIX equals the exact suffix string", () => {
    expect(TRY_ANOTHER_SUFFIX).toBe(
      " \u2014 suggest a meaningfully different approach than before"
    );
  });
});

describe("buildTryAnotherPrompt", () => {
  it("appends TRY_ANOTHER_SUFFIX when base does NOT already contain it", () => {
    const base = "Fix the issue shown in the screenshot";
    const result = buildTryAnotherPrompt(base);
    expect(result).toBe(
      "Fix the issue shown in the screenshot \u2014 suggest a meaningfully different approach than before"
    );
  });

  it("does NOT double the suffix when called with an already-suffixed string (anti-compounding)", () => {
    const base = "Fix the issue shown in the screenshot";
    const suffixed = buildTryAnotherPrompt(base);
    const doubleCalled = buildTryAnotherPrompt(suffixed);
    // Both calls should produce the same result — no compounding
    expect(doubleCalled).toBe(suffixed);
    // Specifically: the suffix must appear exactly once
    const occurrences = doubleCalled.split(TRY_ANOTHER_SUFFIX).length - 1;
    expect(occurrences).toBe(1);
  });

  it("calling buildTryAnotherPrompt with already-suffixed base returns same result as unsuffixed base", () => {
    const base = "Explain what's happening in the screenshot";
    const once = buildTryAnotherPrompt(base);
    const twice = buildTryAnotherPrompt(once);
    expect(twice).toBe(once);
  });

  it("handles empty string base — returns suffix (with or without leading space — document chosen behavior)", () => {
    // When base is "", stripped is also ""; result is "" + TRY_ANOTHER_SUFFIX
    // Chosen behavior: returns TRY_ANOTHER_SUFFIX unchanged (leading space preserved)
    const result = buildTryAnotherPrompt("");
    expect(result).toBe(TRY_ANOTHER_SUFFIX);
  });
});
