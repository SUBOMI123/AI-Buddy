---
status: partial
phase: 08-backend-foundations
source: [08-VERIFICATION.md]
started: 2026-04-11T00:00:00Z
updated: 2026-04-11T00:00:00Z
---

# Phase 8: Human UAT Checklist

**Phase Goal:** The overlay opens on the active monitor and knows what app the user is in — with no UI regressions

Automated verification passed 6/7 items. The following require physical hardware testing.

---

## Manual Test Items

### H-01: Multi-monitor routing
- **Setup:** Connect a secondary external display to your Mac/Windows machine
- **Steps:** Move your cursor to the secondary monitor, then press the overlay shortcut
- **Expected:** Overlay appears on the secondary monitor, not the primary
- **Status:** [ ] pending

### H-02: Primary monitor regression
- **Setup:** Single monitor or cursor on primary monitor
- **Steps:** Press the overlay shortcut with cursor on the primary monitor
- **Expected:** Overlay still appears on the primary monitor exactly as before — no behavioral change
- **Status:** [ ] pending

### H-03: Retina DPI check
- **Setup:** MacBook Pro or other 2x Retina display
- **Steps:** Open the overlay and observe its width
- **Expected:** Overlay is ~300 logical pixels (600 physical) wide. Before this fix it would appear ~150 logical px (300 physical). Overlay should look the same size as on a non-Retina display.
- **Status:** [ ] pending

### H-04: App context in Claude prompt
- **Setup:** Running app with network inspector (e.g., browser DevTools or Proxyman)
- **Steps:** Focus Terminal (or any app). Open the overlay. Submit any query. Inspect the outgoing request to the Cloudflare Worker.
- **Expected:** The system prompt contains the line `The user is currently working in: Terminal` (or the name of the focused app)
- **Status:** [ ] pending

### H-05: Graceful degradation
- **Setup:** Click on the desktop so no app window is focused (or test on a machine where app detection may not work)
- **Steps:** Open the overlay and submit a query
- **Expected:** Overlay opens normally, AI responds normally, no error message shown to user
- **Status:** [ ] pending

---

## Sign-off

All H-0x items must be checked before running `/gsd-verify-work 8`.
