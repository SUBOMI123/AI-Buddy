import { describe, it, expect } from "vitest";
import { parseSteps, isClarifyingQuestion } from "./parseSteps";

describe("parseSteps", () => {
  // Case 1: Compliance check — text not starting with "1." returns []
  it("returns [] when text does not start with '1.'", () => {
    const { steps: s1 } = parseSteps("Here are your steps:\n1. Click the button");
    expect(s1).toEqual([]);
    const { steps: s2 } = parseSteps("");
    expect(s2).toEqual([]);
    const { steps: s3 } = parseSteps("Step 1: do something");
    expect(s3).toEqual([]);
  });

  // Case 2: Standard case — two numbered steps
  it("parses a standard numbered list into Step[]", () => {
    const { steps } = parseSteps("1. Click the button\n2. Save the file");
    expect(steps).toHaveLength(2);
    expect(steps[0]).toEqual({ label: "Click the button", completed: false });
    expect(steps[1]).toEqual({ label: "Save the file", completed: false });
  });

  // Case 3: Step with trailing colon
  it("preserves trailing colon in step label", () => {
    const { steps } = parseSteps("1. Open terminal:");
    expect(steps).toHaveLength(1);
    expect(steps[0].label).toBe("Open terminal:");
  });

  // Case 4: Non-step lines (code fence) are skipped; compliant steps extracted
  it("skips non-step lines like code fences", () => {
    const text =
      "1. Run the install command:\n```bash\nnpm install\n```\n2. Start the server";
    const { steps } = parseSteps(text);
    // Only the numbered step lines match; fence lines are skipped
    expect(steps).toHaveLength(2);
    expect(steps[0].label).toBe("Run the install command:");
    expect(steps[1].label).toBe("Start the server");
  });

  // Case 5: Empty / whitespace-only text returns []
  it("returns [] for empty or whitespace-only input", () => {
    const { steps: s1 } = parseSteps("");
    expect(s1).toEqual([]);
    const { steps: s2 } = parseSteps("   \n\n  ");
    expect(s2).toEqual([]);
  });

  // Additional edge: result array is empty after parsing (all lines non-matching) returns []
  it("returns [] when text starts with '1.' but no lines match the step regex", () => {
    // Edge: trimStart() starts with "1." but all content is code fence lines
    // This tests the "empty after parse" fallback path from D-02
    const { steps } = parseSteps("1.\n```bash\necho hello\n```");
    // "1." line itself doesn't match /^\d+\.\s+(.+)$/ (no text after the space)
    expect(steps).toEqual([]);
  });

  // All steps default to completed: false
  it("all returned steps have completed: false", () => {
    const { steps } = parseSteps("1. Step one\n2. Step two\n3. Step three");
    expect(steps.every((s) => s.completed === false)).toBe(true);
  });

  it("preserves inline backtick commands within step label", () => {
    const { steps } = parseSteps("1. List branches: `git branch`\n2. Switch to main: `git checkout main`");
    expect(steps).toHaveLength(2);
    expect(steps[0].label).toBe("List branches: `git branch`");
    expect(steps[1].label).toBe("Switch to main: `git checkout main`");
  });

  // 260413-1x7: New tests for Task: line extraction
  it("extracts Task: line as title and excludes it from steps", () => {
    const { steps, title } = parseSteps(
      "Task: Set up a scheduled dispatch\n1. Click Scheduled\n2. Click +"
    );
    expect(title).toBe("Set up a scheduled dispatch");
    expect(steps).toHaveLength(2);
    expect(steps[0].label).toBe("Click Scheduled");
  });

  it("returns empty title when no Task: line present", () => {
    const { steps, title } = parseSteps("1. Click the button\n2. Save the file");
    expect(title).toBe("");
    expect(steps).toHaveLength(2);
  });

  it("returns title even when no numbered steps follow Task: line", () => {
    const { steps, title } = parseSteps("Task: Something\n\nno steps here");
    expect(title).toBe("Something");
    expect(steps).toEqual([]);
  });
});

describe("isClarifyingQuestion", () => {
  it("returns true for single step ending with '?'", () => {
    const steps = [{ label: "What do you want to do?", completed: false }];
    expect(isClarifyingQuestion(steps)).toBe(true);
  });

  it("returns false for empty steps array", () => {
    expect(isClarifyingQuestion([])).toBe(false);
  });

  it("returns false for single step NOT ending with '?'", () => {
    const steps = [{ label: "Click the button", completed: false }];
    expect(isClarifyingQuestion(steps)).toBe(false);
  });

  it("returns false for multiple steps even if last ends with '?'", () => {
    const steps = [
      { label: "Step one", completed: false },
      { label: "What next?", completed: false },
    ];
    expect(isClarifyingQuestion(steps)).toBe(false);
  });
});
