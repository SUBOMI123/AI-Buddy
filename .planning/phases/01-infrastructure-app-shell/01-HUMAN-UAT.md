---
status: partial
phase: 01-infrastructure-app-shell
source: [01-VERIFICATION.md]
started: 2026-04-09T23:16:00Z
updated: 2026-04-09T23:16:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. System Tray and Dock Behavior
expected: App runs in menu bar only, no Dock icon, no Cmd+Tab entry
result: [pending]

### 2. Global Shortcut Toggle
expected: Press Cmd+Shift+Space while another app has focus — overlay slides in from right edge, 300px wide, without focus stealing
result: [pending]

### 3. Text Input and Stub Response
expected: Type text in input, press Enter — shows 'Not connected yet' stub response in numbered list
result: [pending]

### 4. Permission Dialog on First Launch
expected: Privacy disclosure text visible, Grant Permission button calls OS dialog, Not Now dismisses
result: [pending]

### 5. Dark/Light Mode Theme
expected: Sidebar follows OS theme — dark surface on dark mode, light surface on light mode
result: [pending]

### 6. Settings File Creation
expected: ~/Library/Application Support/com.aibuddy.app/settings.json created with installation_token (UUID), shortcut, and sidebar_edge fields
result: [pending]

## Summary

total: 6
passed: 0
issues: 0
pending: 6
skipped: 0
blocked: 0

## Gaps
