---
status: complete
phase: 05-learning-adaptation
source: [05-01-SUMMARY.md, 05-02-SUMMARY.md, 05-03-SUMMARY.md]
started: "2026-04-10T12:30:00.000Z"
updated: "2026-04-10T12:35:00.000Z"
---

## Current Test

number: 8
name: Settings Screen Closes
expected: |
  While the settings screen is open, click "Done". The main sidebar content
  (empty state or last response) reappears.
awaiting: complete

## Tests

### 1. Memory DB Created on First Launch
expected: After running the app, `~/Library/Application Support/com.aibuddy.app/memory.db` exists on disk.
result: pass

### 2. First Encounter — Full Guidance, No Notice
expected: Submit any intent for the first time. Full step-by-step guidance streams. No degradation notice appears above the response.
result: pass

### 3. Second Encounter — Degradation Notice + Summary Mode
expected: Submit the exact same intent a second time. A notice appears above the response: "You've done this before — showing summary. Show full steps". The guidance is shorter/consolidated compared to the first response.
result: pass

### 4. Show Full Steps Override
expected: While the tier-2 degradation notice is visible, click "Show full steps". Full step-by-step guidance streams and the degradation notice disappears.
result: pass

### 5. Third Encounter — Hints Only
expected: Submit the same intent a third time. Notice shows "showing hints". The response is a short directional hint (no numbered list, 1-2 sentences).
result: pass

### 6. Interactions Recorded in Settings
expected: Open the settings screen (gear icon). The footer shows a count greater than 0 (e.g., "3 interactions recorded locally").
result: pass

### 7. Settings Screen Opens via Gear Icon
expected: Click the gear icon (⚙) in the sidebar header. The main content area is fully replaced by the skill profile screen showing "Your Skill Profile", "Things you've mastered", "Areas you're still learning", and an interaction count.
result: pass

### 8. Settings Screen Closes
expected: While the settings screen is open, click "Done". The main sidebar content (empty state or last response) reappears.
result: pass

## Summary

total: 8
passed: 8
issues: 0
pending: 0
skipped: 0

## Gaps

[none]
