---
phase: 11-action-first-ui
plan: W0
type: tdd
wave: 0
depends_on: []
files_modified:
  - src/lib/quickActionPresets.ts
  - src/lib/quickActionPresets.test.ts
autonomous: true
requirements:
  - ACTN-01
  - ACTN-03

must_haves:
  truths:
    - "Preset prompt strings exactly match D-03 literals"
    - "TRY_ANOTHER_SUFFIX constant equals ' — suggest a meaningfully different approach than before'"
    - "stripSuffix function removes a prior suffix before re-appending, preventing compound prompts"
    - "All unit tests are RED before implementation, GREEN after"
  artifacts:
    - path: "src/lib/quickActionPresets.ts"
      provides: "Exported preset strings and suffix-strip helper"
      exports: ["QUICK_PRESETS", "TRY_ANOTHER_SUFFIX", "buildTryAnotherPrompt"]
    - path: "src/lib/quickActionPresets.test.ts"
      provides: "Vitest unit tests for preset strings and suffix logic"
      min_lines: 30
  key_links:
    - from: "src/components/QuickActions.tsx"
      to: "src/lib/quickActionPresets.ts"
      via: "import { QUICK_PRESETS }"
      pattern: "QUICK_PRESETS"
    - from: "src/components/SidebarShell.tsx"
      to: "src/lib/quickActionPresets.ts"
      via: "import { buildTryAnotherPrompt, TRY_ANOTHER_SUFFIX }"
      pattern: "buildTryAnotherPrompt"
---

<objective>
Wave 0 TDD scaffold: extract quick action preset strings and the "Try another way" suffix logic into a testable pure-function module before any UI components are written.

Purpose: Makes preset string correctness and the anti-compounding logic verifiable at the unit level. Tests must be RED before `quickActionPresets.ts` is written.
Output: `src/lib/quickActionPresets.ts` with exports, `src/lib/quickActionPresets.test.ts` with tests green.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/11-action-first-ui/11-CONTEXT.md
@.planning/phases/11-action-first-ui/11-RESEARCH.md
</context>

<feature>
  <name>quickActionPresets module</name>
  <files>src/lib/quickActionPresets.ts, src/lib/quickActionPresets.test.ts</files>
  <behavior>
    QUICK_PRESETS: Record with exactly four keys (Fix, Explain, Optimize). "Ask" is not a preset — it focuses the text input, no string needed.
    - QUICK_PRESETS["Fix"] === "Fix the issue shown in the screenshot"
    - QUICK_PRESETS["Explain"] === "Explain what's happening in the screenshot"
    - QUICK_PRESETS["Optimize"] === "How can I improve or optimize what's shown"
    TRY_ANOTHER_SUFFIX === " \u2014 suggest a meaningfully different approach than before"
    buildTryAnotherPrompt(base: string) → string:
    - When base does NOT contain TRY_ANOTHER_SUFFIX → returns base + TRY_ANOTHER_SUFFIX
    - When base ALREADY contains TRY_ANOTHER_SUFFIX → strips it first, then appends once (no compound)
    - When base is empty string → returns TRY_ANOTHER_SUFFIX (trimmed start)
  </behavior>
  <implementation>
    RED phase: write `quickActionPresets.test.ts` first, import from `./quickActionPresets`, run `npm test` — tests must FAIL (module not written yet).
    GREEN phase: create `quickActionPresets.ts` with the three exports, run `npm test` — all tests must PASS.
    No component code in this plan. Pure TypeScript constants and one pure function.
  </implementation>
</feature>

<tasks>

<task type="auto" tdd="true">
  <name>Task W0-1: Write RED tests for quickActionPresets</name>
  <files>src/lib/quickActionPresets.test.ts</files>
  <read_first>
    - src/lib/parseSteps.test.ts (test file pattern to follow)
    - vitest.config.ts (include glob is "src/**/*.test.ts", environment "node")
    - .planning/phases/11-action-first-ui/11-CONTEXT.md D-03 (exact preset strings)
    - .planning/phases/11-action-first-ui/11-RESEARCH.md Pitfall 2 (compound suffix problem)
  </read_first>
  <behavior>
    Test cases (all must be RED before implementation file exists):
    1. QUICK_PRESETS["Fix"] === "Fix the issue shown in the screenshot"
    2. QUICK_PRESETS["Explain"] === "Explain what's happening in the screenshot"
    3. QUICK_PRESETS["Optimize"] === "How can I improve or optimize what's shown"
    4. QUICK_PRESETS does NOT have an "Ask" key (Ask is a UI action, not a preset prompt)
    5. TRY_ANOTHER_SUFFIX === " \u2014 suggest a meaningfully different approach than before" (em-dash, not hyphen)
    6. buildTryAnotherPrompt("Fix the issue shown in the screenshot") returns "Fix the issue shown in the screenshot \u2014 suggest a meaningfully different approach than before"
    7. buildTryAnotherPrompt with an already-suffixed string returns the same result as calling with the unsuffixed base (no doubling)
    8. buildTryAnotherPrompt("") returns " \u2014 suggest a meaningfully different approach than before" (or the trimmed equivalent — document the chosen behavior in the test)
  </behavior>
  <action>
    Create `src/lib/quickActionPresets.test.ts` importing `{ QUICK_PRESETS, TRY_ANOTHER_SUFFIX, buildTryAnotherPrompt }` from `"./quickActionPresets"`.
    Write all 8 test cases using `describe` / `it` / `expect` pattern from parseSteps.test.ts.
    Run `npm test` — confirm output shows import errors or failed assertions (tests are RED).
    Do NOT create quickActionPresets.ts yet. Failing import is acceptable RED state.
  </action>
  <verify>
    <automated>cd /Users/subomi/Desktop/AI-Buddy && npm test 2>&1 | grep -E "FAIL|Cannot find module|quickActionPresets"</automated>
  </verify>
  <done>quickActionPresets.test.ts exists; `npm test` output shows failures related to the missing module or assertion errors — tests are in RED state.</done>
  <acceptance_criteria>
    - File exists at src/lib/quickActionPresets.test.ts
    - grep "QUICK_PRESETS" src/lib/quickActionPresets.test.ts outputs at least 3 matches
    - grep "TRY_ANOTHER_SUFFIX" src/lib/quickActionPresets.test.ts outputs at least 2 matches
    - grep "buildTryAnotherPrompt" src/lib/quickActionPresets.test.ts outputs at least 2 matches
    - npm test exits non-zero (RED state confirmed)
  </acceptance_criteria>
</task>

<task type="auto" tdd="true">
  <name>Task W0-2: Implement quickActionPresets to GREEN</name>
  <files>src/lib/quickActionPresets.ts</files>
  <read_first>
    - src/lib/quickActionPresets.test.ts (the tests just written — implement against these exactly)
    - .planning/phases/11-action-first-ui/11-CONTEXT.md D-03 (verify preset strings verbatim)
    - .planning/phases/11-action-first-ui/11-RESEARCH.md Pitfall 2 (strip-then-append pattern)
  </read_first>
  <behavior>
    After this task: `npm test` exits 0, all quickActionPresets tests PASS.
  </behavior>
  <action>
    Create `src/lib/quickActionPresets.ts` with:

    ```typescript
    export const QUICK_PRESETS: Record<string, string> = {
      Fix: "Fix the issue shown in the screenshot",
      Explain: "Explain what's happening in the screenshot",
      Optimize: "How can I improve or optimize what's shown",
    };

    export const TRY_ANOTHER_SUFFIX = " \u2014 suggest a meaningfully different approach than before";

    export function buildTryAnotherPrompt(base: string): string {
      const stripped = base.replace(TRY_ANOTHER_SUFFIX, "");
      return stripped + TRY_ANOTHER_SUFFIX;
    }
    ```

    Run `npm test` — all tests must PASS (GREEN). Fix any assertion mismatches before proceeding.
    Do NOT add any other exports. Do NOT import anything from SolidJS or Tauri.
  </action>
  <verify>
    <automated>cd /Users/subomi/Desktop/AI-Buddy && npm test</automated>
  </verify>
  <done>npm test exits 0; all quickActionPresets tests pass; no regressions in parseSteps tests.</done>
  <acceptance_criteria>
    - File exists at src/lib/quickActionPresets.ts
    - npm test exits 0
    - grep "export const QUICK_PRESETS" src/lib/quickActionPresets.ts returns a match
    - grep "export const TRY_ANOTHER_SUFFIX" src/lib/quickActionPresets.ts returns a match
    - grep "export function buildTryAnotherPrompt" src/lib/quickActionPresets.ts returns a match
    - TRY_ANOTHER_SUFFIX value contains "\u2014" (em-dash), not a hyphen
  </acceptance_criteria>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| constants → UI | Preset strings are hardcoded — no user input can modify them |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-11-W0-01 | Tampering | quickActionPresets.ts | accept | Module exports compile-time constants; no user data flows through this file |
</threat_model>

<verification>
Run `npm test` from project root. All tests green. No regressions in parseSteps suite.
</verification>

<success_criteria>
- `src/lib/quickActionPresets.ts` exports QUICK_PRESETS, TRY_ANOTHER_SUFFIX, buildTryAnotherPrompt
- `npm test` exits 0 with all tests green
- Preset strings match D-03 verbatim (case-sensitive)
- buildTryAnotherPrompt strips prior suffix before re-appending (no compound)
</success_criteria>

<output>
After completion, create `.planning/phases/11-action-first-ui/11-W0-SUMMARY.md`
</output>
