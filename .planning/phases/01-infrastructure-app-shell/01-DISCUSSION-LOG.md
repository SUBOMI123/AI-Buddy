# Phase 1: Infrastructure & App Shell - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-09
**Phase:** 01-infrastructure-app-shell
**Areas discussed:** Overlay UI style, Shortcut & invocation, Worker proxy routes, Distribution strategy

---

## Overlay UI Style

| Option | Description | Selected |
|--------|-------------|----------|
| Floating sidebar | Panel docked to right edge, ~300px wide. Always visible when active. | ✓ |
| Bottom drawer | Slides up from bottom. More horizontal space but may cover content. | |
| Small bubble near cursor | Compact floating bubble. Minimal real estate but limited step space. | |

**User's choice:** Floating sidebar
**Notes:** Similar to Clicky's approach

| Option | Description | Selected |
|--------|-------------|----------|
| Fixed right, fixed width | Simple — always right side, ~300px | |
| Draggable, fixed width | User can drag to left or right edge. Remembers position. | ✓ |
| Draggable + resizable | Full flexibility. More complex. | |

**User's choice:** Draggable, fixed width

| Option | Description | Selected |
|--------|-------------|----------|
| Dark translucent | Dark background with blur/transparency | |
| Light translucent | Light frosted glass look | |
| Follows system theme | Dark when OS is dark, light when OS is light | ✓ |
| You decide | Claude's discretion | |

**User's choice:** Follows system theme

| Option | Description | Selected |
|--------|-------------|----------|
| Input in panel | Text field at bottom of sidebar | ✓ |
| Separate input popup | Small floating input on shortcut | |
| You decide | Claude's discretion | |

**User's choice:** Input in panel

| Option | Description | Selected |
|--------|-------------|----------|
| Prompt hint | "Ask me anything about what's on your screen" | ✓ |
| Minimal | Just the input field, no extra text | |
| You decide | Claude's discretion | |

**User's choice:** Prompt hint

| Option | Description | Selected |
|--------|-------------|----------|
| Numbered steps | 1. Click Filters  2. Select Date  3. Choose Last 30 days | ✓ |
| Arrow flow | Click Filters → Select Date → Choose Last 30 days | |
| You decide | Claude's discretion | |

**User's choice:** Numbered steps

---

## Shortcut & Invocation

| Option | Description | Selected |
|--------|-------------|----------|
| Ctrl+Shift+Space | Common AI assistant pattern | |
| Ctrl+Option / Ctrl+Alt | Clicky's approach | |
| Customizable | Let users set their own. Ship with default. | ✓ |
| You decide | Claude picks best default | |

**User's choice:** Customizable

| Option | Description | Selected |
|--------|-------------|----------|
| Toggle | Press once to open, again to dismiss | ✓ |
| Hold to show | Hold shortcut to keep open, release to dismiss | |
| Open only | Shortcut opens, Escape/click outside to dismiss | |

**User's choice:** Toggle

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, auto-focus | Panel opens → cursor in text field → type immediately | ✓ |
| No | Panel opens, user must click input field | |

**User's choice:** Yes, auto-focus

---

## Worker Proxy Routes

| Option | Description | Selected |
|--------|-------------|----------|
| Installation token | App generates unique token. Worker validates + rate limits. | ✓ |
| Open proxy | No auth. Simple but vulnerable to abuse. | |
| User accounts | Users create accounts. Most secure but complex. | |

**User's choice:** Installation token

| Option | Description | Selected |
|--------|-------------|----------|
| Hono | Lightweight, built for Workers. Clean routing + middleware. | ✓ |
| Plain fetch handler | No framework. What Clicky does. | |
| You decide | Claude's discretion | |

**User's choice:** Hono

---

## Distribution Strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Direct download | DMG for Mac, MSI/EXE for Windows. Full control. | ✓ |
| App Store + direct | Both channels. Transparent overlays may not work in App Store build. | |
| You decide | Claude's discretion | |

**User's choice:** Direct download

| Option | Description | Selected |
|--------|-------------|----------|
| Tauri built-in updater | Native updater plugin. Checks on launch, background download. | ✓ |
| Manual download | User downloads new version from website. | |
| You decide | Claude's discretion | |

**User's choice:** Tauri built-in updater

---

## Claude's Discretion

- Screen capture permission flow implementation details
- Specific Tauri window configuration values
- Default keyboard shortcut choice
- System tray menu items and layout

## Deferred Ideas

None — discussion stayed within phase scope
