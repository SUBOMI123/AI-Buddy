---
phase: quick
plan: 260413-1kk
subsystem: ai-prompt
tags: [system-prompt, formatting, command-first]
dependency_graph:
  requires: []
  provides: [command-first-step-format]
  affects: [src/lib/ai.ts]
tech_stack:
  added: []
  patterns: [command-first formatting, Verb-colon-command pattern]
key_files:
  modified:
    - src/lib/ai.ts
decisions:
  - "Command-first format: Verb: `command` with no trailing explanation — verb names the action, command is the full instruction"
  - "No-navigation assumption added to STRICT RULES — do not add orientation steps unless genuinely required"
metrics:
  duration: 5m
  completed: 2026-04-13
  tasks_completed: 1
  files_modified: 1
---

# Quick 260413-1kk: Update SYSTEM_PROMPT to Command-First Format Summary

**One-liner:** Rewrote SYSTEM_PROMPT to enforce `Verb: \`command\`` format with no trailing prose, and added no-navigation-assumption rule.

## What Was Done

Replaced the step formatting rule in `SYSTEM_PROMPT` (src/lib/ai.ts). The old rule used a descriptive pattern ("Run `git status` to see branches") that allowed trailing prose after commands. The new rule enforces:

1. `Verb: \`command\`` format — action verb + colon + command, nothing after on the same line
2. No orientation/navigation steps unless genuinely required to reach the target

All other rules were preserved unchanged: start with "1." on line 1, one action per step, UI element references by label/color/position, inline backticks not code blocks, clarifying question behavior.

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | d5453ef | feat(quick-1kk): rewrite SYSTEM_PROMPT with command-first rules |

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

- [x] src/lib/ai.ts modified with new SYSTEM_PROMPT
- [x] "Run:" present at line 16 (examples line)
- [x] "Assume the user" present at line 10
- [x] TIER_SUFFIX constant intact at line 28
- [x] streamGuidance function untouched
- [x] Commit d5453ef exists
