---
phase: 10-step-tracking-response-quality
plan: W0
type: execute
wave: 0
depends_on: []
files_modified:
  - vitest.config.ts
  - src/lib/parseSteps.test.ts
autonomous: true
requirements:
  - STEP-01
  - STEP-03
must_haves:
  truths:
    - "Running `npx vitest run src/lib/parseSteps.test.ts` produces a pass/fail result (infrastructure exists)"
    - "Test cases exist for all five edge cases specified in VALIDATION.md Wave 0"
  artifacts:
    - path: "vitest.config.ts"
      provides: "Vitest config that locates test files in src/"
      contains: "vitest"
    - path: "src/lib/parseSteps.test.ts"
      provides: "Unit tests for parseSteps() — run before any implementation"
      exports: []
  key_links:
    - from: "src/lib/parseSteps.test.ts"
      to: "src/lib/parseSteps.ts"
      via: "import { parseSteps } from './parseSteps'"
      pattern: "parseSteps"
---

<objective>
Create the Vitest test infrastructure and failing unit tests for `parseSteps()` before the function is implemented. This is a Wave 0 plan — it provides the `<automated>` verify command referenced by downstream plans.

Purpose: Establish test-first baseline so every subsequent plan's `<verify>` command is backed by real tests.
Output: `vitest.config.ts` + `src/lib/parseSteps.test.ts` (tests will fail until Plan 01 creates the implementation).
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/10-step-tracking-response-quality/10-CONTEXT.md
@.planning/phases/10-step-tracking-response-quality/10-VALIDATION.md
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Install Vitest and create vitest.config.ts</name>
  <files>vitest.config.ts, package.json</files>
  <read_first>
    - /Users/subomi/Desktop/AI-Buddy/package.json (current devDependencies)
    - /Users/subomi/Desktop/AI-Buddy/vite.config.ts (if exists — Vitest can extend it)
  </read_first>
  <action>
Install vitest as a devDependency:
```
npm install -D vitest
```

Then create `vitest.config.ts` at the project root with:
```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
```

Use `environment: "node"` — the `parseSteps` function is a pure string parser with zero DOM dependencies.
  </action>
  <behavior>
    - After `npm install -D vitest`, vitest appears in `package.json` devDependencies
    - `vitest.config.ts` exists at project root
    - `npx vitest run --reporter=verbose` exits without "Cannot find module vitest" error
  </behavior>
  <verify>
    <automated>cd /Users/subomi/Desktop/AI-Buddy && npx vitest run --reporter=verbose 2>&1 | head -20</automated>
  </verify>
  <done>vitest.config.ts exists; `npx vitest run` runs without fatal config errors (may exit with "no test files" at this point)</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Write failing unit tests for parseSteps()</name>
  <files>src/lib/parseSteps.test.ts</files>
  <read_first>
    - /Users/subomi/Desktop/AI-Buddy/.planning/phases/10-step-tracking-response-quality/10-CONTEXT.md (D-02 — exact algorithm, D-01 — parse timing note)
    - /Users/subomi/Desktop/AI-Buddy/.planning/phases/10-step-tracking-response-quality/10-VALIDATION.md (Wave 0 Requirements — exact five test cases required)
  </read_first>
  <action>
Create `src/lib/parseSteps.test.ts`:

```typescript
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
    const text = "1. Run the install command:\n```bash\nnpm install\n```\n2. Start the server";
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
```

These tests will FAIL until Plan 01 creates `src/lib/parseSteps.ts`. This is intentional (RED phase).
  </action>
  <verify>
    <automated>cd /Users/subomi/Desktop/AI-Buddy && npx vitest run src/lib/parseSteps.test.ts 2>&1 | grep -E "FAIL|Cannot find|parseSteps"</automated>
  </verify>
  <done>
    - `src/lib/parseSteps.test.ts` exists with all 7 test cases
    - Running vitest on it fails with "Cannot find module './parseSteps'" (expected RED state)
    - Tests do NOT pass yet — implementation is in Plan 01
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| dev toolchain | vitest runs locally, executes test code only — no production surface |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-10-W0-01 | Tampering | vitest.config.ts | accept | Config is dev-only; no runtime impact. Source-controlled. |
| T-10-W0-02 | Information Disclosure | test file | accept | Test data is synthetic strings; no secrets or PII |
</threat_model>

<verification>
1. `vitest.config.ts` exists at project root — `ls /Users/subomi/Desktop/AI-Buddy/vitest.config.ts`
2. `src/lib/parseSteps.test.ts` exists — `ls /Users/subomi/Desktop/AI-Buddy/src/lib/parseSteps.test.ts`
3. `npx vitest run src/lib/parseSteps.test.ts` exits with a FAIL result (not a config/module error — indicates tests are discovered)
</verification>

<success_criteria>
- vitest installed and configured
- 7 test cases written covering all VALIDATION.md Wave 0 requirements
- Tests are in RED state (fail) awaiting Plan 01 implementation
- `npx vitest run` command is usable as the automated verify gate for all subsequent plans
</success_criteria>

<output>
After completion, create `.planning/phases/10-step-tracking-response-quality/10-W0-SUMMARY.md`
</output>
