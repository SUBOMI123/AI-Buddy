---
phase: 14-code-signing
plan: 03
subsystem: docs
tags: [windows, smartscreen, beta-install, documentation, signing]
dependency_graph:
  requires: []
  provides: [docs/windows-beta-install.md]
  affects: [GitHub Release descriptions, beta invite emails]
tech_stack:
  added: []
  patterns: [markdown documentation with HTML comment screenshot placeholders]
key_files:
  created:
    - docs/windows-beta-install.md
  modified: []
decisions:
  - "docs/windows-beta-install.md created with exact content per D-06 spec — no changes needed"
  - "Screenshot placeholder format uses HTML comments (<!-- screenshot: name.png -->) as specified"
metrics:
  duration_minutes: 3
  completed_date: "2026-04-14"
  tasks_completed: 1
  tasks_total: 1
  files_created: 1
  files_modified: 0
requirements_satisfied:
  - SIGN-05
---

# Phase 14 Plan 03: Windows Beta Install Guide Summary

**One-liner:** Windows SmartScreen click-through guide with 5-step installation walkthrough, 4 screenshot placeholders, and EV signing note for v1.0.

## What Was Built

Created `docs/windows-beta-install.md` — the Windows beta installation guide for users who encounter the Microsoft SmartScreen warning when installing an unsigned AI Buddy beta binary.

The document:
- Explains why SmartScreen appears (unsigned binary, expected for closed beta)
- Provides step-by-step click-through: "More info" then "Run anyway" with 4 screenshot placeholder markers
- Notes that only the official GitHub Releases page is a safe download source
- Includes an FAQ covering common concerns (is it safe, why not sign now, antivirus flags)
- Notes that v1.0 will use EV code signing to eliminate the warning entirely

## Acceptance Criteria Results

| Criterion | Expected | Actual | Status |
|-----------|----------|--------|--------|
| File exists | true | true | PASS |
| "More info" occurrences | >= 2 | 4 | PASS |
| "Run anyway" occurrences | >= 2 | 4 | PASS |
| "screenshot:" placeholders | 4 | 4 | PASS |
| "EV" occurrences | >= 1 | 4 | PASS |
| "github.com" occurrences | >= 1 | 1 | PASS |
| "SmartScreen" occurrences | >= 3 | 10 | PASS |

## Commits

| Task | Commit | Files |
|------|--------|-------|
| Task 1: Create docs/windows-beta-install.md | 26f8a1d | docs/windows-beta-install.md |

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

One intentional placeholder requires updating before the first release:
- `[your-github-org]` in the GitHub Releases URL (`https://github.com/[your-github-org]/ai-buddy/releases`) must be replaced with the actual GitHub organization name when the repository is made public. This is documented in the file itself.

## Threat Flags

None. The document addresses T-14-03-01 (Spoofing via download link) by explicitly instructing users to download only from the official GitHub Releases URL. T-14-03-02 (SmartScreen bypass) is accepted risk per the threat register — the closed beta context and source verification instruction mitigate the risk.

## Self-Check: PASSED

- [x] `docs/windows-beta-install.md` exists at `/Users/subomi/Desktop/AI-Buddy/docs/windows-beta-install.md`
- [x] Commit `26f8a1d` exists in git log
- [x] All 7 acceptance criteria passed
