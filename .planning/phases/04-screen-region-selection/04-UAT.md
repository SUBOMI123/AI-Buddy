---
status: complete
phase: 04-screen-region-selection
source: [04-01-SUMMARY.md, 04-02-SUMMARY.md, 04-03-SUMMARY.md]
started: 2026-04-10T15:47:47Z
updated: 2026-04-10T15:47:47Z
---

## Current Test

[testing complete]

## Tests

### 1. Crop button visible and styled
expected: Open the AI Buddy sidebar. The input area shows a Crop icon to the left of the Send button. The Crop icon is grey (secondary color) when no region is selected.
result: pass

### 2. Overlay opens with instruction pill
expected: Click the Crop button. A full-screen semi-transparent dark overlay appears with a crosshair cursor. A dark pill near the top (below the menu bar) reads "Drag to select a region  ·  Esc to cancel" — fully visible, high contrast.
result: pass

### 3. Rubber-band drawing
expected: With the overlay open, click and drag. A blue-bordered rectangle (2px blue border, light blue fill) tracks your drag. The instruction pill disappears while you're dragging.
result: pass

### 4. Esc cancels
expected: Open the overlay, start dragging, then press Escape. The overlay closes, the sidebar reappears, and no thumbnail appears above the input.
result: pass

### 5. Tiny drag treated as cancel
expected: Open the overlay, click but barely move the mouse (less than ~10px). Release. The overlay closes with no thumbnail appearing — treated the same as cancel.
result: pass

### 6. Region confirmed — thumbnail appears
expected: Open the overlay, draw a visible rectangle, release. The overlay closes immediately. The sidebar shows a thumbnail image of the selected area above the input field, with pixel dimensions (e.g. "420 × 310") below it.
result: pass

### 7. Crop button accent color when region active
expected: When a thumbnail is showing, the Crop button icon turns blue (accent color) to signal an active region.
result: pass

### 8. X button clears the region
expected: With a thumbnail showing, click the X button on the thumbnail. The thumbnail disappears, Crop icon returns to grey, and the sidebar is back to normal (full-screen capture will be used on next submit).
result: pass

### 9. Submit with region — Claude sees the crop
expected: Draw a region, type a question about what's in that area, press Enter. A loading indicator appears, then Claude's guidance streams in. After submit, the thumbnail disappears (region resets).
result: pass

### 10. Submit without region — no regression
expected: Without clicking Crop, type a question and press Enter as normal. Claude responds using the full-screen capture. No errors, no missing functionality compared to before this phase.
result: pass

## Summary

total: 10
passed: 10
issues: 0
pending: 0
skipped: 0

## Gaps

[none yet]
