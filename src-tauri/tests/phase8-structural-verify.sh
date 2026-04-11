#!/usr/bin/env bash
# Phase 8 structural verification checks
# Each check greps implementation files for required behavioral patterns.
# Exits non-zero if any check fails.
# Run: bash /Users/subomi/Desktop/AI-Buddy/src-tauri/tests/phase8-structural-verify.sh

set -euo pipefail

PASS=0
FAIL=0

check() {
  local id="$1"
  local description="$2"
  local result="$3"   # "pass" or "fail"

  if [ "$result" = "pass" ]; then
    echo "PASS [$id] $description"
    PASS=$((PASS + 1))
  else
    echo "FAIL [$id] $description"
    FAIL=$((FAIL + 1))
  fi
}

WINDOW_RS="/Users/subomi/Desktop/AI-Buddy/src-tauri/src/window.rs"
SHORTCUT_RS="/Users/subomi/Desktop/AI-Buddy/src-tauri/src/shortcut.rs"
APP_CONTEXT_RS="/Users/subomi/Desktop/AI-Buddy/src-tauri/src/app_context.rs"
AI_TS="/Users/subomi/Desktop/AI-Buddy/src/lib/ai.ts"
SIDEBAR_TSX="/Users/subomi/Desktop/AI-Buddy/src/components/SidebarShell.tsx"

# ---------------------------------------------------------------------------
# GAP 1 (PLAT-01): toggle_overlay uses available_monitors(), not primary_monitor()
# The function toggle_overlay must call available_monitors.
# primary_monitor() IS allowed elsewhere (cmd_open_region_select uses it) but
# must not appear *inside* toggle_overlay. We verify both the positive pattern
# (available_monitors present) and that primary_monitor does not appear between
# the toggle_overlay fn declaration and the next pub fn.
# ---------------------------------------------------------------------------

# Check 1a: available_monitors appears in window.rs
if grep -q "available_monitors" "$WINDOW_RS"; then
  check "PLAT-01a" "toggle_overlay calls available_monitors() in window.rs" "pass"
else
  check "PLAT-01a" "toggle_overlay calls available_monitors() in window.rs" "fail"
fi

# Check 1b: primary_monitor() does NOT appear inside toggle_overlay body.
# Strategy: extract lines between "pub fn toggle_overlay" and the next "pub fn"
# and confirm primary_monitor is absent from that range.
# Use awk to print lines in the toggle_overlay block, stopping before the next top-level fn.
toggle_block=$(awk 'f && /^pub fn [a-z]/{exit} /^pub fn toggle_overlay/{f=1} f' "$WINDOW_RS")
if echo "$toggle_block" | grep -q "primary_monitor()"; then
  check "PLAT-01b" "toggle_overlay body does NOT call primary_monitor() (replaced by available_monitors)" "fail"
else
  check "PLAT-01b" "toggle_overlay body does NOT call primary_monitor() (replaced by available_monitors)" "pass"
fi

# ---------------------------------------------------------------------------
# GAP 2 (PLAT-01): toggle_overlay uses Physical units only — no Logical inside it
# tauri::Size::Logical and LogicalSize::new must be absent from toggle_overlay body.
# ---------------------------------------------------------------------------

# Check 2a: tauri::Size::Logical absent from toggle_overlay body
if echo "$toggle_block" | grep -q "tauri::Size::Logical"; then
  check "PLAT-01c" "toggle_overlay body does NOT use tauri::Size::Logical (Physical-only units)" "fail"
else
  check "PLAT-01c" "toggle_overlay body does NOT use tauri::Size::Logical (Physical-only units)" "pass"
fi

# Check 2b: LogicalSize::new absent from toggle_overlay body
if echo "$toggle_block" | grep -q "LogicalSize::new"; then
  check "PLAT-01d" "toggle_overlay body does NOT use LogicalSize::new (Physical-only units)" "fail"
else
  check "PLAT-01d" "toggle_overlay body does NOT use LogicalSize::new (Physical-only units)" "pass"
fi

# Check 2c: tauri::Size::Physical IS present in toggle_overlay body (positive confirmation)
if echo "$toggle_block" | grep -q "tauri::Size::Physical"; then
  check "PLAT-01e" "toggle_overlay body uses tauri::Size::Physical (all-Physical confirmed)" "pass"
else
  check "PLAT-01e" "toggle_overlay body uses tauri::Size::Physical (all-Physical confirmed)" "fail"
fi

# ---------------------------------------------------------------------------
# GAP 3 (PLAT-01): Both shortcut.rs call sites pass `app` as first argument
# Pattern: toggle_overlay(app, — must appear exactly 2 times in shortcut.rs
# ---------------------------------------------------------------------------

call_site_count=$(grep -c "toggle_overlay(app," "$SHORTCUT_RS" || true)
if [ "$call_site_count" -eq 2 ]; then
  check "PLAT-01f" "shortcut.rs has exactly 2 call sites with toggle_overlay(app, ...) pattern" "pass"
else
  check "PLAT-01f" "shortcut.rs has exactly 2 call sites with toggle_overlay(app, ...) pattern — found $call_site_count, expected 2" "fail"
fi

# Also verify old single-argument pattern toggle_overlay(&window) is gone from shortcut.rs
if grep -q "toggle_overlay(&window)" "$SHORTCUT_RS"; then
  check "PLAT-01g" "shortcut.rs has no legacy toggle_overlay(&window) single-arg call (old pattern removed)" "fail"
else
  check "PLAT-01g" "shortcut.rs has no legacy toggle_overlay(&window) single-arg call (old pattern removed)" "pass"
fi

# ---------------------------------------------------------------------------
# GAP 4 (CTX-03 compliance): app_context.rs never accesses .title field in production code
# The .title field access (win.title) must not appear in app_context.rs.
# Doc comment mentions "title" as a word but production code must not access win.title.
# ---------------------------------------------------------------------------

# Check that win.title field access pattern is absent
if grep -q "win\.title" "$APP_CONTEXT_RS"; then
  check "CTX-03a" "app_context.rs does NOT access win.title field (no Screen Recording permission leak)" "fail"
else
  check "CTX-03a" "app_context.rs does NOT access win.title field (no Screen Recording permission leak)" "pass"
fi

# Verify win.app_name IS accessed (positive — correct field used)
if grep -q "win\.app_name" "$APP_CONTEXT_RS"; then
  check "CTX-03b" "app_context.rs accesses win.app_name (correct field — no permission required)" "pass"
else
  check "CTX-03b" "app_context.rs accesses win.app_name (correct field — no permission required)" "fail"
fi

# ---------------------------------------------------------------------------
# GAP 5 (CTX-02): "currently working in" phrase in ai.ts system prompt construction
# ---------------------------------------------------------------------------

if grep -q "currently working in" "$AI_TS"; then
  check "CTX-02" "ai.ts system prompt construction contains 'currently working in' phrase for app context injection" "pass"
else
  check "CTX-02" "ai.ts system prompt construction contains 'currently working in' phrase for app context injection" "fail"
fi

# Also verify appContext field exists in StreamGuidanceOptions interface
if grep -q "appContext" "$AI_TS"; then
  check "CTX-02b" "ai.ts StreamGuidanceOptions interface declares appContext field" "pass"
else
  check "CTX-02b" "ai.ts StreamGuidanceOptions interface declares appContext field" "fail"
fi

# ---------------------------------------------------------------------------
# GAP 6 (CTX-01): detectedApp signal declared and wired in SidebarShell.tsx
# ---------------------------------------------------------------------------

# Check signal declaration
if grep -q "detectedApp" "$SIDEBAR_TSX"; then
  check "CTX-01a" "SidebarShell.tsx declares and references detectedApp signal" "pass"
else
  check "CTX-01a" "SidebarShell.tsx declares and references detectedApp signal" "fail"
fi

# Check signal is created with createSignal
if grep -q "createSignal.*detectedApp\|detectedApp.*createSignal" "$SIDEBAR_TSX"; then
  check "CTX-01b" "SidebarShell.tsx declares detectedApp via createSignal" "pass"
else
  # Try the destructuring pattern [detectedApp, setDetectedApp] = createSignal
  if grep -q "\[detectedApp" "$SIDEBAR_TSX"; then
    check "CTX-01b" "SidebarShell.tsx declares detectedApp via createSignal" "pass"
  else
    check "CTX-01b" "SidebarShell.tsx declares detectedApp via createSignal" "fail"
  fi
fi

# Check getActiveApp is called (wired to the signal)
if grep -q "getActiveApp" "$SIDEBAR_TSX"; then
  check "CTX-01c" "SidebarShell.tsx calls getActiveApp() — detectedApp is wired to OS detection" "pass"
else
  check "CTX-01c" "SidebarShell.tsx calls getActiveApp() — detectedApp is wired to OS detection" "fail"
fi

# Check detectedApp is passed to streamGuidance (appContext wiring)
if grep -q "detectedApp()" "$SIDEBAR_TSX"; then
  check "CTX-01d" "SidebarShell.tsx uses detectedApp() signal value (passed to streamGuidance/recordInteraction)" "pass"
else
  check "CTX-01d" "SidebarShell.tsx uses detectedApp() signal value (passed to streamGuidance/recordInteraction)" "fail"
fi

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
echo ""
echo "Results: $PASS passed, $FAIL failed"

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi

exit 0
