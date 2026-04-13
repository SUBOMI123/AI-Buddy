import { describe, it, expect } from "vitest";
import { parseSteps } from "./parseSteps";

describe("parseSteps", () => {
  // Case 1: Compliance check — text not starting with "1." returns []
  it("returns [] when text does not start with '1.'", () => {
    expect(parseSteps("Here are your steps:\n1. Click the button")).toEqual([]);
    expect(parseSteps("")).toEqual([]);
    expect(parseSteps("Step 1: do something")).toEqual([]);
  });

  // Case 2: Standard case — two numbered steps
  it("parses a standard numbered list into Step[]", () => {
    const result = parseSteps("1. Click the button\n2. Save the file");
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ label: "Click the button", completed: false });
    expect(result[1]).toEqual({ label: "Save the file", completed: false });
  });

  // Case 3: Step with trailing colon
  it("preserves trailing colon in step label", () => {
    const result = parseSteps("1. Open terminal:");
    expect(result).toHaveLength(1);
    expect(result[0].label).toBe("Open terminal:");
  });

  // Case 4: Non-step lines (code fence) are skipped; compliant steps extracted
  it("skips non-step lines like code fences", () => {
    const text =
      "1. Run the install command:\n```bash\nnpm install\n```\n2. Start the server";
    const result = parseSteps(text);
    // Only the numbered step lines match; fence lines are skipped
    expect(result).toHaveLength(2);
    expect(result[0].label).toBe("Run the install command:");
    expect(result[1].label).toBe("Start the server");
  });

  // Case 5: Empty / whitespace-only text returns []
  it("returns [] for empty or whitespace-only input", () => {
    expect(parseSteps("")).toEqual([]);
    expect(parseSteps("   \n\n  ")).toEqual([]);
  });

  // Additional edge: result array is empty after parsing (all lines non-matching) returns []
  it("returns [] when text starts with '1.' but no lines match the step regex", () => {
    // Edge: trimStart() starts with "1." but all content is code fence lines
    // This tests the "empty after parse" fallback path from D-02
    const result = parseSteps("1.\n```bash\necho hello\n```");
    // "1." line itself doesn't match /^\d+\.\s+(.+)$/ (no text after the space)
    expect(result).toEqual([]);
  });

  // All steps default to completed: false
  it("all returned steps have completed: false", () => {
    const result = parseSteps("1. Step one\n2. Step two\n3. Step three");
    expect(result.every((s) => s.completed === false)).toBe(true);
  });
});
