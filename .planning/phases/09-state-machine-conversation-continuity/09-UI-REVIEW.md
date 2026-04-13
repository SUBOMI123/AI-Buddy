---
phase: 09-state-machine-conversation-continuity
overall_score: 21
out_of: 24
audited: 2026-04-13
pillars:
  copywriting: 3
  visuals: 3
  color: 4
  typography: 3
  spacing: 4
  experience_design: 4
files_audited:
  - src/components/SessionFeed.tsx
  - src/components/SidebarShell.tsx
  - src/styles/theme.css
---

# Phase 9 — UI Audit Review

**Overall Score:** 21/24

| Pillar | Score |
|--------|-------|
| Copywriting | 3/4 |
| Visuals | 3/4 |
| Color | 4/4 |
| Typography | 3/4 |
| Spacing | 4/4 |
| Experience Design | 4/4 |

---

## Top 3 Fixes

### Fix 1 — Follow-up loading gap (Visuals)
After a first exchange completes and the user submits a follow-up, `LoadingDots` is gated to `sessionHistory.length === 0` (SidebarShell.tsx:610), so during a follow-up `contentState="loading"` phase the SessionFeed goes silent — prior exchanges display, the active-exchange area is blank, no progress indicator. Users see a frozen-looking panel for potentially several seconds.

**Fix:** Pass `contentState` into `SessionFeed` as a prop (or add a separate `isLoading` boolean) and render a minimal inline loading indicator (e.g., three animated dots or a skeleton line) inside the active-exchange area when `streamingText` is empty and loading is in progress.

### Fix 2 — Task header `<p>` missing `font-weight` declaration (Typography)
The UI-SPEC Typography table requires `font-weight: 400` on the task header text. The `<p>` element in the TaskHeaderStrip block (SidebarShell.tsx:495-504) declares `font-size`, `line-height`, `color`, and overflow properties but omits `font-weight`. Visually coincidentally correct on macOS (browser default is 400), but not contractually enforced.

**Fix:** Add `"font-weight": "var(--font-weight-regular)"` to the task header `<p>` style block at SidebarShell.tsx:496.

### Fix 3 — ASCII double-hyphen instead of em dash in error copy (Copywriting)
Two user-facing strings use ASCII `--` instead of `—`:
- `"Couldn't reach AI -- check your connection."` (SidebarShell.tsx:319)
- `"Screen capture unavailable -- guidance may be less specific"` (SidebarShell.tsx:557)

**Fix:** Replace `--` with `\u2014` (em dash) in both strings, matching the Unicode approach already used for task header truncation (SidebarShell.tsx:506).

---

## Detailed Findings

### Pillar 1: Copywriting — 3/4

**Passing:**
- "New task" CTA: exact match at SidebarShell.tsx:525
- Task header truncation: `"\u2026"` at 50-char boundary (SidebarShell.tsx:506)
- Empty state copy: "Ready to help" / "Ask me anything…" present in EmptyState.tsx
- Error structure: `errorMessage()` in `<p>`, "Retry" in separate `<button>` below
- STT error "Didn't catch that — try again" uses proper em dash
- No generic labels (Submit, Click Here, OK, Cancel, Save) in Phase 9 additions

**Failing:**
- Two strings use double-hyphen instead of em dash (see Fix 3)

---

### Pillar 2: Visuals — 3/4

**Passing:**
- TaskHeaderStrip positioned correctly — below settings row, above scrollable feed
- Collapses cleanly via `Show when={lastIntent().length > 0}`
- "New task" link visually distinct (accent color, underlined)
- SessionFeed correctly mutes prior exchanges in `--color-text-secondary`, active in `--color-text-primary`
- TTS icon-only pattern is accessibility-safe (`aria-label` per line)
- Focal point clear when content present

**Failing:**
- During follow-up query loading phase, active-exchange section renders nothing — blank panel with no loading indicator (see Fix 1)

---

### Pillar 3: Color — 4/4

**Passing:**
- All colors use CSS custom properties — no hardcoded hex or rgb()
- Accent (`--color-accent`) reserved for "New task" text link only in Phase 9 scope
- Token mapping: surface-secondary → task header bg, border → strip bottom, text-primary → active, text-secondary → prior
- Light/dark mode: all tokens declared in both media query blocks in theme.css

---

### Pillar 4: Typography — 3/4

**Passing:**
- All font sizes use CSS variable tokens — no hardcoded px/rem
- SessionFeed: `--font-size-label` + `--font-weight-regular` on intent labels
- SessionFeed: `--font-size-body` + `--font-weight-regular` on guidance lines
- TaskHeaderStrip: `--font-size-label` + `--line-height-label` on task header `<p>`
- No font sizes outside the declared three-size scale

**Failing:**
- Task header `<p>` missing explicit `"font-weight": "var(--font-weight-regular)"` declaration (see Fix 2)
- "New task" button also missing `font-weight` — inherits browser default

---

### Pillar 5: Spacing — 4/4

**Passing:**
- SessionFeed container: `gap: var(--space-sm)` ✓
- Prior exchange wrapper: `padding: var(--space-xs) 0` ✓
- Intent label: `padding-bottom: var(--space-xs)` ✓
- TaskHeaderStrip: `padding: var(--space-sm) var(--space-md)` ✓
- "New task" button: `padding: 0`, `min-height: 44px`, `display: inline-flex` ✓
- No arbitrary pixel/rem values introduced by Phase 9

---

### Pillar 6: Experience Design — 4/4

**Passing:**
- State machine: empty → loading → streaming → done → empty transitions all correct
- `contentState="done"` (WR-02 fix) prevents false-positive degradation notice on re-open
- `onOverlayShown` conditional reset preserves `sessionHistory` and `lastIntent` (D-11)
- Session cap: functional updater `.slice(updated.length - 3)` at SidebarShell.tsx:365-368 ✓
- `handleNewTask()` resets all 7 required signals + focuses input ✓
- Auto-scroll triggered on first streaming token (D-05) ✓
- `aria-label="Conversation history"` on SessionFeed container ✓
- `aria-live="polite"` on TaskHeaderStrip ✓
- `aria-label="Start a new task"` on "New task" button ✓
- All interactive elements `min-height: 44px` ✓
- No `innerHTML` — XSS safety confirmed ✓
