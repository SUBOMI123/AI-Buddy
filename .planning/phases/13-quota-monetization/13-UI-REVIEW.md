---
phase: 13-quota-monetization
overall_score: 19
max_score: 24
audited: 2026-04-13
ui_spec: false
---

# Phase 13 — UI Audit Review

**Overall Score: 19/24**

| Pillar | Score |
|--------|-------|
| Copywriting | 4/4 |
| Visuals | 3/4 |
| Color | 2/4 |
| Typography | 3/4 |
| Spacing | 3/4 |
| Experience Design | 4/4 |

---

## Top 3 Priority Fixes

1. **QuotaBanner: replace 5 hardcoded hex colors with CSS tokens** — `#fef3c7`, `#92400e` (×2), `#d97706` in `src/components/QuotaBanner.tsx`. Introduce `--color-warning-bg`, `--color-warning-text`, `--color-warning-action` or reuse existing `--color-surface-secondary` / `--color-text-secondary` equivalents.

2. **QuotaBanner: replace raw font sizes with design tokens** — `13px` (banner text), `12px` (Upgrade button), `14px` (dismiss button) bypass the `--font-size-*` system. Replace with `var(--font-size-label)`. The Upgrade button (action) being smaller than the dismiss button (14px) inverts expected visual weight.

3. **Quota badge: define `--color-text-muted` token or use `--color-text-secondary`** — `SidebarShell.tsx:632` uses `var(--color-text-muted, #666)` but `--color-text-muted` is not defined, so `#666` always applies. Either define the token or switch to the already-defined `--color-text-secondary`.

---

## Detailed Findings

### Pillar 1: Copywriting (4/4 — PASS)

All quota-specific strings are product-specific, time-scoped, and benefit-oriented:
- `"N AI request(s) left today"` — correct pluralization, specific unit, time-scoped
- `"You've used all your AI requests for today."` — plain English, blame-free
- `"Upgrade for unlimited access"` — benefit-first CTA
- `"Already paid? Refresh Status"` — explicitly handles the post-payment confusion case
- `"N / limit left"` — compact, unambiguous badge

### Pillar 2: Visuals (3/4)

**Positive:** Badge placement in header row is contextually appropriate. QuotaBanner renders above the input (right spatial relationship). Hard-limit screen has clear message → primary CTA → secondary CTA hierarchy. Both CTA buttons have `min-height: 44px`.

**Issues:**
- Quota badge is an unstyled 11px `<span>` with no visual container — may go unnoticed. Consider a subtle pill background (`var(--color-surface-secondary)` + 2px horizontal padding).
- QuotaBanner has no left-side warning icon — users mid-task may miss it. A `⚠` glyph would increase salience.

### Pillar 3: Color (2/4)

**Hardcoded colors introduced in Phase 13:**

`src/components/QuotaBanner.tsx`:
- Line 17: `background: "#fef3c7"` (amber-100)
- Line 26: `color: "#92400e"` (amber-800, used twice)
- Line 33: `background: "#d97706"` (amber-600)

`src/components/SidebarShell.tsx`:
- Line 632: `color: "var(--color-text-muted, #666)"` — token undefined, fallback always applies

The rest of the app has 114+ correct uses of `var(--color-*)`. QuotaBanner is the only new user-facing component that breaks the token contract.

### Pillar 4: Typography (3/4)

**Out-of-token font sizes in Phase 13:**

`src/components/QuotaBanner.tsx`:
- Line 21: `"font-size": "13px"` (banner text)
- Line 39: `"font-size": "12px"` (Upgrade button)
- Line 53: `"font-size": "14px"` (Dismiss button)

`src/components/SidebarShell.tsx`:
- Line 631: `"font-size": "11px"` (quota badge)

The quota-exceeded screen (SidebarShell) correctly uses `var(--font-size-body)` and `var(--font-size-label)`. QuotaBanner is the isolated offender.

### Pillar 5: Spacing (3/4)

**Raw pixel spacing in Phase 13:**

`src/components/QuotaBanner.tsx`:
- Line 18: `padding: "8px 12px"`
- Line 20: `gap: "8px"`
- Line 22: `"margin-bottom": "8px"`
- Line 37: `padding: "4px 10px"`

All quota-exceeded screen spacing in `SidebarShell.tsx` correctly uses `var(--space-md)`, `var(--space-sm)`, `var(--space-xs)`. Raw spacing is isolated to QuotaBanner.

### Pillar 6: Experience Design (4/4 — PASS)

Exemplary state coverage:
- `showQuotaBanner()` guards against dismissed state AND hard-limit state simultaneously — no contradictory double-state
- `isQuotaExceeded()` gets a fully separate render branch — users never see the raw sentinel string
- `handleRefreshSubscription()` calls live Stripe API (not KV) — cannot be spoofed
- `setBannerDismissed(false)` in `onQuotaUpdate` resets dismiss on each new response — correct warning behavior
- Subscribed users (`isSubscribed()`) see no quota UI
- Both CTAs have `min-height: 44px` touch targets
- Upgrade (primary) vs Refresh Status (ghost) correctly reflects intended action hierarchy

**Minor nice-to-have (not scored):** When `handleRefreshSubscription()` gets a non-active status, no user feedback is shown. A "No active subscription found — try again after completing payment" message would reduce confusion.
