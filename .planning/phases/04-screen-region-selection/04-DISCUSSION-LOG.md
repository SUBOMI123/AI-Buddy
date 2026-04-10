# Phase 4: Screen Region Selection - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-10
**Phase:** 04-screen-region-selection
**Areas discussed:** Selection trigger

---

## Selection Trigger

| Option | Description | Selected |
|--------|-------------|----------|
| Button in sidebar | Crop/region icon in sidebar UI; sidebar hides, overlay appears | ✓ |
| Keyboard shortcut | Dedicated global hotkey (e.g., Ctrl+Shift+R) | |
| Auto on submit | Toggle icon next to Send button, activates region mode before query | |

**User's choice:** Button in sidebar

---

| Option | Description | Selected |
|--------|-------------|----------|
| Select region first, then type | "Aim then ask" — draw region, sidebar reappears, type intent | ✓ |
| Type intent first, then select | Write the question, then annotate with region before submitting | |
| Either order — region optional | Button always visible, can draw at any point before submitting | |

**User's choice:** Select region first, then type

---

| Option | Description | Selected |
|--------|-------------|----------|
| Thumbnail preview in sidebar | Small crop preview above input field with X to clear | ✓ |
| Label only | Text "Region selected (340×240px)" with X — no visual preview | |
| No confirmation — just submit | Region silently locked, sent on next submit | |

**User's choice:** Thumbnail preview in sidebar

---

## Claude's Discretion

- Full-screen overlay window config and visual treatment during selection
- Whether to use a new Tauri window or transform existing overlay window
- Resize behavior for cropped region (apply 1280px cap or send at native crop size)
- Mouse event capture approach on macOS

## Deferred Ideas

- Keyboard shortcut for region selection (power user addition)
- Region persistence across queries
- Multi-monitor selection
- Annotation mode (VIS-01, v2 requirement)
